import { describe, expect, it } from "vitest";
import { entryListSelection, namesFoundIn, selectionDue, selectorFor } from "~/domain";

// Spec #20, stories 46, 81, 85 and 108; ticket #34; GLOSSARY "Selection".
// The owner enters a Selection from a press release: the names found in the
// pasted text are pre-ticked, the other candidates become Not selected. The
// IF entry list replaces it when published.

const SWIM_PRESS =
  "The selection committee has named the following swimmers for the European Short Course Championships: Lucas Verbeke (400 and 1500 free), " +
  "Fleur DEWIT (50 and 100 breast), Kobe Ndoumbe (100 fly), Valentine Rocher (200 IM) and Senne Aerts (50 free).";

describe("namesFoundIn", () => {
  it.each([
    {
      name: "the names in a press release are found; the others are not",
      text: SWIM_PRESS,
      candidates: [
        { id: "verbeke", names: ["Lucas Verbeke"] },
        { id: "vanhoutte", names: ["Roos Vanhoutte"] },
        { id: "ndoumbe", names: ["Kobe Ndoumbe"] },
      ],
      expected: ["verbeke", "ndoumbe"],
    },
    { name: "case does not matter", text: SWIM_PRESS, candidates: [{ id: "dewit", names: ["Fleur Dewit"] }], expected: ["dewit"] },
    {
      name: "IF style, family name first",
      text: "Entries: VERBEKE Lucas, AERTS Senne",
      candidates: [
        { id: "verbeke", names: ["Lucas Verbeke"] },
        { id: "aerts", names: ["Senne Aerts"] },
      ],
      expected: ["verbeke", "aerts"],
    },
    {
      name: "accents are ignored",
      text: "Selected: Noor Vidts and Hélène Rénard",
      candidates: [{ id: "renard", names: ["Helene Renard"] }],
      expected: ["renard"],
    },
    {
      name: "a name inside a longer word is not a match",
      text: "Annelies Maesens is selected",
      candidates: [{ id: "maes", names: ["Annelies Maes"] }],
      expected: [],
    },
    {
      name: "a partnership is found when every member is named",
      text: "The double sculls of Tim Brys and Niels Van Zandweghe will row in Paris.",
      candidates: [
        { id: "new", names: ["Tim Brys / Niels Van Zandweghe", "Tim Brys", "Niels Van Zandweghe"] },
        { id: "old", names: ["Tim Brys / Pieter Van Damme", "Tim Brys", "Pieter Van Damme"] },
      ],
      expected: ["new"],
    },
    {
      name: "a Team is found by its own name",
      text: "The Red Lions travel to LA with 16 players.",
      candidates: [{ id: "lions", names: ["Red Lions"] }],
      expected: ["lions"],
    },
  ])("$name", ({ text, candidates, expected }) => {
    expect(namesFoundIn(text, candidates)).toEqual(expected);
  });
});

describe("selectorFor", () => {
  it.each([
    { name: "the Games: the Belgian Olympic Committee", kind: "games", expected: "Belgian Olympic Committee" },
    { name: "a Championship: the national federation, named by the owner", kind: "championship", expected: null },
  ])("$name", ({ kind, expected }) => {
    expect(selectorFor(kind)).toBe(expected);
  });
});

describe("selectionDue", () => {
  const NOW = new Date("2026-11-14T12:00:00Z");
  it.each([
    { name: "starts within eight weeks", c: { startDate: "2027-01-08", qualificationClosesOn: null }, expected: true },
    { name: "starts later, window still open", c: { startDate: "2027-03-05", qualificationClosesOn: "2027-02-01" }, expected: false },
    { name: "starts later, window closed", c: { startDate: "2027-03-05", qualificationClosesOn: "2026-11-10" }, expected: true },
    { name: "starts later, no window recorded", c: { startDate: "2028-07-14", qualificationClosesOn: null }, expected: false },
  ])("$name", ({ c, expected }) => {
    expect(selectionDue(c, NOW)).toBe(expected);
  });
});

describe("entryListSelection: what a published IF entry list makes of a competition's Entries", () => {
  const athlete = (id: string, athleteId: string, event: string) => ({ id, event, athleteId, teamId: null, members: [], partnership: false });
  const team = (id: string, event: string, members: string[], partnership: boolean) => ({ id, event, athleteId: null, teamId: id, members, partnership });

  it.each([
    {
      name: "a list without events: the one Entry of an Athlete on it Selected, an Athlete left off it Not selected",
      entries: [athlete("e1", "a1", "Mass Start Men"), athlete("e2", "a2", "Mass Start Women")],
      listed: [{ athleteId: "a1", events: null }],
      expected: [
        { id: "e1", status: "selected" },
        { id: "e2", status: "not-selected" },
      ],
    },
    {
      name: "a list without events cannot tell which of an Athlete's several Entries it means: they are left alone",
      entries: [athlete("e1", "a1", "1500m Men"), athlete("e2", "a1", "5000m Men")],
      listed: [{ athleteId: "a1", events: null }],
      expected: [],
    },
    {
      name: "a list naming events selects the Athlete in those events only, Not selected in the others",
      entries: [athlete("e1", "a1", "Recurve Men"), athlete("e2", "a1", "Compound Men")],
      listed: [{ athleteId: "a1", events: ["Recurve Men"] }],
      expected: [
        { id: "e1", status: "selected" },
        { id: "e2", status: "not-selected" },
      ],
    },
    {
      name: "events match as the timetable matches them (case, Metres/m)",
      entries: [athlete("e1", "a1", "women's 1500 metres")],
      listed: [{ athleteId: "a1", events: ["Women's 1500m"] }],
      expected: [{ id: "e1", status: "selected" }],
    },
    {
      name: "a partnership is Selected when the list names both its members",
      entries: [team("t1", "Women", ["a1", "a2"], true)],
      listed: [
        { athleteId: "a1", events: null },
        { athleteId: "a2", events: null },
      ],
      expected: [{ id: "t1", status: "selected" }],
    },
    {
      name: "a place passing to a new partnership: the new one Selected, the old one Not selected",
      entries: [team("old", "Women", ["a1", "a2"], true), team("new", "Women", ["a1", "a3"], true)],
      listed: [
        { athleteId: "a1", events: null },
        { athleteId: "a3", events: null },
      ],
      expected: [
        { id: "old", status: "not-selected" },
        { id: "new", status: "selected" },
      ],
    },
    {
      name: "Belgium's Team in an event is Selected when the list names a member of it in that event",
      entries: [team("relay", "Mixed Team Relay", ["a1", "a2", "a3", "a4"], false)],
      listed: [{ athleteId: "a2", events: ["Women", "Mixed Team Relay"] }],
      expected: [{ id: "relay", status: "selected" }],
    },
    {
      name: "a member named only in an individual event says nothing about Belgium's Team",
      entries: [team("relay", "Mixed Team Relay", ["a1", "a2"], false)],
      listed: [{ athleteId: "a2", events: ["Women"] }],
      expected: [],
    },
    {
      name: "a Team none of whose members the list names is left alone",
      entries: [team("t1", "Recurve Men Team", ["a1", "a2", "a3"], false)],
      listed: [{ athleteId: "a9", events: ["Recurve Men"] }],
      expected: [],
    },
  ])("$name", ({ entries, listed, expected }) => {
    expect(entryListSelection(entries, listed)).toEqual(expected);
  });
});
