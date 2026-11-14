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

describe("entryListSelection", () => {
  it.each([
    {
      name: "on the list: Selected; a candidate left off it: Not selected",
      entries: [
        { id: "e1", athleteId: "a1" },
        { id: "e2", athleteId: "a2" },
      ],
      listed: ["a1"],
      expected: [
        { id: "e1", status: "selected" },
        { id: "e2", status: "not-selected" },
      ],
    },
    {
      name: "a Team Entry is left alone: the list names Athletes",
      entries: [{ id: "t1", athleteId: null }],
      listed: ["a1"],
      expected: [],
    },
  ])("$name", ({ entries, listed, expected }) => {
    expect(entryListSelection(entries, new Set(listed))).toEqual(expected);
  });
});
