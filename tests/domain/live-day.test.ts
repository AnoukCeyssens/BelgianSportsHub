import { describe, expect, it } from "vitest";
import { dayToShow, liveDays, roundsFor, venueLabel } from "~/domain";

// Spec #20, stories 47, 55–57 and 59; GLOSSARY "Session"; ticket #37. A
// Belgian Entry is placed in every round of its event from the round it
// starts in (earlier rounds are byes). Later rounds are "if through" until it
// advances (#38 moves them on from results); pool matches are "match TBD"
// until the draw. The Live phase shows a day picker with the days that have
// Belgian Entries marked.

const r = (round: string, date: string) => ({ round, date });

describe("roundsFor", () => {
  it.each([
    {
      name: "a swimmer: heats attached, semi-final and final if through",
      firstRound: null,
      rounds: [r("Heats", "2027-07-26"), r("Semi-finals", "2027-07-26"), r("Final", "2027-07-27")],
      expected: [
        ["Heats", "scheduled"],
        ["Semi-finals", "if-through"],
        ["Final", "if-through"],
      ],
    },
    {
      name: "a one-round race is simply scheduled",
      firstRound: null,
      rounds: [r("Final", "2028-07-16")],
      expected: [["Final", "scheduled"]],
    },
    {
      name: "a bye skips the rounds before the one the Entry starts in",
      firstRound: "Round 2",
      rounds: [r("Round 1", "2027-08-02"), r("Round 2", "2027-08-03"), r("Quarter-finals", "2027-08-05")],
      expected: [
        ["Round 2", "scheduled"],
        ["Quarter-finals", "if-through"],
      ],
    },
    {
      name: "a round spread over two Sessions is scheduled in both",
      firstRound: null,
      rounds: [r("Heats", "2027-09-12"), r("Heats", "2027-09-12"), r("Final", "2027-09-14")],
      expected: [
        ["Heats", "scheduled"],
        ["Heats", "scheduled"],
        ["Final", "if-through"],
      ],
    },
    {
      name: "a team's pool matches are match TBD, the knockout rounds if through",
      firstRound: null,
      rounds: [
        r("Pool (2 Matches)", "2028-07-13"),
        r("Pool (2 Matches)", "2028-07-15"),
        r("Pool (2 Matches)", "2028-07-17"),
        r("Quarterfinal (2 Matches)", "2028-07-24"),
        r("Final", "2028-07-28"),
      ],
      expected: [
        ["Pool (2 Matches)", "match-tbd"],
        ["Pool (2 Matches)", "match-tbd"],
        ["Pool (2 Matches)", "match-tbd"],
        ["Quarterfinal (2 Matches)", "if-through"],
        ["Final", "if-through"],
      ],
    },
    {
      name: "beach volleyball preliminaries are match TBD too",
      firstRound: null,
      rounds: [r("Preliminaries (3 Matches)", "2028-07-15"), r("Round of 16", "2028-07-21")],
      expected: [
        ["Preliminaries (3 Matches)", "match-tbd"],
        ["Round of 16", "if-through"],
      ],
    },
    {
      name: "a starting round the timetable does not name attaches every round",
      firstRound: "Round 3",
      rounds: [r("Heats", "2027-07-26"), r("Final", "2027-07-27")],
      expected: [
        ["Heats", "scheduled"],
        ["Final", "if-through"],
      ],
    },
  ])("$name", ({ firstRound, rounds, expected }) => {
    expect(roundsFor({ firstRound }, rounds).map((x) => [x.round, x.state])).toEqual(expected);
  });
});

describe("liveDays", () => {
  it("numbers every competition day and marks those with Belgian Entries", () => {
    expect(liveDays("2027-01-15", "2027-01-17", ["2027-01-17", "2027-01-15", "2027-01-15"])).toEqual([
      { date: "2027-01-15", day: 1, marked: true },
      { date: "2027-01-16", day: 2, marked: false },
      { date: "2027-01-17", day: 3, marked: true },
    ]);
  });
});

describe("dayToShow", () => {
  const days = liveDays("2028-07-14", "2028-07-17", ["2028-07-16", "2028-07-17"]);
  it.each([
    { name: "the day asked for", asked: "2028-07-15", now: "2028-07-16T20:00:00Z", expected: "2028-07-15" },
    { name: "a day outside the competition is ignored: today at the venue", asked: "2028-08-01", now: "2028-07-16T20:00:00Z", expected: "2028-07-16" },
    { name: "today is the venue's date (03:30 in Belgium is still the evening before in LA)", asked: null, now: "2028-07-16T01:30:00Z", expected: "2028-07-15" },
    { name: "before the first day: the first day with Belgian Entries", asked: null, now: "2028-07-01T12:00:00Z", expected: "2028-07-16" },
    { name: "after the last day: the first day with Belgian Entries", asked: null, now: "2028-08-01T12:00:00Z", expected: "2028-07-16" },
  ])("$name", ({ asked, now, expected }) => {
    expect(dayToShow(asked, days, new Date(now), "America/Los_Angeles")).toBe(expected);
  });

  it("with no Belgian Entries at all, outside the days: the first day", () => {
    expect(dayToShow(null, liveDays("2028-07-14", "2028-07-15", []), new Date("2028-07-01T12:00:00Z"), "America/Los_Angeles")).toBe("2028-07-14");
  });
});

describe("venueLabel", () => {
  it.each([
    { city: "Los Angeles", expected: "LA" },
    { city: "Salt Lake City", expected: "SLC" },
    { city: "Tokyo", expected: "Tokyo" },
    { city: "Crans-Montana", expected: "Crans-Montana" },
    { city: null, expected: "venue" },
  ])("$city → $expected", ({ city, expected }) => {
    expect(venueLabel(city)).toBe(expected);
  });
});
