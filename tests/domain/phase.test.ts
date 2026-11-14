import { describe, expect, it } from "vitest";
import { currentPhase, phaseToShow, type PhaseInputs } from "~/domain";

// Spec #20, stories 41–46 and the `currentPhase` rule; GLOSSARY "Phase" and
// "Session"; ticket #31. Standards until the standards are published,
// Qualification until the first Entry is Selected, Selection until the first
// Session starts (midnight venue time on day one when there is none), Live
// until the last competition day ends, then After.

// World Athletics Championships, Beijing, 11–19 Sep 2027 (UTC+8, no DST).
const beijing: PhaseInputs = {
  startDate: "2027-09-11",
  endDate: "2027-09-19",
  venueZone: "Asia/Shanghai",
  standardsPublishedOn: null,
  firstSelectedOn: null,
  firstSessionStart: null,
};
const published = { ...beijing, standardsPublishedOn: "2026-10-01" };
const selected = { ...published, firstSelectedOn: "2027-08-27" };
const scheduled = { ...selected, firstSessionStart: "2027-09-11T07:30" };

describe("currentPhase", () => {
  it.each([
    { name: "Standards while the standards are not published", competition: beijing, now: "2026-11-14T12:00:00Z", expected: "standards" },
    {
      name: "Standards when the recorded publication date is still to come",
      competition: { ...beijing, standardsPublishedOn: "2026-12-01" },
      now: "2026-11-14T12:00:00Z",
      expected: "standards",
    },
    { name: "Qualification once the standards are published", competition: published, now: "2026-11-14T12:00:00Z", expected: "qualification" },
    {
      name: "Qualification on the day before the first Selection",
      competition: selected,
      now: "2027-08-26T12:00:00Z",
      expected: "qualification",
    },
    {
      name: "Selection from the Belgian date of the first Selected Entry (00:30 in Brussels)",
      competition: selected,
      now: "2027-08-26T22:30:00Z",
      expected: "selection",
    },
    { name: "Selection one minute before the first Session (07:30 Beijing)", competition: scheduled, now: "2027-09-10T23:29:00Z", expected: "selection" },
    { name: "Live at the first Session's start", competition: scheduled, now: "2027-09-10T23:30:00Z", expected: "live" },
    {
      name: "without a Session, still Selection one minute before midnight venue time on day one",
      competition: selected,
      now: "2027-09-10T15:59:00Z",
      expected: "selection",
    },
    { name: "without a Session, Live from midnight venue time on day one", competition: selected, now: "2027-09-10T16:00:00Z", expected: "live" },
    { name: "Live until the last competition day ends at the venue", competition: scheduled, now: "2027-09-19T15:59:00Z", expected: "live" },
    { name: "After once the last competition day has ended at the venue", competition: scheduled, now: "2027-09-19T16:00:00Z", expected: "after" },
    {
      name: "Live even when no standards or Selection were ever recorded",
      competition: beijing,
      now: "2027-09-12T08:00:00Z",
      expected: "live",
    },
    {
      name: "Selection even when the standards were never recorded",
      competition: { ...beijing, firstSelectedOn: "2027-08-27" },
      now: "2027-09-01T08:00:00Z",
      expected: "selection",
    },
    {
      name: "without a venue zone, day one starts at midnight Belgian time",
      competition: { ...selected, startDate: "2027-03-05", endDate: "2027-03-07", venueZone: null, firstSelectedOn: "2027-02-20" },
      now: "2027-03-04T23:00:00Z",
      expected: "live",
    },
    {
      name: "without a venue zone, still Selection just before that midnight",
      competition: { ...selected, startDate: "2027-03-05", endDate: "2027-03-07", venueZone: null, firstSelectedOn: "2027-02-20" },
      now: "2027-03-04T22:59:00Z",
      expected: "selection",
    },
    {
      name: "LA evening first Session: still Selection in the Belgian night before it",
      competition: {
        ...published,
        startDate: "2028-07-14",
        endDate: "2028-07-30",
        venueZone: "America/Los_Angeles",
        firstSelectedOn: "2028-07-06",
        firstSessionStart: "2028-07-14T18:00",
      },
      now: "2028-07-15T00:59:00Z",
      expected: "selection",
    },
  ] satisfies { name: string; competition: PhaseInputs; now: string; expected: string }[])("$name", ({ competition, now, expected }) => {
    expect(currentPhase(competition, new Date(now))).toBe(expected);
  });
});

describe("phaseToShow", () => {
  it.each([
    { name: "no phase asked: the current one", asked: null, current: "selection", expected: "selection" },
    { name: "an earlier phase stays reachable", asked: "standards", current: "selection", expected: "standards" },
    { name: "the current phase itself", asked: "selection", current: "selection", expected: "selection" },
    { name: "a later phase is not reachable yet: the current one", asked: "live", current: "selection", expected: "selection" },
    { name: "an unknown phase: the current one", asked: "medals", current: "after", expected: "after" },
  ] as const)("$name", ({ asked, current, expected }) => {
    expect(phaseToShow(asked, current)).toBe(expected);
  });
});
