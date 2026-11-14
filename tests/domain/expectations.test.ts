import { describe, expect, it } from "vitest";
import {
  canPick,
  expandShortcut,
  lastSnapshotBefore,
  pickLockAt,
  placeRangeLabel,
  readShortcut,
  shortcutLabel,
  worldRankSnapshotDue,
  type PhaseInputs,
} from "~/domain";

// Spec #20, stories 64, 67–70 and the `pickLockAt` / `canPick` /
// `expandShortcut` rules; GLOSSARY "Expectation", "Seed"; ticket #40 (decided
// in #12 and #16). A personal pick is a place or a place range, entered through
// shortcuts: Gold/Silver/Bronze = 1st/2nd/3rd, Medal = 1st–3rd, Final or top 8
// = 1st–8th, a tournament round reached = the range it classifies (a
// quarter-final exit is 5th–8th), an exact place or a custom range. Picks open
// once the Entry is Selected and lock at the competition's first Session
// (midnight venue time on day one without one).

describe("readShortcut + expandShortcut", () => {
  it.each([
    { name: "Gold is 1st", typed: "Gold", expected: { from: 1, to: 1 }, label: "Gold" },
    { name: "Silver is 2nd", typed: "silver", expected: { from: 2, to: 2 }, label: "Silver" },
    { name: "Bronze is 3rd", typed: "BRONZE", expected: { from: 3, to: 3 }, label: "Bronze" },
    { name: "a medal is 1st–3rd", typed: "Medal", expected: { from: 1, to: 3 }, label: "Medal" },
    { name: "the final is 1st–8th", typed: "final", expected: { from: 1, to: 8 }, label: "Final / top 8" },
    { name: "top 8 is 1st–8th", typed: "Top 8", expected: { from: 1, to: 8 }, label: "Final / top 8" },
    { name: "a quarter-final exit is 5th–8th", typed: "QF exit", expected: { from: 5, to: 8 }, label: "Quarter-final exit" },
    { name: "quarter-final written out", typed: "quarter-final", expected: { from: 5, to: 8 }, label: "Quarter-final exit" },
    { name: "a semi-final exit is 3rd–4th", typed: "SF", expected: { from: 3, to: 4 }, label: "Semi-final exit" },
    { name: "a round-of-16 exit is 9th–16th", typed: "R16", expected: { from: 9, to: 16 }, label: "Round of 16 exit" },
    { name: "a round-of-32 exit is 17th–32nd", typed: "round of 32", expected: { from: 17, to: 32 }, label: "Round of 32 exit" },
    { name: "an exact place", typed: "5", expected: { from: 5, to: 5 }, label: "5th" },
    { name: "an exact place written as an ordinal", typed: "12th", expected: { from: 12, to: 12 }, label: "12th" },
    { name: "a custom range", typed: "5-8", expected: { from: 5, to: 8 }, label: "5th–8th" },
    { name: "a custom range with an en dash and ordinals", typed: "4th–6th", expected: { from: 4, to: 6 }, label: "4th–6th" },
    { name: "a range of one place is that place", typed: "3-3", expected: { from: 3, to: 3 }, label: "3rd" },
  ])("$name", ({ typed, expected, label }) => {
    const shortcut = readShortcut(typed);
    expect(shortcut && expandShortcut(shortcut)).toEqual(expected);
    expect(shortcut && shortcutLabel(shortcut)).toBe(label);
  });

  it.each([
    { name: "nothing typed", typed: "" },
    { name: "a word that is no shortcut", typed: "podium-ish" },
    { name: "place 0", typed: "0" },
    { name: "a range the wrong way round", typed: "8-5" },
    { name: "a negative place", typed: "-3" },
  ])("refuses $name", ({ typed }) => {
    expect(readShortcut(typed)).toBeNull();
  });
});

describe("placeRangeLabel", () => {
  it.each([
    { name: "one place", range: { from: 1, to: 1 }, expected: "1st" },
    { name: "a range", range: { from: 5, to: 8 }, expected: "5th–8th" },
    { name: "teens take th", range: { from: 11, to: 13 }, expected: "11th–13th" },
    { name: "twenty-second", range: { from: 22, to: 22 }, expected: "22nd" },
  ])("$name", ({ range, expected }) => {
    expect(placeRangeLabel(range)).toBe(expected);
  });
});

// World Athletics Championships, Beijing, 11–19 Sep 2027 (UTC+8, no DST).
const beijing: PhaseInputs = {
  startDate: "2027-09-11",
  endDate: "2027-09-19",
  venueZone: "Asia/Shanghai",
  standardsPublishedOn: "2026-10-01",
  firstSelectedOn: "2027-08-27",
  firstSessionStart: "2027-09-11T07:30",
};

describe("pickLockAt", () => {
  it.each([
    { name: "the first Session's start at the venue", inputs: beijing, expected: "2027-09-10T23:30:00.000Z" },
    { name: "midnight venue time on day one without a Session", inputs: { ...beijing, firstSessionStart: null }, expected: "2027-09-10T16:00:00.000Z" },
    {
      name: "Belgian midnight on day one when the venue zone is unknown (summer time)",
      inputs: { ...beijing, venueZone: null, firstSessionStart: null },
      expected: "2027-09-10T22:00:00.000Z",
    },
  ])("$name", ({ inputs, expected }) => {
    expect(pickLockAt(inputs).toISOString()).toBe(expected);
  });
});

describe("canPick", () => {
  const lockAt = new Date("2027-09-10T23:30:00.000Z");
  it.each([
    { name: "a Selected Entry before the lock", status: "selected", now: "2027-09-01T10:00:00Z", expected: true },
    { name: "a Selected Entry one minute before the lock", status: "selected", now: "2027-09-10T23:29:00Z", expected: true },
    { name: "not at the lock itself", status: "selected", now: "2027-09-10T23:30:00Z", expected: false },
    { name: "not after the lock", status: "selected", now: "2027-09-12T08:00:00Z", expected: false },
    { name: "not while the Entry is only Qualified", status: "qualified", now: "2027-09-01T10:00:00Z", expected: false },
    { name: "not for a Not selected Entry", status: "not-selected", now: "2027-09-01T10:00:00Z", expected: false },
    { name: "not for a withdrawn Entry", status: "withdrawn", now: "2027-09-01T10:00:00Z", expected: false },
    { name: "not without a status", status: null, now: "2027-09-01T10:00:00Z", expected: false },
  ] as const)("$name", ({ status, now, expected }) => {
    expect(canPick({ status, lockAt }, new Date(now))).toBe(expected);
  });
});

describe("worldRankSnapshotDue", () => {
  const snap = (asOf: string, method: string) => ({ asOf, method });
  it.each([
    { name: "due when no Seed is recorded", snapshots: [], today: "2026-11-14", expected: true },
    { name: "not again in the same month", snapshots: [snap("2026-11-02", "world-rank")], today: "2026-11-14", expected: false },
    { name: "due in the next month", snapshots: [snap("2026-10-28", "world-rank")], today: "2026-11-01", expected: true },
    {
      name: "never once the final Seed from the entry list exists",
      snapshots: [snap("2026-10-02", "world-rank"), snap("2026-10-20", "federation-seed")],
      today: "2026-12-01",
      expected: false,
    },
  ])("$name", ({ snapshots, today, expected }) => {
    expect(worldRankSnapshotDue(snapshots, today)).toBe(expected);
  });
});

describe("lastSnapshotBefore", () => {
  const snaps = [
    { asOf: "2027-07-01", id: "july" },
    { asOf: "2027-09-10", id: "final" },
    { asOf: "2027-08-01", id: "august" },
    { asOf: "2027-09-11", id: "late" },
  ];
  it.each([
    { name: "the latest dated before the competition's first day", before: "2027-09-11", expected: "final" },
    { name: "an earlier cut-off", before: "2027-08-15", expected: "august" },
    { name: "none before the first snapshot", before: "2027-06-01", expected: null },
  ])("$name", ({ before, expected }) => {
    expect(lastSnapshotBefore(snaps, before)?.id ?? null).toBe(expected);
  });
});
