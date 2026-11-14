// Spec #20, stories 51–52 and 71–75 and the `verdict` / `impliedCounts` /
// `tally` rules; GLOSSARY "Verdict"; ticket #41.
// - The outcome is the IF's official final classification place
//   (`outcomeOf`); a shared place counts as its best place; no place at all
//   (DNF, DNS, DSQ, eliminated before a place is given) is Missed.
// - `verdict` compares one Expectation (a place or a place range) with the
//   outcome: Beat (better), Met (the place, or inside the range), Missed.
//   A personal pick for an Entry withdrawn before the picks lock
//   (`withdrawnBeforeLock`) is voided; an external Expectation (Seed,
//   Gracenote) of that Entry gets its normal Verdict: no place, Missed. A
//   withdrawal from the lock on (a DNS) is Missed for every source. No
//   Expectation (unpicked, added after the lock, no snapshot before the
//   start) = no Verdict.
// - `tally` counts Beat / Met / Missed per source; `impliedCounts` gives the
//   medal and top-8 counts a set of Expectations implies, a range counting
//   only when it lies wholly inside the band.
import type { PlaceRange } from "./expectations";

export const VERDICTS = ["beat", "met", "missed", "voided"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = { beat: "Beat", met: "Met", missed: "Missed", voided: "Voided" };

/** The Entry's outcome: its official place (null: none) and whether it was withdrawn before the lock. */
export type Outcome = { place: number | null; withdrawnBeforeLock: boolean };

/** Seeds and Gracenote are external Expectations; the owner's pick is personal (GLOSSARY "Expectation"). */
export type ExpectationKind = "external" | "personal";

export function verdict(expectation: PlaceRange | null, outcome: Outcome, kind: ExpectationKind): Verdict | null {
  if (!expectation) return null;
  if (outcome.withdrawnBeforeLock && kind === "personal") return "voided";
  if (outcome.place === null || outcome.place > expectation.to) return "missed";
  return outcome.place < expectation.from ? "beat" : "met";
}

/** Whether the Entry was withdrawn (ISO instant) before the picks locked. */
export function withdrawnBeforeLock(withdrawnAt: string | null, lockAt: Date): boolean {
  return withdrawnAt !== null && new Date(withdrawnAt) < lockAt;
}

/**
 * The official final classification place from the Entry's results in its
 * event: the latest-dated result (the final classification, not an earlier
 * round's); on one date the best place (a shared place counts as its best).
 * Null when there is none.
 */
export function outcomeOf(results: readonly { place: number | null; date: string }[]): number | null {
  const last = results.reduce<string | null>((d, r) => (d === null || r.date > d ? r.date : d), null);
  const places = results.filter((r) => r.date === last && r.place !== null).map((r) => r.place!);
  return places.length > 0 ? Math.min(...places) : null;
}

export type Tally = { beat: number; met: number; missed: number };

/** Beat / Met / Missed counts; voided and missing Verdicts are left out. */
export function tally(verdicts: readonly (Verdict | null)[]): Tally {
  const count = (v: Verdict) => verdicts.filter((x) => x === v).length;
  return { beat: count("beat"), met: count("met"), missed: count("missed") };
}

export type DelegationCounts = { medals: number; top8: number };

/** Medal and top-8 counts implied by Expectations (or outcomes, as one-place ranges): only a range wholly inside the band counts. */
export function impliedCounts(ranges: readonly (PlaceRange | null)[]): DelegationCounts {
  const inside = (band: number) => ranges.filter((r) => r !== null && r.to <= band).length;
  return { medals: inside(3), top8: inside(8) };
}

/**
 * Belgium's own medal and top-8 counts at a competition, from every Belgian
 * result there (not only the Selected Entries): each Entry's official place
 * in each event (`outcomeOf`, event names compared ignoring case) counts once.
 */
export function belgiumCounts(results: readonly { entry: string; event: string; place: number | null; date: string }[]): DelegationCounts {
  const byEntryEvent = new Map<string, { place: number | null; date: string }[]>();
  for (const r of results) {
    const key = `${r.entry}|${r.event.toLowerCase()}`;
    byEntryEvent.set(key, [...(byEntryEvent.get(key) ?? []), r]);
  }
  return impliedCounts([...byEntryEvent.values()].map((own) => outcomeOf(own)).map((place) => (place === null ? null : { from: place, to: place })));
}
