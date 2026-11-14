import type { Db } from "~/db/client";
import { belgianDate, PHASE_LABELS, standardsForSports, type Phase } from "~/domain";
import { formatDate } from "~/format";
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
  | { phase: "qualification"; standards: PublishedStandards }
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
    case "qualification":
      return { phase, standards: standardsOf(competition, now, chips) };
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
          <p className="sub">No Qualification statuses recorded yet.</p>
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
