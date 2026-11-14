// The Live phase (spec #20, stories 47, 49 and 55–59; tickets #37 and #38): a
// day picker over the competition days (days with Belgian Entries marked),
// the shown day's Sessions, one line per Belgian Entry in a round, Belgian
// time first, and the medal table with Belgium highlighted. Each Entry sits
// in every round of its event it can still reach (`loadPlacedRounds`); later
// rounds are greyed "if through", pool matches "match TBD"; optional heat or
// match detail and results show where the Live day pass recorded them.
import { asc, eq } from "drizzle-orm";
import { Link } from "react-router";
import { type Db, schema } from "~/db/client";
import {
  BELGIAN_ZONE,
  belgiumMedals,
  dayToShow,
  liveDays,
  medalTable,
  sameSport,
  toDisplayTime,
  venueLabel,
  type LiveDay,
  type MedalCount,
  type MedalResult,
  type MedalTableRow,
  type RoundOutcome,
  type RoundState,
} from "~/domain";
import { formatDate, formatInstant, placeText } from "~/format";
import type { CompetitionRow } from "./phase-inputs";
import { detailText, loadPlacedRounds, type EventResultRow } from "./placed-rounds";

export type LiveRow = {
  key: string;
  /** Belgian wall-clock time, or null when the timetable gives none. */
  belgianTime: string | null;
  /** Weekday in Belgium when it is not the venue's day ("Mon"). */
  belgianDay: string | null;
  /** "18:30 LA" when the venue clock differs. */
  venueTime: string | null;
  code: string | null;
  who: string;
  href: string | null;
  event: string;
  round: string;
  state: RoundState;
  /** "Heat 2 · lane 4 · v LI Wen (CHN)", when given. */
  detail: string | null;
  /** "through", "out", or the final result ("Silver · 43.10"). */
  outcome: string | null;
  medal: 1 | 2 | 3 | null;
};

export type LiveDayView = {
  days: (LiveDay & { label: string })[];
  day: string;
  rows: LiveRow[];
  timetable: { version: string; publishedOn: string | null } | null;
};

const weekday = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const dayLabel = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MEDAL_WORD = ["Gold", "Silver", "Bronze"] as const;

function medalOf(result: EventResultRow | null): 1 | 2 | 3 | null {
  return result && result.status === "finished" && result.place !== null && result.place <= 3 ? (result.place as 1 | 2 | 3) : null;
}

/** "Silver · 43.10", "6th · 5.80", "DNF". */
function resultText(result: EventResultRow) {
  const medal = medalOf(result);
  const place = medal ? MEDAL_WORD[medal - 1] : result.status === "eliminated" && result.place === null ? "out" : placeText(result.place, result.status);
  return [place, result.performance].filter(Boolean).join(" · ");
}

const OUTCOME_TEXT: Record<RoundOutcome, string> = { advanced: "through", eliminated: "out" };

/** The Live day view, for the chosen sports only (none chosen: every sport); null before any Session is stored. */
export async function loadLiveDay(db: Db, competition: CompetitionRow, now: Date, chosen: readonly string[], askedDay: string | null): Promise<LiveDayView | null> {
  const { sessions, placed } = await loadPlacedRounds(db, competition, chosen);
  if (sessions.length === 0) return null;
  const version = await db.query.timetableVersion.findFirst({ where: eq(schema.timetableVersion.id, sessions[0].timetableVersionId) });
  const label = venueLabel(competition.city);

  const days = liveDays(competition.startDate, competition.endDate, placed.map((p) => p.session.date));
  const day = dayToShow(askedDay, days, now, competition.venueZone ?? BELGIAN_ZONE);
  const rows = placed
    .filter((p) => p.session.date === day)
    .map((p) => {
      // An exact start from the start list beats the Session's start.
      const venueStart = p.detail?.startsAt ? `${p.session.date}T${p.detail.startsAt}` : p.session.startsAt;
      return { p, venueStart };
    })
    .sort((a, b) => (a.venueStart ?? "~").localeCompare(b.venueStart ?? "~") || a.p.who.localeCompare(b.p.who))
    .map(({ p, venueStart }): LiveRow => {
      const shown = venueStart ? toDisplayTime(venueStart, p.session.venueZone, label) : null;
      const detail = detailText(p.detail);
      return {
        key: p.key,
        belgianTime: shown?.belgianTime ?? null,
        belgianDay: shown && shown.belgianDate !== p.session.date ? weekday(shown.belgianDate) : null,
        venueTime: shown?.venueTime ? `${shown.venueTime} ${label}` : null,
        code: p.session.code,
        who: p.who,
        href: p.href,
        event: p.entry.event,
        round: p.round,
        state: p.state,
        detail: detail ? capitalised(detail) : null,
        outcome: p.last && p.result ? resultText(p.result) : p.outcome ? OUTCOME_TEXT[p.outcome] : null,
        medal: p.last ? medalOf(p.result) : null,
      };
    });
  return {
    days: days.map((d) => ({ ...d, label: dayLabel(d.date) })),
    day,
    rows,
    timetable: version ? { version: version.version, publishedOn: version.publishedOn } : null,
  };
}

export type MedalTableView =
  /** All sports: the medal table, the other nations as last pasted. */
  | { kind: "table"; rows: MedalTableRow[]; pastedAt: string | null }
  /** Sport chips chosen: Belgium's medals in those sports only. */
  | { kind: "belgium"; sports: string[]; count: MedalCount; medals: { key: string; medal: 1 | 2 | 3; who: string; href: string | null; event: string }[] };

/** The medal table; with sport chips chosen, Belgium's medals in those sports only. */
export async function loadMedalTable(db: Db, competition: CompetitionRow, chosen: readonly string[]): Promise<MedalTableView> {
  const r = schema.result;
  const rows = await db
    .select({ result: r, athlete: schema.athlete.name, team: schema.team.name, queued: schema.mergeQueueItem.name })
    .from(r)
    .leftJoin(schema.athlete, eq(r.athleteId, schema.athlete.id))
    .leftJoin(schema.team, eq(r.teamId, schema.team.id))
    .leftJoin(schema.mergeQueueItem, eq(r.mergeQueueItemId, schema.mergeQueueItem.id))
    .where(eq(r.competitionId, competition.id))
    .orderBy(asc(r.date), asc(r.place));
  const inSports = rows.filter(({ result }) => chosen.length === 0 || chosen.some((c) => sameSport(c, result.sport ?? competition.sport)));
  const medalResults: MedalResult[] = inSports.map(({ result }) => ({
    competitionId: result.competitionId,
    competitionKind: competition.kind,
    event: result.event,
    place: result.place,
    status: result.status,
    entry: result.teamId ? { kind: "team", teamId: result.teamId, roster: [] } : { kind: "athlete", athleteId: result.athleteId ?? result.mergeQueueItemId ?? result.id },
  }));
  const count = belgiumMedals(medalResults);

  if (chosen.length > 0) {
    const medals = inSports
      .map(({ result, athlete, team, queued }) => ({ result, who: athlete ?? team ?? queued ?? "", medal: medalOf(result) }))
      .filter((m): m is typeof m & { medal: 1 | 2 | 3 } => m.medal !== null && competition.kind !== "circuit")
      .map(({ result, who, medal }) => ({
        key: result.id,
        medal,
        who,
        href: result.athleteId ? `/athletes/${result.athleteId}` : result.teamId ? `/teams/${result.teamId}` : null,
        event: result.event,
      }))
      .sort((a, b) => a.medal - b.medal);
    return { kind: "belgium", sports: [...chosen], count, medals };
  }
  const standings = await db.select().from(schema.medalStanding).where(eq(schema.medalStanding.competitionId, competition.id));
  return { kind: "table", rows: medalTable(standings, count), pastedAt: standings[0]?.pastedAt ?? null };
}

const STATE_NOTE: Record<RoundState, string | null> = { scheduled: null, "if-through": "if through", "match-tbd": "match TBD" };

function Medal({ medal }: { medal: 1 | 2 | 3 }) {
  return <span className={`medal m${medal}`}>{"GSB"[medal - 1]}</span>;
}

export function LiveDayPanel({ view, dayHref }: { view: LiveDayView; dayHref: (date: string) => string }) {
  const shown = view.days.find((d) => d.date === view.day)!;
  return (
    <>
      {view.timetable ? (
        <p className="note">
          {`Timetable ${view.timetable.version}${view.timetable.publishedOn ? ` of ${formatDate(view.timetable.publishedOn)}` : ""} · subject to change · Belgian time first`}
        </p>
      ) : null}
      <nav className="days" aria-label="Days">
        {view.days.map((d) => (
          <Link key={d.date} to={dayHref(d.date)} className={["day", d.marked ? "has" : null, d.date === view.day ? "on" : null].filter(Boolean).join(" ")}
            aria-current={d.date === view.day ? "date" : undefined}
          >
            <span>{`Day ${d.day}`}</span> <b>{d.label}</b>
            {d.marked ? <span className="sr-only"> · Belgian Entries</span> : null}
          </Link>
        ))}
      </nav>
      <h3>{`Day ${shown.day} · ${shown.label}`}</h3>
      {view.rows.length === 0 ? (
        <p className="sub">No Belgian Entries this day.</p>
      ) : (
        <table aria-label="Sessions">
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.key} className={r.state === "scheduled" ? undefined : r.state}>
                <td className="when">
                  {r.belgianTime ? <b>{r.belgianTime}</b> : <span className="sub">time TBA</span>}
                  {r.belgianDay ? <small>{` ${r.belgianDay}`}</small> : null}
                  {r.venueTime ? <span className="sub">{` · ${r.venueTime}`}</span> : null}
                  {r.code ? <div className="sub">{r.code}</div> : null}
                </td>
                <td>
                  {r.href ? <Link to={r.href}>{r.who}</Link> : r.who}
                  <div className="sub">{[r.event, r.round, r.detail].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="n">
                  {r.outcome ? (
                    <>
                      {r.medal ? <Medal medal={r.medal} /> : null}
                      {r.medal ? " " : null}
                      <b>{r.outcome}</b>
                    </>
                  ) : (
                    <span className="sub">{STATE_NOTE[r.state]}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function MedalTablePanel({ view, title = "Medal table" }: { view: MedalTableView; title?: string }) {
  if (view.kind === "belgium") {
    return (
      <>
        <h3>{`Belgium's medals · ${view.sports.join(", ")}`}</h3>
        <table aria-label="Medal table">
          <thead>
            <tr>
              <th />
              <MedalHeads />
            </tr>
          </thead>
          <tbody>
            <tr className="bel">
              <td>Belgium</td>
              <td className="n">{view.count.gold}</td>
              <td className="n">{view.count.silver}</td>
              <td className="n">{view.count.bronze}</td>
            </tr>
          </tbody>
        </table>
        {view.medals.length > 0 ? (
          <table aria-label="Belgium's medals">
            <tbody>
              {view.medals.map((m) => (
                <tr key={m.key}>
                  <td>
                    <Medal medal={m.medal} /> {MEDAL_WORD[m.medal - 1]}
                  </td>
                  <td>
                    {m.href ? <Link to={m.href}>{m.who}</Link> : m.who}
                    <div className="sub">{m.event}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </>
    );
  }
  return (
    <>
      <h3>{title}</h3>
      {view.pastedAt ? <p className="note">{`Other nations as of ${formatInstant(view.pastedAt)} · Belgium from its own results`}</p> : null}
      <table aria-label="Medal table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nation</th>
            <MedalHeads />
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.nation} className={r.belgium ? "bel" : undefined}>
              <td>{r.rank}</td>
              <td>{r.nation}</td>
              <td className="n">{r.gold}</td>
              <td className="n">{r.silver}</td>
              <td className="n">{r.bronze}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function MedalHeads() {
  return (
    <>
      <th className="n">
        <Medal medal={1} />
      </th>
      <th className="n">
        <Medal medal={2} />
      </th>
      <th className="n">
        <Medal medal={3} />
      </th>
    </>
  );
}
