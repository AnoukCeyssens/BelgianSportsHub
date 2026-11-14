import { describe, expect, it } from "vitest";
import { readPastedTable, readTimetable, splitEventRound, timetableColumnMapping } from "~/domain";

// Spec #20, stories 55, 61, 63 and 110; GLOSSARY "Session"; ticket #37. A
// Championship timetable (or the Games' by-event schedule) pasted into the
// Run sheet's Schedules step: one row per event round, or per Session with
// its rounds listed. The paste importer's column roles grow timetable roles
// (date, start, end, session, sport, round) next to its results roles.

describe("splitEventRound", () => {
  it.each([
    { name: "heats at the end", text: "Women's 500 m heats", expected: { event: "Women's 500 m", round: "Heats" } },
    { name: "quarter-finals", text: "Women's 1000 m quarter-finals", expected: { event: "Women's 1000 m", round: "Quarter-finals" } },
    { name: "a relay's semi-finals", text: "Mixed relay semi-finals", expected: { event: "Mixed relay", round: "Semi-finals" } },
    { name: "LA28 style: semifinal", text: "Women's 100m Semifinal", expected: { event: "Women's 100m", round: "Semifinal" } },
    { name: "LA28 style: round 1", text: "Men's 400m Hurdles Round 1", expected: { event: "Men's 400m Hurdles", round: "Round 1" } },
    { name: "a final", text: "Men's 1500 m final", expected: { event: "Men's 1500 m", round: "Final" } },
    { name: "a pool with a match count", text: "Men's Pool (2 Matches)", expected: { event: "Men's", round: "Pool (2 Matches)" } },
    { name: "qualification", text: "Women's Long Jump Qualification", expected: { event: "Women's Long Jump", round: "Qualification" } },
    { name: "a heptathlon day", text: "Heptathlon day 1", expected: { event: "Heptathlon", round: "Day 1" } },
    { name: "no round word: the whole race is one round", text: "Women's road race", expected: { event: "Women's road race", round: "Final" } },
  ])("$name", ({ text, expected }) => {
    expect(splitEventRound(text)).toEqual(expected);
  });
});

describe("timetableColumnMapping", () => {
  it.each([
    {
      name: "the short-track sample: day, venue time, round",
      head: ["Day", "Venue time", "Round"],
      expected: ["date", "start", "round"],
    },
    {
      name: "the LA28 by-event columns",
      head: ["Sport", "Venue", "Session Code", "Date", "Games Day", "Session Type", "Session Description", "Start Time", "End Time"],
      expected: ["sport", "ignore", "session", "date", "ignore", "ignore", "round", "start", "end"],
    },
    { name: "separate event and round columns", head: ["Date", "Time", "Event", "Phase"], expected: ["date", "start", "event", "round"] },
  ])("$name", ({ head, expected }) => {
    expect(timetableColumnMapping(head, null).roles).toEqual(expected);
  });

  it("uses the saved mapping where it knows the header", () => {
    expect(timetableColumnMapping(["Day", "Kick-off", "Match"], { "kick-off": "start", match: "round" }).roles).toEqual(["date", "start", "round"]);
  });
});

const EUROPEANS = { startDate: "2027-01-15", endDate: "2027-01-17", sport: "Short track" };

const shortTrack = readPastedTable(
  [
    "Day\tVenue time\tRound",
    "Fri 15 Jan\t13:00\tWomen's 500 m heats",
    "Fri 15 Jan\t15:30\tWomen's 1000 m heats",
    "Sat 16 Jan\t12:00\tWomen's 500 m quarter-finals",
    "Sun 17 Jan\t15:50\tMixed relay final",
  ].join("\n"),
);

describe("readTimetable", () => {
  it("reads one event round per row, each its own Session, the year from the competition", () => {
    expect(readTimetable(shortTrack, ["date", "start", "round"], EUROPEANS)).toEqual({
      rounds: [
        { index: 0, date: "2027-01-15", start: "13:00", end: null, session: null, sport: "Short track", event: "Women's 500 m", round: "Heats" },
        { index: 1, date: "2027-01-15", start: "15:30", end: null, session: null, sport: "Short track", event: "Women's 1000 m", round: "Heats" },
        { index: 2, date: "2027-01-16", start: "12:00", end: null, session: null, sport: "Short track", event: "Women's 500 m", round: "Quarter-finals" },
        { index: 3, date: "2027-01-17", start: "15:50", end: null, session: null, sport: "Short track", event: "Mixed relay", round: "Final" },
      ],
      skipped: [],
    });
  });

  it("splits an LA28 session description into its event rounds, all in the coded Session", () => {
    const table = readPastedTable(
      [
        "Sport\tSession Code\tDate\tSession Description\tStart Time\tEnd Time",
        "Athletics (Track & Field)\tATH02\tSaturday, July 15\tWomen's 100m Semifinal / Women's 400m Hurdles Round 1\t17:00\t20:15",
        "Hockey\tHOC23\tMonday, July 24\tMen's Quarterfinal (2 Matches)\t9:00\t14:00",
      ].join("\n"),
    );
    const roles = ["sport", "session", "date", "round", "start", "end"] as const;
    expect(readTimetable(table, roles, { startDate: "2028-07-12", endDate: "2028-07-30", sport: "Olympic Games" }).rounds).toEqual([
      { index: 0, date: "2028-07-15", start: "17:00", end: "20:15", session: "ATH02", sport: "Athletics (Track & Field)", event: "Women's 100m", round: "Semifinal" },
      { index: 0, date: "2028-07-15", start: "17:00", end: "20:15", session: "ATH02", sport: "Athletics (Track & Field)", event: "Women's 400m Hurdles", round: "Round 1" },
      { index: 1, date: "2028-07-24", start: "09:00", end: "14:00", session: "HOC23", sport: "Hockey", event: "Men's", round: "Quarterfinal (2 Matches)" },
    ]);
  });

  it.each([
    { name: "ISO date", date: "2027-09-12", time: "09:35", expected: { date: "2027-09-12", start: "09:35", end: null } },
    { name: "day-first date", date: "12/09/2027", time: "9:35", expected: { date: "2027-09-12", start: "09:35", end: null } },
    { name: "day and month name", date: "12 Sep", time: "18:15", expected: { date: "2027-09-12", start: "18:15", end: null } },
    { name: "month name first", date: "Sunday, September 12", time: "18:15", expected: { date: "2027-09-12", start: "18:15", end: null } },
    { name: "a time range in one cell", date: "12 Sep", time: "17:00–20:15", expected: { date: "2027-09-12", start: "17:00", end: "20:15" } },
    { name: "no published time", date: "12 Sep", time: "TBD", expected: { date: "2027-09-12", start: null, end: null } },
  ])("reads dates and times: $name", ({ date, time, expected }) => {
    const table = { head: ["Date", "Time", "Event", "Round"], rows: [[date, time, "Women's Long Jump", "Final"]] };
    const [read] = readTimetable(table, ["date", "start", "event", "round"], { startDate: "2027-09-11", endDate: "2027-09-19", sport: "Athletics" }).rounds;
    expect({ date: read.date, start: read.start, end: read.end }).toEqual(expected);
  });

  it("a Championship over New Year takes the year that puts the day inside its dates", () => {
    const table = { head: ["Date", "Event"], rows: [["31 Dec", "Men's 500 m heats"], ["2 Jan", "Men's 500 m final"]] };
    expect(readTimetable(table, ["date", "round"], { startDate: "2026-12-30", endDate: "2027-01-03", sport: "Short track" }).rounds.map((r) => r.date)).toEqual([
      "2026-12-31",
      "2027-01-02",
    ]);
  });

  it("skips rows it cannot place: no readable date, a day outside the competition, or no event", () => {
    const table = {
      head: ["Date", "Time", "Round"],
      rows: [
        ["Rest day", "", ""],
        ["20 Sep", "10:00", "Men's marathon final"],
        ["12 Sep", "10:00", ""],
        ["12 Sep", "10:00", "Men's 400 m heats"],
      ],
    };
    const read = readTimetable(table, ["date", "start", "round"], { startDate: "2027-09-11", endDate: "2027-09-19", sport: "Athletics" });
    expect(read.rounds.map((r) => r.index)).toEqual([3]);
    expect(read.skipped).toEqual([
      { index: 0, why: "no date" },
      { index: 1, why: "outside the competition's days" },
      { index: 2, why: "no event" },
    ]);
  });
});
