import { describe, expect, it } from "vitest";
import { impliedCounts, outcomeOf, tally, verdict, withdrawnBeforeLock } from "~/domain";

// Spec #20, stories 71–75, 51–52 and the `verdict` / `impliedCounts` / `tally`
// rules; GLOSSARY "Verdict"; ticket #41. The outcome is the IF's official final
// classification place, a shared place counting as its best place; no place
// (DNF, DNS, DSQ, eliminated before a place is given) is Missed. A pick for an
// Entry withdrawn before the lock is voided; an unpicked Entry has no Verdict.
// A range counts toward a medal or top-8 total only when wholly inside it.

const finished = (place: number | null) => ({ place, withdrawnBeforeLock: false });

describe("verdict", () => {
  it.each([
    { name: "a better place than an exact place is Beat", expected: { from: 5, to: 5 }, place: 3, verdict: "beat" },
    { name: "the exact place is Met", expected: { from: 5, to: 5 }, place: 5, verdict: "met" },
    { name: "a worse place than an exact place is Missed", expected: { from: 5, to: 5 }, place: 6, verdict: "missed" },
    { name: "equal 5th against a 5th–8th pick is Met (worked case)", expected: { from: 5, to: 8 }, place: 5, verdict: "met" },
    { name: "inside a range is Met", expected: { from: 5, to: 8 }, place: 8, verdict: "met" },
    { name: "above a range is Beat", expected: { from: 5, to: 8 }, place: 4, verdict: "beat" },
    { name: "below a range is Missed", expected: { from: 5, to: 8 }, place: 9, verdict: "missed" },
    { name: "gold against a medal pick is Met", expected: { from: 1, to: 3 }, place: 1, verdict: "met" },
    { name: "no place (DNF, DNS, DSQ) is Missed", expected: { from: 1, to: 3 }, place: null, verdict: "missed" },
  ] as const)("$name", ({ expected, place, verdict: v }) => {
    expect(verdict(expected, finished(place))).toBe(v);
  });

  it("voids an Expectation for an Entry withdrawn before the lock (worked case)", () => {
    expect(verdict({ from: 1, to: 3 }, { place: null, withdrawnBeforeLock: true })).toBe("voided");
  });

  it("gives no Verdict without an Expectation (unpicked, or added after the lock)", () => {
    expect(verdict(null, finished(1))).toBeNull();
    expect(verdict(null, { place: null, withdrawnBeforeLock: true })).toBeNull();
  });
});

describe("withdrawnBeforeLock", () => {
  const lock = new Date("2026-12-02T08:30:00.000Z");
  it.each([
    { name: "not withdrawn", at: null, expected: false },
    { name: "withdrawn the day before", at: "2026-12-01T17:00:00.000Z", expected: true },
    { name: "withdrawn a minute before the first Session", at: "2026-12-02T08:29:00.000Z", expected: true },
    { name: "withdrawn as the first Session starts (DNS after the lock: Missed)", at: "2026-12-02T08:30:00.000Z", expected: false },
    { name: "withdrawn during the competition", at: "2026-12-04T10:00:00.000Z", expected: false },
  ])("$name", ({ at, expected }) => {
    expect(withdrawnBeforeLock(at, lock)).toBe(expected);
  });
});

describe("outcomeOf", () => {
  it.each([
    { name: "no result: no place", results: [], place: null },
    { name: "the official place", results: [{ place: 5, date: "2026-12-03" }], place: 5 },
    { name: "a DNF has no place", results: [{ place: null, date: "2026-12-03" }], place: null },
    { name: "the final classification, not an earlier round's", results: [{ place: 12, date: "2026-12-02" }, { place: 4, date: "2026-12-03" }], place: 4 },
    { name: "a shared place counts as its best (equal 5th is 5th)", results: [{ place: 6, date: "2026-12-03" }, { place: 5, date: "2026-12-03" }], place: 5 },
  ])("$name", ({ results, place }) => {
    expect(outcomeOf(results)).toBe(place);
  });
});

describe("tally", () => {
  it("counts Beat, Met and Missed; voided picks and missing Verdicts are left out", () => {
    expect(tally(["beat", "met", "met", "missed", "voided", null, "missed"])).toEqual({ beat: 1, met: 2, missed: 2 });
    expect(tally([])).toEqual({ beat: 0, met: 0, missed: 0 });
  });
});

describe("impliedCounts", () => {
  it.each([
    { name: "gold, silver and a medal pick are medals and top 8", ranges: [{ from: 1, to: 1 }, { from: 2, to: 2 }, { from: 1, to: 3 }], counts: { medals: 3, top8: 3 } },
    { name: "a final pick (1st–8th) is top 8 but no medal", ranges: [{ from: 1, to: 8 }], counts: { medals: 0, top8: 1 } },
    { name: "a range reaching outside the medals is no medal (2nd–4th)", ranges: [{ from: 2, to: 4 }], counts: { medals: 0, top8: 1 } },
    { name: "a range reaching outside the top 8 counts for neither (5th–12th)", ranges: [{ from: 5, to: 12 }], counts: { medals: 0, top8: 0 } },
    { name: "missing Expectations count for nothing", ranges: [null, { from: 8, to: 8 }], counts: { medals: 0, top8: 1 } },
  ])("$name", ({ ranges, counts }) => {
    expect(impliedCounts(ranges)).toEqual(counts);
  });
});
