// Spec #20, stories 38, 96 and 109; GLOSSARY "Participation": Belgium taking
// part in a competition with at least one Entry.
// - confirmed: an entry list, start list, Selection or result names a Belgian
//   Entry (or the owner confirmed it by hand, having seen one);
// - likely: a Belgian Entry took part in the previous edition, is in
//   contention, or the owner added it by hand;
// - the owner can keep a likely one or drop it; a drop never hides a
//   competition a source names a Belgian Entry for.
// Facts are about Active Entries only (story 25); the caller filters.

import { BELGIAN_ZONE } from "./time-display";

export type ParticipationStatus = "confirmed" | "likely" | "none";

/** The owner's last word on a competition in the Selections & likely step. */
export type OwnerParticipationDecision = "added" | "confirmed" | "kept" | "dropped";

export type ParticipationFacts = {
  /** An entry list, start list, Selection or result names a Belgian Entry. */
  namedBelgianEntry: boolean;
  /** A Belgian Entry took part in the previous edition. */
  previousEdition: boolean;
  /** A Belgian Entry is in contention for it. */
  inContention: boolean;
  owner: OwnerParticipationDecision | null;
};

export type ParticipationReason = "named" | "confirmed-by-hand" | "previous-edition" | "in-contention" | "added-by-hand" | "kept";

export type Participation = { status: ParticipationStatus; why: ParticipationReason[] };

export function participation(facts: ParticipationFacts): Participation {
  if (facts.namedBelgianEntry) return { status: "confirmed", why: ["named"] };
  if (facts.owner === "confirmed") return { status: "confirmed", why: ["confirmed-by-hand"] };
  if (facts.owner === "dropped") return { status: "none", why: [] };
  const why: ParticipationReason[] = [];
  if (facts.previousEdition) why.push("previous-edition");
  if (facts.inContention) why.push("in-contention");
  if (facts.owner === "added") why.push("added-by-hand");
  else if (facts.owner === "kept" && why.length === 0) why.push("kept");
  return why.length > 0 ? { status: "likely", why } : { status: "none", why };
}

/** How far ahead the Selections & likely step looks. */
export const LIKELY_REVIEW_WEEKS = 6;
/** A check in the last six days counts for this week's session. */
const RECHECK_AFTER_MS = 6 * 86_400_000;

/**
 * Whether a likely Participation belongs in this week's Selections & likely
 * step: the competition has not ended (in Belgium) and starts within the next
 * six weeks, and the owner has not checked it in the last week.
 */
export function needsLikelyReview(c: { startDate: string; endDate: string; checkedAt: string | null }, now: Date): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BELGIAN_ZONE }).format(now);
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + LIKELY_REVIEW_WEEKS * 7 * 86_400_000).toISOString().slice(0, 10);
  if (c.endDate < today || c.startDate > horizon) return false;
  return c.checkedAt === null || now.getTime() - Date.parse(c.checkedAt) >= RECHECK_AFTER_MS;
}

/** Championships and the Games are always on the calendar; anything else only with a Participation. */
export function onCalendar(kind: "championship" | "games" | "circuit", status: ParticipationStatus): boolean {
  return kind !== "circuit" || status !== "none";
}
