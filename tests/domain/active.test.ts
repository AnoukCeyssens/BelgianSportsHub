import { describe, expect, it } from "vitest";
import { activeStatus, isActive, type ActiveFacts, type ActivePerformance } from "~/domain";

// GLOSSARY "Active" and "Hold"; spec #20, stories 18–23 and 26. Active while
// the latest senior international performance is under 12 months old (only
// appearing in the official result counts: DNF and DSQ do, DNS does not), or
// while a Hold is in place. Retirement (a Team's dissolution) makes the Entry
// inactive at once until a later performance; a change of sporting
// nationality makes it inactive until the owner clears it.
const NOW = new Date("2026-11-14T10:00:00Z"); // Belgian date 2026-11-14
const athlete = { kind: "athlete" } as const;
const team = { kind: "team" } as const;
const ran = (date: string, status: ActivePerformance["status"] = "finished"): ActivePerformance => ({ date, status });
const none: ActiveFacts = {};

describe("activeStatus", () => {
  it.each([
    { name: "no performance at all: inactive", entity: athlete, performances: [], facts: none, expected: { active: false, because: "no-recent-performance" } },
    {
      name: "a performance yesterday: active",
      entity: athlete,
      performances: [ran("2026-11-13")],
      facts: none,
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-11-13" },
    },
    {
      name: "a performance one day short of 12 months ago: active",
      entity: athlete,
      performances: [ran("2025-11-15")],
      facts: none,
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2025-11-15" },
    },
    {
      name: "a performance exactly 12 months ago: inactive",
      entity: athlete,
      performances: [ran("2025-11-14")],
      facts: none,
      expected: { active: false, because: "no-recent-performance", latestPerformanceOn: "2025-11-14" },
    },
    {
      name: "the latest performance counts, not the first",
      entity: athlete,
      performances: [ran("2026-05-01"), ran("2019-03-02")],
      facts: none,
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-05-01" },
    },
    {
      name: "a DNF counts as a performance",
      entity: athlete,
      performances: [ran("2026-08-01", "DNF")],
      facts: none,
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-08-01" },
    },
    {
      name: "a DSQ counts as a performance",
      entity: athlete,
      performances: [ran("2026-08-01", "DSQ")],
      facts: none,
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-08-01" },
    },
    {
      name: "a DNS does not count",
      entity: athlete,
      performances: [ran("2026-08-01", "DNS"), ran("2024-02-01")],
      facts: none,
      expected: { active: false, because: "no-recent-performance", latestPerformanceOn: "2024-02-01" },
    },
    {
      name: "a Hold until a later date keeps an Athlete with no recent performance active",
      entity: athlete,
      performances: [ran("2025-01-10")],
      facts: { holdUntil: "2027-03-31" },
      expected: { active: true, because: "hold", latestPerformanceOn: "2025-01-10" },
    },
    {
      name: "a Hold until today still holds",
      entity: athlete,
      performances: [],
      facts: { holdUntil: "2026-11-14" },
      expected: { active: true, because: "hold" },
    },
    {
      name: "after the Hold's date the 12-month rule applies again",
      entity: athlete,
      performances: [ran("2025-01-10")],
      facts: { holdUntil: "2026-11-13" },
      expected: { active: false, because: "no-recent-performance", latestPerformanceOn: "2025-01-10" },
    },
    {
      name: "retired last month: inactive at once, despite a recent performance",
      entity: athlete,
      performances: [ran("2026-09-20")],
      facts: { retiredOn: "2026-10-01" },
      expected: { active: false, because: "retired", latestPerformanceOn: "2026-09-20" },
    },
    {
      name: "retired on the day of the last performance: still retired",
      entity: athlete,
      performances: [ran("2026-10-01")],
      facts: { retiredOn: "2026-10-01" },
      expected: { active: false, because: "retired", latestPerformanceOn: "2026-10-01" },
    },
    {
      name: "a performance after the retirement clears it (comeback)",
      entity: athlete,
      performances: [ran("2026-11-02")],
      facts: { retiredOn: "2026-10-01" },
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-11-02" },
    },
    {
      name: "a retirement announced for a later date: active until then",
      entity: athlete,
      performances: [ran("2026-09-20")],
      facts: { retiredOn: "2026-12-31" },
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-09-20" },
    },
    {
      name: "a retirement wins over a Hold",
      entity: athlete,
      performances: [],
      facts: { retiredOn: "2026-10-01", holdUntil: "2027-01-01" },
      expected: { active: false, because: "retired" },
    },
    {
      name: "a change of sporting nationality: inactive, despite a recent performance",
      entity: athlete,
      performances: [ran("2026-09-20")],
      facts: { nationalityChangedOn: "2026-10-01" },
      expected: { active: false, because: "nationality-change", latestPerformanceOn: "2026-09-20" },
    },
    {
      name: "a later performance does not clear a change of sporting nationality",
      entity: athlete,
      performances: [ran("2026-11-02")],
      facts: { nationalityChangedOn: "2026-10-01" },
      expected: { active: false, because: "nationality-change", latestPerformanceOn: "2026-11-02" },
    },
    {
      name: "a change of sporting nationality wins over a Hold",
      entity: athlete,
      performances: [],
      facts: { nationalityChangedOn: "2026-10-01", holdUntil: "2027-01-01" },
      expected: { active: false, because: "nationality-change" },
    },
    {
      name: "a Team with a recent performance: active",
      entity: team,
      performances: [ran("2026-07-01")],
      facts: none,
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-07-01" },
    },
    {
      name: "a dissolved Team: inactive at once",
      entity: team,
      performances: [ran("2026-07-01")],
      facts: { retiredOn: "2026-08-15" },
      expected: { active: false, because: "dissolved", latestPerformanceOn: "2026-07-01" },
    },
    {
      name: "a dissolved partnership that competes again is active again",
      entity: team,
      performances: [ran("2026-10-20")],
      facts: { retiredOn: "2026-08-15" },
      expected: { active: true, because: "recent-performance", latestPerformanceOn: "2026-10-20" },
    },
    {
      name: "a Team on a Hold: active",
      entity: team,
      performances: [],
      facts: { holdUntil: "2027-06-30" },
      expected: { active: true, because: "hold" },
    },
  ])("$name", ({ entity, performances, facts, expected }) => {
    expect(activeStatus(entity, performances, facts, NOW)).toEqual(expected);
    expect(isActive(entity, performances, facts, NOW)).toBe(expected.active);
  });

  it("uses the Belgian date: just after midnight in Brussels a performance 12 months back to the day no longer counts", () => {
    // 2026-11-13T23:30Z is already 2026-11-14 in Brussels.
    expect(isActive(athlete, [ran("2025-11-14")], none, new Date("2026-11-13T23:30:00Z"))).toBe(false);
    expect(isActive(athlete, [ran("2025-11-14")], none, new Date("2026-11-13T22:30:00Z"))).toBe(true);
  });

  it("on 29 February the window opens on 28 February a year earlier", () => {
    const leapDay = new Date("2028-02-29T10:00:00Z");
    expect(isActive(athlete, [ran("2027-02-28")], none, leapDay)).toBe(false);
    expect(isActive(athlete, [ran("2027-03-01")], none, leapDay)).toBe(true);
  });
});
