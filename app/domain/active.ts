// GLOSSARY "Active" and "Hold"; spec #20, stories 18–23. An Athlete or Team
// is Active while its latest senior international performance is under 12
// months old (Belgian date), or while a Hold is in place. Only appearing in
// the official result counts: DNF and DSQ do, DNS does not. Retirement (for a
// Team, dissolution) makes it inactive at once, until a later performance
// clears it; a change of sporting nationality makes it inactive until the
// owner clears it by hand. Both win over a Hold. A Team's status is its own,
// independent of its roster members.
import { belgianDate } from "./monthly-checklist";

export type ActiveEntity = { kind: "athlete" | "team" };

/** One senior international performance: a result's date (YYYY-MM-DD) and status. */
export type ActivePerformance = { date: string; status: "finished" | "eliminated" | "DNF" | "DSQ" | "DNS" | (string & {}) };

/** The owner's curated facts (YYYY-MM-DD each). `retiredOn` is a Team's "dissolved on". */
export type ActiveFacts = {
  holdUntil?: string | null;
  retiredOn?: string | null;
  nationalityChangedOn?: string | null;
};

export type ActiveReason = "recent-performance" | "hold" | "no-recent-performance" | "retired" | "dissolved" | "nationality-change";

export type ActiveStatus = {
  active: boolean;
  because: ActiveReason;
  /** The latest performance that counts, when there is one. */
  latestPerformanceOn?: string;
};

export function activeStatus(entity: ActiveEntity, performances: ActivePerformance[], facts: ActiveFacts, now: Date): ActiveStatus {
  const today = belgianDate(now);
  const latest = performances
    .filter((p) => p.status.toUpperCase() !== "DNS")
    .map((p) => p.date)
    .sort()
    .at(-1);
  const status = (active: boolean, because: ActiveReason): ActiveStatus =>
    latest === undefined ? { active, because } : { active, because, latestPerformanceOn: latest };

  if (facts.nationalityChangedOn && facts.nationalityChangedOn <= today) return status(false, "nationality-change");
  const { retiredOn } = facts;
  if (retiredOn && retiredOn <= today && !(latest !== undefined && latest > retiredOn)) {
    return status(false, entity.kind === "team" ? "dissolved" : "retired");
  }
  if (facts.holdUntil && facts.holdUntil >= today) return status(true, "hold");
  if (latest !== undefined && latest > twelveMonthsBefore(today)) return status(true, "recent-performance");
  return status(false, "no-recent-performance");
}

export function isActive(entity: ActiveEntity, performances: ActivePerformance[], facts: ActiveFacts, now: Date): boolean {
  return activeStatus(entity, performances, facts, now).active;
}

/** The same calendar day a year earlier; 29 February falls back to 28 February. */
function twelveMonthsBefore(isoDate: string): string {
  const year = String(Number(isoDate.slice(0, 4)) - 1).padStart(4, "0");
  const monthDay = isoDate.slice(5) === "02-29" ? "02-28" : isoDate.slice(5);
  return `${year}-${monthDay}`;
}
