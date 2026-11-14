import { describe, expect, it } from "vitest";
import { needsLikelyReview, onCalendar, participation, type ParticipationFacts } from "~/domain";

// Spec #20, story 96 and GLOSSARY "Participation": confirmed once an entry
// list, start list, Selection or result names a Belgian Entry; likely when a
// Belgian Entry took part in the previous edition or is in contention, or the
// owner adds it. The owner's Selections & likely step can confirm, keep or
// drop a likely one (story 109).
const none: ParticipationFacts = { namedBelgianEntry: false, previousEdition: false, inContention: false, owner: null };

describe("participation", () => {
  it.each([
    { name: "no facts at all: no Participation", facts: none, expected: { status: "none", why: [] } },
    {
      name: "an entry list, start list, Selection or result names a Belgian Entry: confirmed",
      facts: { ...none, namedBelgianEntry: true },
      expected: { status: "confirmed", why: ["named"] },
    },
    {
      name: "a Belgian Entry took part in the previous edition: likely",
      facts: { ...none, previousEdition: true },
      expected: { status: "likely", why: ["previous-edition"] },
    },
    {
      name: "a Belgian Entry is in contention: likely",
      facts: { ...none, inContention: true },
      expected: { status: "likely", why: ["in-contention"] },
    },
    {
      name: "added by hand: likely",
      facts: { ...none, owner: "added" },
      expected: { status: "likely", why: ["added-by-hand"] },
    },
    {
      name: "both automatic reasons are given, previous edition first",
      facts: { ...none, previousEdition: true, inContention: true },
      expected: { status: "likely", why: ["previous-edition", "in-contention"] },
    },
    {
      name: "the owner kept a likely one: still likely, for the same reason",
      facts: { ...none, previousEdition: true, owner: "kept" },
      expected: { status: "likely", why: ["previous-edition"] },
    },
    {
      name: "kept after being added by hand stays likely",
      facts: { ...none, owner: "kept" },
      expected: { status: "likely", why: ["kept"] },
    },
    {
      name: "the owner dropped a likely one: no Participation",
      facts: { ...none, previousEdition: true, inContention: true, owner: "dropped" },
      expected: { status: "none", why: [] },
    },
    {
      name: "the owner confirmed it (entry list seen by hand): confirmed",
      facts: { ...none, previousEdition: true, owner: "confirmed" },
      expected: { status: "confirmed", why: ["confirmed-by-hand"] },
    },
    {
      name: "a dropped competition whose entry list later names a Belgian is confirmed after all",
      facts: { ...none, namedBelgianEntry: true, owner: "dropped" },
      expected: { status: "confirmed", why: ["named"] },
    },
  ] satisfies { name: string; facts: ParticipationFacts; expected: unknown }[])("$name", ({ facts, expected }) => {
    expect(participation(facts)).toEqual(expected);
  });
});

// Story 38: only competitions with a confirmed or likely Participation are on
// the calendar; Championships and the Games always are.
describe("onCalendar", () => {
  it.each([
    { name: "circuit event, confirmed", kind: "circuit", status: "confirmed", expected: true },
    { name: "circuit event, likely", kind: "circuit", status: "likely", expected: true },
    { name: "circuit event without a Participation", kind: "circuit", status: "none", expected: false },
    { name: "Championship without a Participation", kind: "championship", status: "none", expected: true },
    { name: "the Games without a Participation", kind: "games", status: "none", expected: true },
  ] as const)("$name", ({ kind, status, expected }) => {
    expect(onCalendar(kind, status)).toBe(expected);
  });
});

// Story 109: the Selections & likely step shows the likely Participations of
// the coming six weeks that the owner has not checked in the last week.
describe("needsLikelyReview", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  it.each([
    { name: "starts next week, never checked", startDate: "2026-11-20", endDate: "2026-11-22", checkedAt: null, expected: true },
    { name: "starts in exactly six weeks", startDate: "2026-12-26", endDate: "2026-12-27", checkedAt: null, expected: true },
    { name: "starts in six weeks and a day", startDate: "2026-12-27", endDate: "2026-12-28", checkedAt: null, expected: false },
    { name: "running now", startDate: "2026-11-13", endDate: "2026-11-15", checkedAt: null, expected: true },
    { name: "already over", startDate: "2026-11-10", endDate: "2026-11-13", checkedAt: null, expected: false },
    { name: "checked in this week's session", startDate: "2026-11-20", endDate: "2026-11-22", checkedAt: "2026-11-14T09:00:00.000Z", expected: false },
    { name: "checked a week ago", startDate: "2026-11-20", endDate: "2026-11-22", checkedAt: "2026-11-07T12:00:00.000Z", expected: true },
    { name: "checked five days ago", startDate: "2026-11-20", endDate: "2026-11-22", checkedAt: "2026-11-09T12:00:00.000Z", expected: false },
  ])("$name", ({ startDate, endDate, checkedAt, expected }) => {
    expect(needsLikelyReview({ startDate, endDate, checkedAt }, now)).toBe(expected);
  });
});
