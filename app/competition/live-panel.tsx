// The Live phase's day view (spec #20, stories 47, 55–57 and 59; ticket #37):
// a day picker over the competition days (days with Belgian Entries marked)
// and the shown day's Sessions, one line per Belgian Entry in a round, Belgian
// time first. Each Entry sits in every round of its event from the one it
// starts in (`roundsFor`); later rounds are greyed "if through", pool matches
// "match TBD". #38 adds results, heat detail and the medal table here.
import { asc, eq, inArray } from "drizzle-orm";
import { Link } from "react-router";
import { type Db, schema } from "~/db/client";
import { BELGIAN_ZONE, dayToShow, liveDays, roundsFor, toDisplayTime, venueLabel, type LiveDay, type RoundState } from "~/domain";
import { formatDate } from "~/format";
import type { CompetitionRow } from "./phase-inputs";

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

/** The Live day view, for the chosen sports only (none chosen: every sport); null before any Session is stored. */
export async function loadLiveDay(db: Db, competition: CompetitionRow, now: Date, chosen: readonly string[], askedDay: string | null): Promise<LiveDayView | null> {
  const s = schema.session;
  const sessions = await db.select().from(s).where(eq(s.competitionId, competition.id)).orderBy(asc(s.date), asc(s.startsAt));
  if (sessions.length === 0) return null;
  const [rounds, entries, version] = await Promise.all([
    db.select().from(schema.sessionRound).where(inArray(schema.sessionRound.sessionId, sessions.map((x) => x.id))).orderBy(asc(schema.sessionRound.position)),
    db
      .select({ entry: schema.entry, athlete: schema.athlete.name })
      .from(schema.entry)
      .leftJoin(schema.athlete, eq(schema.entry.athleteId, schema.athlete.id))
      .where(eq(schema.entry.competitionId, competition.id)),
    db.query.timetableVersion.findFirst({ where: eq(schema.timetableVersion.id, sessions[0].timetableVersionId) }),
  ]);
  const sessionById = new Map(sessions.map((x) => [x.id, x]));
  // Every round of every event, in time order (sessions are ordered; rounds keep their place in the Session).
  const timed = rounds
    .map((r) => ({ ...r, session: sessionById.get(r.sessionId)! }))
    .sort((a, b) => sessions.indexOf(a.session) - sessions.indexOf(b.session) || a.position - b.position);
  const label = venueLabel(competition.city);
  const placed = entries
    .filter(({ entry }) => chosen.length === 0 || chosen.includes(entry.sport))
    .flatMap(({ entry, athlete }) =>
      roundsFor(
        entry,
        timed.filter((r) => r.event === entry.event && r.session.sport === entry.sport),
      ).map((r) => ({ r, entry, who: athlete ?? "Team" })),
    );

  const days = liveDays(competition.startDate, competition.endDate, placed.map((p) => p.r.session.date));
  const day = dayToShow(askedDay, days, now, competition.venueZone ?? BELGIAN_ZONE);
  const rows = placed
    .filter((p) => p.r.session.date === day)
    .sort((a, b) => (a.r.session.startsAt ?? "~").localeCompare(b.r.session.startsAt ?? "~") || a.who.localeCompare(b.who))
    .map(({ r, entry, who }): LiveRow => {
      const shown = r.session.startsAt ? toDisplayTime(r.session.startsAt, r.session.venueZone, label) : null;
      return {
        key: `${r.id}:${entry.id}`,
        belgianTime: shown?.belgianTime ?? null,
        belgianDay: shown && shown.belgianDate !== r.session.date ? weekday(shown.belgianDate) : null,
        venueTime: shown?.venueTime ? `${shown.venueTime} ${label}` : null,
        code: r.session.code,
        who,
        href: entry.athleteId ? `/athletes/${entry.athleteId}` : entry.teamId ? `/teams/${entry.teamId}` : null,
        event: entry.event,
        round: r.round,
        state: r.state,
      };
    });
  return {
    days: days.map((d) => ({ ...d, label: dayLabel(d.date) })),
    day,
    rows,
    timetable: version ? { version: version.version, publishedOn: version.publishedOn } : null,
  };
}

const STATE_NOTE: Record<RoundState, string | null> = { scheduled: null, "if-through": "if through", "match-tbd": "match TBD" };

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
          <Link key={d.date} to={dayHref(d.date)} className={["day", d.marked ? "has" : null, d.date === view.day ? "on" : null].filter(Boolean).join(" ")}>
            <span>{`Day ${d.day}`}</span> <b>{d.label}</b>
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
                  <div className="sub">{`${r.event} · ${r.round}`}</div>
                </td>
                <td className="n sub">{STATE_NOTE[r.state]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
