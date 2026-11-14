import { Link } from "react-router";
import { sportColour } from "~/calendar/sport-colours";
import type { Db } from "~/db/client";
import { belgianDate, PHASE_LABELS, QUALIFICATION_STATUS_LABELS, standardsForSports, windowCountdown, type Phase, type QualificationStatus } from "~/domain";
import { formatDate } from "~/format";
import { potentialEntries, type PotentialEntry } from "~/qualification/entries";
import { QualificationBadge, TrackMark } from "~/qualification/qualification-section";
import { LiveDayPanel, loadLiveDay, type LiveDayView } from "./live-panel";
import type { CompetitionRow } from "./phase-inputs";

// What each Phase shows on a competition page (spec #20, stories 43–48;
// ticket #31). One phase is shown at a time, so the page loads only the shown
// phase's data: `loadPhasePanel` returns one member of `PhasePanelData`, and
// `PhasePanel` renders it.
//
// Plugging in a phase's content (#32 Qualification, #34 Selection, #37/#38
// Live, #41 After, #35 for the Games):
// 1. widen that phase's member of `PhasePanelData` with what it shows;
// 2. load it in that phase's `case` of `loadPhasePanel` (batched queries; take
//    `now` from the caller, never read the clock here);
// 3. render it in that phase's component below, replacing the "not recorded
//    yet" line. Keep the `<section class="phase">` wrapper: tests find it.
// Games-only content (sport chips, medal table) takes the sport filter as an
// extra argument rather than a second set of panels: `SportChips` (#35) holds
// the Games' sports and the chosen chips (none chosen = All sports). Filter
// each phase's rows by `chips.chosen` as they arrive (Entries by their sport).

export type PublishedStandards = { expectedOn: string | null; publishedOn: string | null; url: string | null; lines: string[] };

export type PhasePanelData =
  | { phase: "standards"; standards: PublishedStandards }
  | {
      phase: "qualification";
      standards: PublishedStandards;
      /** When the qualification window closes (YYYY-MM-DD) and the days left; null when not recorded. */
      closesOn: string | null;
      closesIn: number | null;
      /** Active potential Entries with their tracks (ticket #32), filtered by the chosen sport chips. */
      entries: PotentialEntry[];
      /** At the Games each Entry shows its sport's colour. */
      games: boolean;
    }
  | { phase: "selection" }
  | { phase: "live"; day: LiveDayView | null }
  | { phase: "after" };

/** A Games' sports and the chosen chips; none chosen means All sports. A Championship has none. */
export type SportChips = { sports: readonly string[]; chosen: readonly string[] };

const NO_CHIPS: SportChips = { sports: [], chosen: [] };

/** `day` is the Live day asked for (`?day=`), venue-local YYYY-MM-DD. */
export async function loadPhasePanel(
  db: Db,
  competition: CompetitionRow,
  phase: Phase,
  now: Date,
  chips: SportChips = NO_CHIPS,
  day: string | null = null,
): Promise<PhasePanelData> {
  switch (phase) {
    case "standards":
      return { phase, standards: standardsOf(competition, now, chips) };
    case "qualification": {
      const entries = await potentialEntries(db, [competition.id], now);
      const chosen = chips.chosen.map((s) => s.toLowerCase());
      return {
        phase,
        standards: standardsOf(competition, now, chips),
        closesOn: competition.qualificationClosesOn,
        closesIn: windowCountdown(competition.qualificationClosesOn, now),
        entries: chosen.length > 0 ? entries.filter((e) => chosen.includes(e.sport.toLowerCase())) : entries,
        games: competition.kind === "games",
      };
    }
    case "live":
      return { phase, day: await loadLiveDay(db, competition, now, chips.chosen, day) };
    case "selection":
    case "after":
      return { phase };
  }
}

/** The recorded standards; only the expected date until they are published. Lines headed by a sport not chosen are left out. */
function standardsOf(c: CompetitionRow, now: Date, chips: SportChips): PublishedStandards {
  const published = c.standardsPublishedOn !== null && c.standardsPublishedOn <= belgianDate(now);
  const lines = (c.standardsText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return published
    ? {
        expectedOn: null,
        publishedOn: c.standardsPublishedOn,
        url: c.standardsUrl,
        lines: standardsForSports(lines, chips.sports, chips.chosen),
      }
    : { expectedOn: c.standardsExpectedOn, publishedOn: null, url: null, lines: [] };
}

/** `dayHref` links a Live day (`?day=`), keeping the page's other choices. */
export function PhasePanel({ data, dayHref }: { data: PhasePanelData; dayHref: (date: string) => string }) {
  return (
    <section className="phase" aria-label={PHASE_LABELS[data.phase]}>
      {data.phase === "standards" ? <Standards standards={data.standards} /> : null}
      {data.phase === "qualification" ? (
        <>
          {data.standards.publishedOn ? (
            <>
              <h3>Standards</h3>
              <StandardLines lines={data.standards.lines} />
            </>
          ) : null}
          <Qualification data={data} />
        </>
      ) : null}
      {data.phase === "selection" ? <p className="sub">No Selection recorded yet.</p> : null}
      {data.phase === "live" ? data.day ? <LiveDayPanel view={data.day} dayHref={dayHref} /> : <p className="sub">No Sessions recorded yet.</p> : null}
      {data.phase === "after" ? <p className="sub">No outcomes compared yet.</p> : null}
    </section>
  );
}

/** Spec stories 43 and 44: no stand-in criteria before publication; the published standards stay visible. */
function Standards({ standards }: { standards: PublishedStandards }) {
  if (!standards.publishedOn) {
    return (
      <p className="note">
        {standards.expectedOn ? `Standards expected ${formatDate(standards.expectedOn)}.` : "Publication date of the standards not known yet."}
      </p>
    );
  }
  return (
    <>
      <p className="meta">
        {`Published ${formatDate(standards.publishedOn)}`}
        {standards.url ? (
          <>
            {" · "}
            <a href={standards.url}>source</a>
          </>
        ) : null}
      </p>
      <StandardLines lines={standards.lines} />
    </>
  );
}

function StandardLines({ lines }: { lines: string[] }) {
  return lines.length > 0 ? (
    <ul className="standards">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  ) : null;
}

/** Best standing first, for the counts line. */
const COUNT_ORDER: readonly QualificationStatus[] = ["selected", "qualified", "eligible", "on-track", "at-risk", "not-in-contention", "not-selected", "withdrawn"];

/** "1 qualified · 2 on track · 1 at risk": the count of each status, best standing first. */
function statusCounts(entries: PotentialEntry[]) {
  return COUNT_ORDER.map((status) => [status, entries.filter((e) => e.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${QUALIFICATION_STATUS_LABELS[status].toLowerCase()}`)
    .join(" · ");
}

/** Spec story 45: each potential Entry with its tracks (✓ / ✗ / pending) and its status badge. */
function Qualification({ data }: { data: Extract<PhasePanelData, { phase: "qualification" }> }) {
  return (
    <>
      <h3>Qualification</h3>
      {data.closesOn ? (
        <p className="note">
          {`Qualification window closes ${formatDate(data.closesOn)}`}
          {data.closesIn !== null && data.closesIn >= 0 ? ` · ${data.closesIn} days left` : " · closed"}
        </p>
      ) : null}
      {data.entries.length > 0 ? (
        <>
          <p className="meta">{statusCounts(data.entries)}</p>
          <table aria-label="Potential Entries">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Qualification tracks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    {data.games ? <span className="dot" style={{ background: sportColour(e.sport) }}></span> : null}
                    <Link to={e.who.kind === "team" ? `/teams/${e.who.id}` : `/athletes/${e.who.id}`}>{e.who.name}</Link>
                    <div className="sub">{e.event}</div>
                  </td>
                  <td>
                    {e.tracks.map((t) => (
                      <div key={t.id}>
                        <TrackMark state={t.state} /> {t.name} <span className="sub">{`need ${t.needed} · has ${t.has}`}</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <QualificationBadge status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="sub">No Qualification statuses recorded yet.</p>
      )}
    </>
  );
}
