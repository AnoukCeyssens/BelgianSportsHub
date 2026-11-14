// Run sheet step 7, Schedules, part 2 (spec #20, stories 55, 61, 63 and 110;
// ticket #37): the owner pastes a timetable version of a Championship (or the
// Games' by-event schedule) through the paste importer's table reading and
// column mapping, with the timetable column roles. "Read" keeps the paste (or
// the fetched plain HTML page) as a raw copy; the review lists each event
// with its rounds and offers the Belgian Entries to name per event (Athletes
// and Teams of that sport, the competition's entrants, the Entries already named), each
// with the round it starts in after a bye. "Store" keeps the version stamp,
// names the Entries and replaces the previous version's Sessions with this
// version's Sessions, keeping only the rounds of events with a Belgian Entry.
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { Form } from "react-router";
import { type Db, getDb, schema } from "~/db/client";
import {
  belgianDate,
  canonicalSport,
  readHtmlTable,
  readPastedTable,
  readTimetable,
  sameSport,
  TIMETABLE_COLUMN_ROLES,
  timetableColumnMapping,
  type SavedTimetableMapping,
  type TimetableColumnRole,
  type TimetableRound,
  timetableText,
} from "~/domain";
import { formatDate, formatDayRange } from "~/format";
import { TIMETABLE_RAW_SOURCE as RAW_SOURCE } from "~/ingest/belgian-rows";
import { fetchAndKeep, keepRawCopy } from "~/ingest/raw-copy";
import { addVersion, fingerprintOf, LATEST_FIRST, replaceSessions, versionsOf } from "~/ingest/timetable-versions";

const STEP_PATH = "/curate/run/schedules";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ROLE_LABEL: Record<TimetableColumnRole, string> = {
  ignore: "(ignore)",
  date: "date",
  start: "start",
  end: "end",
  session: "session code",
  sport: "sport",
  event: "event",
  round: "round (or event + round)",
};

type CompetitionRow = typeof schema.competition.$inferSelect;

/** The Championships and Games not over yet, and each one's stored timetable version (with the one it replaced). */
export async function loadTimetables(db: Db, now: Date) {
  const c = schema.competition;
  const v = schema.timetableVersion;
  const competitions = await db
    .select({ id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, venueZone: c.venueZone })
    .from(c)
    .where(and(inArray(c.kind, ["championship", "games"]), gte(c.endDate, belgianDate(now))))
    .orderBy(asc(c.startDate), asc(c.name));
  const ids = competitions.map((x) => x.id);
  const versions = ids.length === 0 ? [] : await db.select().from(v).where(inArray(v.competitionId, ids)).orderBy(...LATEST_FIRST);
  const counts =
    ids.length === 0
      ? []
      : await db
          .select({ versionId: schema.session.timetableVersionId, competitionId: schema.session.competitionId })
          .from(schema.session)
          .where(inArray(schema.session.competitionId, ids));
  const stored = competitions.flatMap((x) => {
    const [latest, previous] = versions.filter((r) => r.competitionId === x.id);
    if (!latest) return [];
    return [
      {
        competition: x.name,
        version: latest.version,
        publishedOn: latest.publishedOn,
        sourceUrl: latest.sourceUrl,
        replaces: previous?.version ?? null,
        sessions: counts.filter((s) => s.versionId === latest.id).length,
        // Reopens the review on the stored version (a fetched timetable's only way to name its Entries).
        nameEntries: `${STEP_PATH}?${new URLSearchParams({
          timetable: x.id,
          raw: latest.rawCopyId,
          version: latest.version,
          ...(latest.publishedOn ? { publishedOn: latest.publishedOn } : {}),
          ...(latest.sourceUrl ? { sourceUrl: latest.sourceUrl } : {}),
        })}#timetable`,
      },
    ];
  });
  return { competitions, stored };
}

export type TimetablesData = Awaited<ReturnType<typeof loadTimetables>>;

/** The read timetable under review (`?timetable=<competition>&raw=<raw copy>`, with the typed stamp and any changed columns). */
export async function loadTimetableReview(env: Pick<Env, "DB" | "RAW">, db: Db, search: URLSearchParams) {
  const competitionId = search.get("timetable");
  const rawId = search.get("raw");
  if (!competitionId || !rawId) return null;
  const competition = await competitionOf(db, competitionId);
  const { copy, table } = await readRawCopy(env, db, rawId);
  const chosen = rolesFrom(search, table.head.length);
  const mapping = timetableColumnMapping(table.head, await savedMapping(db, competition));
  const roles = chosen ?? mapping.roles;
  const rounds = await withKnownSports(db, competition, readTimetable(table, roles, competition).rounds);
  const events = eventsOf(rounds);

  const [athletes, teams, entrants, entries] = await Promise.all([
    db.select({ id: schema.athlete.id, name: schema.athlete.name, sport: schema.athlete.sport }).from(schema.athlete).orderBy(asc(schema.athlete.name)),
    db
      .select({ id: schema.team.id, name: schema.team.name, sport: schema.team.sport, event: schema.team.event })
      .from(schema.team)
      .orderBy(asc(schema.team.name)),
    db.select({ athleteId: schema.entrant.athleteId }).from(schema.entrant).where(eq(schema.entrant.competitionId, competition.id)),
    db.select().from(schema.entry).where(eq(schema.entry.competitionId, competition.id)),
  ]);
  const entrantIds = new Set(entrants.map((e) => e.athleteId));
  const field = (name: string) => search.get(name) ?? "";
  return {
    competition: { id: competition.id, name: competition.name, days: `${formatDayRange(competition.startDate, competition.endDate)} ${competition.endDate.slice(0, 4)}` },
    rawCopyId: copy.id,
    stamp: { version: field("version"), publishedOn: field("publishedOn"), sourceUrl: field("sourceUrl"), venueZone: field("venueZone") || (competition.venueZone ?? "") },
    head: table.head,
    roles,
    mappingNote: chosen ? "as you set them" : mapping.fromSaved ? "saved mapping applied" : "guessed, check them",
    rowCount: table.rows.length,
    roundCount: rounds.length,
    events: events.map((e) => {
      const named = entries.filter((x) => x.event === e.event && sameSport(x.sport, e.sport));
      const ofSport = (sport: string) => sameSport(sport, e.sport);
      const candidate = (who: string, name: string, entry: (typeof named)[number] | undefined) => ({
        who,
        name,
        named: entry !== undefined,
        firstRound: entry?.firstRound ?? null,
      });
      return {
        ...e,
        candidates: [
          ...teams
            .filter((t) => ofSport(t.sport) || named.some((n) => n.teamId === t.id))
            .map((t) => candidate(`team:${t.id}`, `${t.name} (Team · ${t.event})`, named.find((n) => n.teamId === t.id))),
          ...athletes
            .filter((a) => ofSport(a.sport) || entrantIds.has(a.id) || named.some((n) => n.athleteId === a.id))
            .map((a) => candidate(`athlete:${a.id}`, a.name, named.find((n) => n.athleteId === a.id))),
        ],
      };
    }),
  };
}

export type TimetableReviewData = NonNullable<Awaited<ReturnType<typeof loadTimetableReview>>>;

/** Does one owner timetable action; returns the session-log message and where to go next. */
export async function actOnTimetable(env: Pick<Env, "DB" | "RAW">, intent: string, form: FormData, now: Date): Promise<{ message: string; to: string }> {
  const db = getDb(env.DB);
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const competition = await competitionOf(db, field("competition"));
  if (intent === "read-timetable") return read(env, competition, field, now);
  if (intent === "store-timetable") return store(env, db, competition, form, field, now);
  throw new Response(`Unknown action ${intent}`, { status: 400 });
}

async function read(env: Pick<Env, "DB" | "RAW">, competition: CompetitionRow, field: (name: string) => string, now: Date) {
  const text = field("text");
  const url = field("url");
  let rawCopyId: string;
  if (text !== "") {
    rawCopyId = await keepRawCopy(env, { source: RAW_SOURCE, url: url || field("sourceUrl") || `paste:${RAW_SOURCE}`, body: text, contentType: "text/plain; charset=utf-8", fetchedAt: now });
  } else if (url !== "") {
    try {
      rawCopyId = (await fetchAndKeep(env, RAW_SOURCE, url)).rawCopyId;
    } catch {
      return { message: `${competition.name}: the timetable page could not be read; copy the table from your browser instead`, to: STEP_PATH };
    }
  } else {
    throw new Response("Paste a URL or the timetable", { status: 400 });
  }
  const query = new URLSearchParams({ timetable: competition.id, raw: rawCopyId });
  for (const name of ["version", "publishedOn", "sourceUrl", "venueZone"]) if (field(name)) query.set(name, field(name));
  if (!field("sourceUrl") && url) query.set("sourceUrl", url);
  return { message: `${competition.name}: timetable read`, to: `${STEP_PATH}?${query}#timetable` };
}

async function store(env: Pick<Env, "DB" | "RAW">, db: Db, competition: CompetitionRow, form: FormData, field: (name: string) => string, now: Date) {
  const version = field("version");
  if (!version) throw new Response("Give the version stamp (e.g. v2)", { status: 400 });
  const publishedOn = field("publishedOn") || null;
  if (publishedOn !== null && !DATE.test(publishedOn)) throw new Response("The publication date must be a date (YYYY-MM-DD)", { status: 400 });
  const sourceUrl = field("sourceUrl") || null;
  const venueZone = field("venueZone") || competition.venueZone;
  if (!venueZone || !isZone(venueZone)) throw new Response("Give the venue's time zone (IANA, e.g. America/Los_Angeles)", { status: 400 });

  const { copy, table } = await readRawCopy(env, db, field("raw"));
  const roles = rolesFrom(form, table.head.length) ?? timetableColumnMapping(table.head, null).roles;
  const rounds = await withKnownSports(db, competition, readTimetable(table, roles, competition).rounds);
  const events = eventsOf(rounds);
  const checkedOn = belgianDate(now);

  // The Entries named per event: events in this paste are named afresh; Entries of other events stay.
  for (const [key, value] of form.entries()) {
    const m = key.match(/^event\.(\d+)$/);
    if (!m) continue;
    const event = events.find((e) => e.event === String(value));
    if (!event) continue;
    const ticked = form.getAll(`entry.${m[1]}`).map(String);
    await nameEntries(db, competition.id, event, ticked, (who) => field(`firstRound.${m[1]}.${who}`) || null, sourceUrl, checkedOn);
  }

  // Naming Entries on the stored version itself (a fetched timetable's "Name Entries") is no new version.
  const [latest] = await versionsOf(db, competition.id);
  const versionId =
    latest?.rawCopyId === copy.id
      ? latest.id
      : await addVersion(db, {
          competitionId: competition.id,
          version,
          publishedOn,
          sourceUrl,
          columnMapping: Object.fromEntries(table.head.map((h, i) => [h.trim().toLowerCase(), roles[i] ?? "ignore"])),
          rawCopyId: copy.id,
          fingerprint: await fingerprintOf(timetableText(rounds)),
          storedAt: now,
        });
  if (!competition.venueZone) await db.update(schema.competition).set({ venueZone }).where(eq(schema.competition.id, competition.id));

  // Belgian events only (story 63): the events named here, and any named before that this paste lacks (none of their rounds are in it).
  const { sessions } = await replaceSessions(db, competition.id, versionId, rounds, venueZone);
  return { message: `${competition.name}: timetable ${version} stored, ${sessions} Sessions with Belgian Entries`, to: STEP_PATH };
}

async function nameEntries(
  db: Db,
  competitionId: string,
  event: { sport: string; event: string; rounds: string[] },
  ticked: string[],
  firstRoundOf: (who: string) => string | null,
  sourceUrl: string | null,
  checkedOn: string,
) {
  const e = schema.entry;
  const existing = await db.select().from(e).where(and(eq(e.competitionId, competitionId), eq(e.event, event.event), eq(e.sport, event.sport)));
  const whoOf = (row: typeof e.$inferSelect) => (row.athleteId ? `athlete:${row.athleteId}` : `team:${row.teamId}`);
  const dropped = existing.filter((row) => !ticked.includes(whoOf(row)));
  if (dropped.length > 0) await db.delete(e).where(inArray(e.id, dropped.map((row) => row.id)));
  for (const who of ticked) {
    const [kind, id] = who.split(":");
    if ((kind !== "athlete" && kind !== "team") || !id) throw new Response(`Not an Entry: ${who}`, { status: 400 });
    const asked = firstRoundOf(who);
    // The first round is no bye; a round the timetable does not hold is ignored.
    const firstRound = asked && event.rounds.indexOf(asked) > 0 ? asked : null;
    const row = existing.find((r) => whoOf(r) === who);
    if (row) await db.update(e).set({ firstRound, sourceUrl, checkedOn }).where(eq(e.id, row.id));
    else
      await db.insert(e).values({
        competitionId,
        sport: event.sport,
        event: event.event,
        athleteId: kind === "athlete" ? id : null,
        teamId: kind === "team" ? id : null,
        firstRound,
        sourceUrl,
        checkedOn,
      });
  }
}

async function competitionOf(db: Db, id: string): Promise<CompetitionRow> {
  const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, id) });
  if (!competition || (competition.kind !== "championship" && competition.kind !== "games")) throw new Response("No such Championship or Games", { status: 404 });
  return competition;
}

/** The mapping saved with this competition's latest version, else with the latest version of a competition from the same source. */
async function savedMapping(db: Db, competition: CompetitionRow): Promise<SavedTimetableMapping | null> {
  const v = schema.timetableVersion;
  const c = schema.competition;
  const [own] = await db.select({ mapping: v.columnMapping }).from(v).where(eq(v.competitionId, competition.id)).orderBy(...LATEST_FIRST).limit(1);
  if (own?.mapping) return own.mapping as SavedTimetableMapping;
  const [sibling] = await db
    .select({ mapping: v.columnMapping })
    .from(v)
    .innerJoin(c, eq(v.competitionId, c.id))
    .where(eq(c.source, competition.source))
    .orderBy(...LATEST_FIRST)
    .limit(1);
  return (sibling?.mapping as SavedTimetableMapping | undefined) ?? null;
}

/**
 * Timetable sport names as the app knows them: "Athletics (Track & Field)"
 * becomes "Athletics", and at the Games the curated sport window's name
 * wins, so sport chips and per-sport phases find their Sessions.
 */
async function withKnownSports(db: Db, competition: CompetitionRow, rounds: TimetableRound[]): Promise<TimetableRound[]> {
  const windows =
    competition.kind === "games"
      ? (await db.select({ sport: schema.gamesSportWindow.sport }).from(schema.gamesSportWindow).where(eq(schema.gamesSportWindow.competitionId, competition.id))).map((w) => w.sport)
      : [competition.sport];
  return rounds.map((r) => {
    const plain = r.sport.replace(/\s*\(.*\)\s*$/, "").trim();
    return { ...r, sport: windows.find((w) => sameSport(w, r.sport)) ?? canonicalSport(r.sport) ?? plain };
  });
}

/** Each event in the timetable, once, with its rounds in time order. */
function eventsOf(rounds: readonly TimetableRound[]) {
  const ordered = [...rounds].sort((a, b) => `${a.date}T${a.start ?? "99:99"}`.localeCompare(`${b.date}T${b.start ?? "99:99"}`) || a.index - b.index);
  const events: { sport: string; event: string; rounds: string[] }[] = [];
  for (const r of ordered) {
    let e = events.find((x) => x.sport === r.sport && x.event === r.event);
    if (!e) events.push((e = { sport: r.sport, event: r.event, rounds: [] }));
    if (!e.rounds.includes(r.round)) e.rounds.push(r.round);
  }
  return events;
}

function isZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone.includes("/") || zone === "UTC";
  } catch {
    return false;
  }
}

function rolesFrom(fields: URLSearchParams | FormData, columns: number): TimetableColumnRole[] | null {
  if (fields.get("col.0") === null) return null;
  return Array.from({ length: columns }, (_, i) => {
    const role = String(fields.get(`col.${i}`) ?? "ignore");
    return (TIMETABLE_COLUMN_ROLES as readonly string[]).includes(role) ? (role as TimetableColumnRole) : "ignore";
  });
}

async function readRawCopy(env: Pick<Env, "RAW">, db: Db, rawId: string) {
  const copy = await db.query.rawCopy.findFirst({ where: and(eq(schema.rawCopy.id, rawId), eq(schema.rawCopy.source, RAW_SOURCE)) });
  if (!copy) throw new Response(`No raw copy ${rawId}`, { status: 404 });
  const object = await env.RAW.get(copy.r2Key);
  if (!object) throw new Response(`Raw copy ${rawId} is missing from R2`, { status: 500 });
  const body = await object.text();
  return { copy, table: copy.contentType?.includes("html") ? readHtmlTable(body) : readPastedTable(body) };
}

export function TimetablesPart({ data, review }: { data: TimetablesData; review: TimetableReviewData | null }) {
  return (
    <>
      <h2 id="timetable">Timetables</h2>
      <p className="sub">Paste each new timetable version of a Championship (or the Games' by-event schedule); only the rounds of events with a Belgian Entry are kept.</p>
      {data.stored.length > 0 ? (
        <table aria-label="Stored timetables">
          <tbody>
            {data.stored.map((s) => (
              <tr key={s.competition}>
                <td>
                  {[s.competition, s.version, s.publishedOn ? `published ${formatDate(s.publishedOn)}` : null, s.replaces ? `replaces ${s.replaces}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
                <td className="n">{`${s.sessions} Sessions`}</td>
                <td className="sub">{s.sourceUrl ? <a href={s.sourceUrl}>source</a> : null}</td>
                <td className="sub">
                  <a href={s.nameEntries}>Name Entries</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {data.competitions.length > 0 ? (
        <Form method="post" className="card timetable-paste">
          <div className="fields">
            <label className="wide">
              Competition
              <select name="competition" required defaultValue={review?.competition.id}>
                {data.competitions.map((c) => (
                  <option key={c.id} value={c.id}>{`${c.name} (${formatDayRange(c.startDate, c.endDate)} ${c.endDate.slice(0, 4)})`}</option>
                ))}
              </select>
            </label>
            <label>
              Version stamp
              <input name="version" required placeholder="v1" />
            </label>
            <label>
              Published
              <input type="date" name="publishedOn" />
            </label>
            <label>
              Venue time zone (if not known)
              <input name="venueZone" placeholder="America/Los_Angeles" />
            </label>
            <label className="wide">
              Source (the PDF or page)
              <input type="url" name="sourceUrl" placeholder="https://…" />
            </label>
            <label className="wide">
              URL of a plain HTML timetable
              <input type="url" name="url" placeholder="https://…" />
            </label>
            <label className="wide">
              or the timetable copied from the browser or PDF
              <textarea name="text" rows={6} />
            </label>
          </div>
          <div className="actions">
            <button type="submit" name="intent" value="read-timetable">
              Read timetable
            </button>
          </div>
        </Form>
      ) : (
        <p className="sub">No Championship or Games to come.</p>
      )}
      {review ? <Review review={review} /> : null}
    </>
  );
}

function Review({ review }: { review: TimetableReviewData }) {
  const { competition, stamp } = review;
  const keep: [string, string][] = [
    ["competition", competition.id],
    ["raw", review.rawCopyId],
    ["version", stamp.version],
    ["publishedOn", stamp.publishedOn],
    ["sourceUrl", stamp.sourceUrl],
    ["venueZone", stamp.venueZone],
  ];
  return (
    <>
      <Form method="get" className="maps">
        <input type="hidden" name="timetable" value={competition.id} />
        {keep.slice(1).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <h3>{`Columns (${review.mappingNote})`}</h3>
        {review.head.map((h, i) => (
          <label key={i}>
            {h}
            <select name={`col.${i}`} defaultValue={review.roles[i]}>
              {TIMETABLE_COLUMN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className="secondary">
          Apply columns
        </button>
      </Form>
      <Form method="post" className="card timetable-review" aria-label="Timetable review">
        <h3>{`${competition.name} · ${competition.days} · ${stamp.version || "no version stamp yet"}`}</h3>
        {keep.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {review.roles.map((r, i) => (
          <input key={`col.${i}`} type="hidden" name={`col.${i}`} value={r} />
        ))}
        <p>{`${review.roundCount} rounds read in ${review.events.length} events · tick the Belgian Entries; events without one are not kept`}</p>
        {review.events.map((e, i) => (
          <fieldset key={`${e.sport}:${e.event}`} className="timetable-event">
            <input type="hidden" name={`event.${i}`} value={e.event} />
            <legend>
              <b>{e.event}</b> <span className="sub">{`${e.rounds.join(" · ")}${review.events.some((x) => x.sport !== e.sport) ? ` · ${e.sport}` : ""}`}</span>
            </legend>
            {e.candidates.length === 0 ? <p className="sub">No Belgian Athlete or Team of this sport known.</p> : null}
            {e.candidates.map((c) => (
              <label key={c.who} className="entry-pick">
                <input type="checkbox" name={`entry.${i}`} value={c.who} defaultChecked={c.named} />
                {` ${c.name} `}
                {e.rounds.length > 1 ? (
                  <select name={`firstRound.${i}.${c.who}`} defaultValue={c.firstRound ?? ""} aria-label={`${c.name} starts in`}>
                    <option value="">{`starts in ${e.rounds[0]}`}</option>
                    {e.rounds.slice(1).map((r) => (
                      <option key={r} value={r}>{`bye to ${r}`}</option>
                    ))}
                  </select>
                ) : null}
              </label>
            ))}
          </fieldset>
        ))}
        <div className="actions">
          <button type="submit" name="intent" value="store-timetable">
            {`Store ${stamp.version || "this version"}`}
          </button>
        </div>
      </Form>
    </>
  );
}
