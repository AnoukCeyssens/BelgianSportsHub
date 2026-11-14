// The Live day pass's own steps (spec #20, stories 56, 58, 112 and 113;
// ticket #38), run daily while a competition with Belgian Entries is Live:
// - Today & tomorrow: each round a Belgian Entry may compete in today or
//   tomorrow (venue days), for its optional heat or match detail (heat, lane,
//   opponent, exact start) from the start list or draw, or "none published";
// - Today's results: each round that has started and has no outcome yet:
//   through, out, or the final result (written as a Belgian `result`), then
//   the medal table of the day (other nations as pasted; Belgium is counted).
// Merge queue and Source health (problems only) reuse the weekly steps.
import { and, eq, max } from "drizzle-orm";
import { Form } from "react-router";
import { detailText, liveCompetitions, loadPlacedRounds, type PlacedRound } from "~/competition/placed-rounds";
import type { CompetitionRow } from "~/competition/phase-inputs";
import { type Db, getDb, schema } from "~/db/client";
import { BELGIAN_ZONE, belgianDate, isBelgium, readMedalTable, toDisplayTime, venueLabel, wallClockIn } from "~/domain";
import { formatInstant, placeText } from "~/format";
import { belgianRows } from "~/ingest/belgian-rows";
import { keepRawCopy } from "~/ingest/raw-copy";

/** Results the owner records in the day pass are the owner's rows (source "owner"). */
const OWNER_SOURCE = "owner";

type LiveRound = {
  key: string;
  competition: string;
  entryId: string;
  round: string;
  title: string;
  when: string;
  state: PlacedRound["state"];
  last: boolean;
  detail: string | null;
};

const shortDay = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

function nextDay(isoDate: string) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** The placed rounds of every Live competition, one per Entry and round (a round spread over Sessions counts once). */
async function liveRounds(db: Db, now: Date) {
  const competitions = await liveCompetitions(db, now);
  const all = await Promise.all(
    competitions.map(async (competition) => {
      const { placed } = await loadPlacedRounds(db, competition);
      const seen = new Set<string>();
      const once = placed.filter((p) => {
        const k = `${p.entry.id}\n${p.round}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });
      return { competition, venueNow: wallClockIn(now, competition.venueZone ?? BELGIAN_ZONE), placed: once };
    }),
  );
  return { competitions, all };
}

function liveRound(competition: CompetitionRow, p: PlacedRound): LiveRound {
  const start = p.detail?.startsAt ? `${p.session.date}T${p.detail.startsAt}` : p.session.startsAt;
  const time = start ? toDisplayTime(start, p.session.venueZone, venueLabel(competition.city)).text : "time TBA";
  const detail = [detailText(p.detail), p.detail?.startsAt].filter(Boolean).join(" · ");
  return {
    key: `${p.entry.id}\n${p.round}`,
    competition: competition.name,
    entryId: p.entry.id,
    round: p.round,
    title: `${p.who} · ${p.entry.event} · ${p.round}`,
    when: `${shortDay(p.session.date)} · ${time}`,
    state: p.state,
    last: p.last,
    detail: detail || null,
  };
}

export async function loadTodayTomorrow(db: Db, now: Date) {
  const { all } = await liveRounds(db, now);
  const rounds = all.flatMap(({ competition, venueNow, placed }) => {
    const days = [venueNow.slice(0, 10), nextDay(venueNow.slice(0, 10))];
    return placed.filter((p) => days.includes(p.session.date) && !p.outcome && !p.result).map((p) => ({ p, round: liveRound(competition, p) }));
  });
  const items = rounds.filter(({ p }) => !p.detailCheckedAt).map(({ round }) => round);
  const checked = rounds.filter(({ p }) => p.detailCheckedAt).map(({ round }) => round);
  return { live: all.length > 0, items, checked, open: items.length };
}

export type TodayTomorrowData = Awaited<ReturnType<typeof loadTodayTomorrow>>;

export async function loadTodaysResults(db: Db, now: Date) {
  const { all } = await liveRounds(db, now);
  const items = all.flatMap(({ competition, venueNow, placed }) =>
    placed
      .filter((p) => {
        const start = p.detail?.startsAt ? `${p.session.date}T${p.detail.startsAt}` : (p.session.startsAt ?? p.session.date);
        return start.slice(0, 10) <= venueNow.slice(0, 10) && start <= venueNow && p.state !== "if-through" && !p.outcome && !p.result;
      })
      .map((p) => liveRound(competition, p)),
  );
  const today = belgianDate(now);
  const ms = schema.medalStanding;
  const pasted = await Promise.all(
    all
      .filter(({ competition }) => competition.kind !== "circuit")
      .map(async ({ competition }) => {
        const [row] = await db.select({ at: max(ms.pastedAt) }).from(ms).where(eq(ms.competitionId, competition.id));
        return { id: competition.id, name: competition.name, pastedAt: row?.at ?? null };
      }),
  );
  const medalTables = pasted.map((m) => ({ ...m, due: m.pastedAt === null || belgianDate(new Date(m.pastedAt)) < today }));
  return { live: all.length > 0, items, medalTables, open: items.length + medalTables.filter((m) => m.due).length };
}

export type TodaysResultsData = Awaited<ReturnType<typeof loadTodaysResults>>;

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

async function entryOf(db: Db, form: FormData) {
  const e = schema.entry;
  const [row] = await db
    .select({ entry: e, who: schema.athlete.name, team: schema.team.name, competition: schema.competition })
    .from(e)
    .innerJoin(schema.competition, eq(e.competitionId, schema.competition.id))
    .leftJoin(schema.athlete, eq(e.athleteId, schema.athlete.id))
    .leftJoin(schema.team, eq(e.teamId, schema.team.id))
    .where(eq(e.id, field(form, "entry")));
  const round = field(form, "round");
  if (!row || !round) throw new Response("No such Entry or round", { status: 404 });
  return { ...row, who: row.who ?? row.team ?? "", round };
}

type Attachment = Partial<Pick<typeof schema.entryRound.$inferInsert, "outcome" | "heat" | "lane" | "opponent" | "startsAt" | "detailCheckedAt">>;

async function attach(db: Db, entryId: string, round: string, values: Attachment, now: Date) {
  const updatedAt = now.toISOString();
  await db
    .insert(schema.entryRound)
    .values({ entryId, round, ...values, updatedAt })
    .onConflictDoUpdate({ target: [schema.entryRound.entryId, schema.entryRound.round], set: { ...values, updatedAt } });
}

/** Saves a round's heat or match detail, or that none is published; returns the session-log message. */
export async function actOnRoundDetail(db: Db, intent: string, form: FormData, now: Date): Promise<string> {
  const { entry, who, round } = await entryOf(db, form);
  const title = `${who} · ${entry.event} · ${round}`;
  if (intent === "no-detail") {
    await attach(db, entry.id, round, { detailCheckedAt: now.toISOString() }, now);
    return `${title}: no detail published`;
  }
  if (intent !== "save-detail") throw new Response(`Unknown action ${intent}`, { status: 400 });
  const start = field(form, "start");
  if (start && !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) throw new Response("The start must be a venue time, HH:mm", { status: 400 });
  const detail = { heat: field(form, "heat") || null, lane: field(form, "lane") || null, opponent: field(form, "opponent") || null, startsAt: start || null };
  await attach(db, entry.id, round, { ...detail, detailCheckedAt: now.toISOString() }, now);
  return `${title}: ${[detailText(detail), detail.startsAt].filter(Boolean).join(" · ") || "no detail"}`;
}

/** Records a round's outcome or the final result, or stores the pasted medal table; returns the session-log message. */
export async function actOnTodaysResult(env: Pick<Env, "DB" | "RAW">, intent: string, form: FormData, now: Date): Promise<string> {
  const db = getDb(env.DB);
  if (intent === "medal-table") return storeMedalTable(env, form, now);
  const { entry, who, round, competition } = await entryOf(db, form);
  const label = `${who}: ${entry.event} · ${round}`;
  if (intent === "through") {
    await attach(db, entry.id, round, { outcome: "advanced" }, now);
    return `${label} through`;
  }
  if (intent !== "out" && intent !== "final") throw new Response(`Unknown action ${intent}`, { status: 400 });

  const typed = { place: field(form, "place"), performance: field(form, "performance"), sourceUrl: field(form, "sourceUrl") };
  if (typed.place && !/^[1-9]\d*$/.test(typed.place)) throw new Response("The place must be a whole number", { status: 400 });
  const final = intent === "final";
  if (final && !typed.place && !typed.performance) throw new Response("Give a place or a performance", { status: 400 });
  if (!final) await attach(db, entry.id, round, { outcome: "eliminated" }, now);
  if (!typed.place && !typed.performance) return `${label} out`;
  if (!/^https?:\/\/\S+$/.test(typed.sourceUrl)) throw new Response("The source URL must be a web address", { status: 400 });

  // The day of the round (its last Session), venue-local.
  const [day] = await db
    .select({ date: max(schema.session.date) })
    .from(schema.session)
    .innerJoin(schema.sessionRound, eq(schema.sessionRound.sessionId, schema.session.id))
    .where(and(eq(schema.session.competitionId, competition.id), eq(schema.sessionRound.event, entry.event), eq(schema.sessionRound.round, round)));
  const rawCopyId = await keepRawCopy(env, {
    source: OWNER_SOURCE,
    url: typed.sourceUrl,
    body: JSON.stringify({ entry: entry.id, round, ...typed, intent }),
    contentType: "application/json",
    fetchedAt: now,
  });
  const place = typed.place ? Number(typed.place) : null;
  const result = {
    competitionId: competition.id,
    event: entry.event,
    // A Games spans every sport: its results carry theirs.
    sport: competition.kind === "games" ? entry.sport : null,
    date: day?.date ?? belgianDate(now),
    place,
    status: final ? ("finished" as const) : ("eliminated" as const),
    performance: typed.performance || null,
    // One result per Entry: recording it again corrects it.
    sourceRef: `live/${entry.id}`,
    rawCopyId,
  };
  const writer = belgianRows(env, OWNER_SOURCE, now);
  if (entry.athleteId) await writer.result({ ...result, athleteId: entry.athleteId });
  else {
    const roster = await db
      .select({ athleteId: schema.rosterMember.athleteId })
      .from(schema.rosterMember)
      .where(and(eq(schema.rosterMember.teamId, entry.teamId!), eq(schema.rosterMember.competitionId, competition.id)));
    await writer.result({ ...result, teamId: entry.teamId!, roster: roster.flatMap((r) => (r.athleteId ? [r.athleteId] : [])) });
  }
  return final ? `${who}: ${entry.event} final result ${placeText(place, "finished")}` : `${label} out, ${placeText(place, "eliminated")}`;
}

async function storeMedalTable(env: Pick<Env, "DB" | "RAW">, form: FormData, now: Date): Promise<string> {
  const db = getDb(env.DB);
  const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, field(form, "competition")) });
  if (!competition) throw new Response("No such competition", { status: 404 });
  const text = String(form.get("text") ?? "");
  const sourceUrl = field(form, "sourceUrl");
  if (!/^https?:\/\/\S+$/.test(sourceUrl)) throw new Response("The source URL must be a web address", { status: 400 });
  const others = readMedalTable(text).filter((s) => !isBelgium(s.nation));
  if (others.length === 0) throw new Response("No nation with three medal counts was read", { status: 400 });
  const rawCopyId = await keepRawCopy(env, { source: "medal-table", url: sourceUrl, body: text, contentType: "text/plain", fetchedAt: now });
  const pastedAt = now.toISOString();
  await db.delete(schema.medalStanding).where(eq(schema.medalStanding.competitionId, competition.id));
  // A pasted table may name a nation twice (a footnote line): the last line wins.
  const byNation = new Map(others.map((s) => [s.nation, s]));
  await db.insert(schema.medalStanding).values([...byNation.values()].map((s) => ({ competitionId: competition.id, ...s, pastedAt, rawCopyId })));
  return `${competition.name}: medal table stored, ${byNation.size} other nations`;
}

const NOT_LIVE = <p className="sub">No competition with Belgian Entries is Live today.</p>;

export function TodayTomorrowStep({ data }: { data: TodayTomorrowData }) {
  if (!data.live) return NOT_LIVE;
  return (
    <>
      {data.items.map((item) => (
        <Form method="post" className="card" key={item.key}>
          <h3>{item.title}</h3>
          <p className="sub">{`${item.competition} · ${item.when}${item.state === "if-through" ? " · if through" : ""}`}</p>
          <input type="hidden" name="entry" value={item.entryId} />
          <input type="hidden" name="round" value={item.round} />
          <div className="fields">
            <label>
              Heat or group
              <input name="heat" size={6} placeholder="2" />
            </label>
            <label>
              Lane or table
              <input name="lane" size={4} placeholder="4" />
            </label>
            <label>
              Opponent
              <input name="opponent" size={16} placeholder="LI Wen (CHN)" />
            </label>
            <label>
              Start, venue time
              <input name="start" type="time" />
            </label>
          </div>
          <div className="actions">
            <button type="submit" name="intent" value="save-detail">
              Save detail
            </button>
            <button type="submit" name="intent" value="no-detail" className="secondary">
              None published
            </button>
          </div>
        </Form>
      ))}
      {data.checked.length > 0 ? (
        <div className="card">
          <h3>Checked</h3>
          <ul>
            {data.checked.map((item) => (
              <li key={item.key}>{`${item.title}: ${item.detail ?? "no detail published"}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="sub">
        A new timetable version? Store it in <a href="/curate/run/schedules">Schedules</a>.
      </p>
    </>
  );
}

export function TodaysResultsStep({ data }: { data: TodaysResultsData }) {
  if (!data.live) return NOT_LIVE;
  return (
    <>
      {data.items.map((item) => (
        <Form method="post" className="card" key={item.key}>
          <h3>{item.title}</h3>
          <p className="sub">{`${item.competition} · ${item.when}${item.detail ? ` · ${item.detail}` : ""}`}</p>
          <input type="hidden" name="entry" value={item.entryId} />
          <input type="hidden" name="round" value={item.round} />
          <div className="fields">
            <label>
              Place
              <input name="place" inputMode="numeric" pattern="[1-9][0-9]*" size={4} />
            </label>
            <label>
              Performance
              <input name="performance" size={10} />
            </label>
            <label className="wide">
              Source URL (the results page), for a place or performance
              <input name="sourceUrl" type="url" placeholder="https://…" />
            </label>
          </div>
          <div className="actions">
            {item.last ? (
              <button type="submit" name="intent" value="final">
                Final result
              </button>
            ) : (
              <button type="submit" name="intent" value="through">
                Through
              </button>
            )}
            <button type="submit" name="intent" value="out" className="secondary">
              Out
            </button>
          </div>
        </Form>
      ))}
      {data.medalTables.map((m) => (
        <Form method="post" className="card" key={m.id}>
          <h3>{`${m.name}: medal table`}</h3>
          <p className="sub">
            {m.pastedAt ? `Last pasted ${formatInstant(m.pastedAt)}` : "Not pasted yet"} · Belgium's row is counted from its own results
          </p>
          <input type="hidden" name="competition" value={m.id} />
          <div className="fields">
            <label className="wide">
              Paste the medal table (one nation per line: gold, silver, bronze)
              <textarea name="text" rows={6} required />
            </label>
            <label className="wide">
              Source URL
              <input name="sourceUrl" type="url" required placeholder="https://…/medals" />
            </label>
          </div>
          <div className="actions">
            <button type="submit" name="intent" value="medal-table">
              Store medal table
            </button>
          </div>
        </Form>
      ))}
    </>
  );
}
