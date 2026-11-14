// Spec #20, stories 41–46 and the `currentPhase` rule; GLOSSARY "Phase" and
// "Session"; ticket #31. Every Championship and the Games (and, from #35, each
// Games sport) moves through five Phases in order. The current one follows
// from a few phase inputs and the time:
// - Standards until the standards are published;
// - Qualification until the first Entry is Selected;
// - Selection until the first Session starts (midnight venue time on day one
//   when no Session with a start time is known);
// - Live until the last competition day ends at the venue;
// - After from then on.
// The later inputs win: a competition that has started is Live even when no
// standards or Selection were ever recorded.
import { belgianDate } from "./monthly-checklist";
import { BELGIAN_ZONE, zonedWallClockToInstant } from "./time-display";

export const PHASES = ["standards", "qualification", "selection", "live", "after"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  standards: "Standards",
  qualification: "Qualification",
  selection: "Selection",
  live: "Live",
  after: "After",
};

/**
 * What the phase depends on. For a Games sport (#35), pass that sport's first
 * and last days, Selection and first Session instead of the Games' own.
 */
export type PhaseInputs = {
  /** First and last competition day, YYYY-MM-DD, venue-local. */
  startDate: string;
  endDate: string;
  /** IANA zone of the venue; Belgian time when unknown. */
  venueZone: string | null;
  /** YYYY-MM-DD (Belgian date) the qualification system or entry standards were published; null until then. */
  standardsPublishedOn: string | null;
  /** YYYY-MM-DD (Belgian date) the first Entry was Selected; null while none is (Selection, #34). */
  firstSelectedOn: string | null;
  /**
   * Start of the earliest Session, venue-local "YYYY-MM-DDTHH:mm" (Sessions,
   * #37); null when no Session with a start time is known, and day one then
   * starts at midnight venue time.
   */
  firstSessionStart: string | null;
};

export function currentPhase(competition: PhaseInputs, now: Date): Phase {
  const zone = competition.venueZone ?? BELGIAN_ZONE;
  const liveFrom = zonedWallClockToInstant(competition.firstSessionStart ?? `${competition.startDate}T00:00`, zone);
  const afterFrom = zonedWallClockToInstant(`${dayAfter(competition.endDate)}T00:00`, zone);
  const today = belgianDate(now);
  if (now >= afterFrom) return "after";
  if (now >= liveFrom) return "live";
  if (competition.firstSelectedOn !== null && competition.firstSelectedOn <= today) return "selection";
  if (competition.standardsPublishedOn !== null && competition.standardsPublishedOn <= today) return "qualification";
  return "standards";
}

/**
 * The phase a page shows: the one asked for (`?phase=`) when it is the
 * current phase or an earlier one, otherwise the current phase. Later phases
 * have nothing to show yet.
 */
export function phaseToShow(asked: string | null, current: Phase): Phase {
  const index = PHASES.indexOf(asked as Phase);
  return index >= 0 && index <= PHASES.indexOf(current) ? PHASES[index] : current;
}

function dayAfter(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
