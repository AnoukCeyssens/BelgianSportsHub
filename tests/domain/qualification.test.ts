import { describe, expect, it } from "vitest";
import {
  inContention,
  olympicCycleOf,
  qualificationTargets,
  trackProgress,
  windowCountdown,
  type QualificationStatus,
  type TargetCompetition,
} from "~/domain";

// GLOSSARY "Qualification status", "Qualification track", "Olympic cycle";
// spec #20, stories 28, 29, 34 and 82; ticket #32.

describe("trackProgress: how far along its progress bar a Qualification track is (0–100)", () => {
  it.each([
    { name: "a met track is full, whatever it says", track: { needed: "Named by BOIC", has: "Pending", state: "met", better: null }, expected: 100 },
    { name: "nothing to measure: empty", track: { needed: "Criteria TBA", has: "–", state: "pending", better: null }, expected: 0 },
    { name: "a ranking position: top 24 needed, #48 held", track: { needed: "Top 24", has: "#48", state: "not-met", better: null }, expected: 50 },
    { name: "a ranking position inside the places but not yet met", track: { needed: "top 48", has: "#7", state: "pending", better: null }, expected: 100 },
    { name: "points, higher is better: 6 500 needed, 5 200 held", track: { needed: "6 500 pts", has: "5 200 pts", state: "not-met", better: "higher" }, expected: 80 },
    { name: "a distance, higher by default: 8.00 m needed, 7.60 m held", track: { needed: "8.00 m", has: "7.60 m", state: "pending", better: null }, expected: 95 },
    { name: "a time in h:mm:ss is lower-is-better: 2:06:30 needed, 2:09:00 held", track: { needed: "2:06:30", has: "2:09:00", state: "not-met", better: null }, expected: 98 },
    { name: "a time in seconds when the owner says lower is better: 50.00 needed, 52.00 held", track: { needed: "50.00", has: "52.00", state: "not-met", better: "lower" }, expected: 96 },
    { name: "a ranking held as an ordinal: top 14 needed, 28th held", track: { needed: "World Relays top 14", has: "28th", state: "not-met", better: null }, expected: 50 },
    { name: "no number held yet", track: { needed: "Top 24", has: "not ranked", state: "pending", better: null }, expected: 0 },
  ] as const)("$name", ({ track, expected }) => {
    expect(trackProgress(track)).toBe(expected);
  });
});

describe("olympicCycleOf: which Olympic cycle a sport follows", () => {
  it.each([
    { sport: "Athletics", expected: "summer" },
    { sport: "Hockey", expected: "summer" },
    { sport: "Speed skating", expected: "winter" },
    { sport: "Short track", expected: "winter" },
    { sport: "Short track speed skating", expected: "winter" },
    { sport: "Alpine skiing", expected: "winter" },
    { sport: "Snowboard", expected: "winter" },
    { sport: "Biathlon", expected: "winter" },
    { sport: "Ice hockey", expected: "winter" },
    { sport: "Ski mountaineering", expected: "winter" },
    { sport: "Figure skating", expected: "winter" },
  ])("$sport: $expected", ({ sport, expected }) => {
    expect(olympicCycleOf(sport)).toBe(expected);
  });
});

describe("inContention: whether a status keeps a Belgian Entry in the race (likely Participation)", () => {
  it.each([
    { status: "not-in-contention", expected: false },
    { status: "at-risk", expected: true },
    { status: "on-track", expected: true },
    { status: "eligible", expected: true },
    { status: "qualified", expected: true },
    { status: "selected", expected: true },
    { status: "not-selected", expected: false },
    { status: "withdrawn", expected: false },
  ] as { status: QualificationStatus; expected: boolean }[])("$status", ({ status, expected }) => {
    expect(inContention(status)).toBe(expected);
  });
});

describe("windowCountdown: days until the qualification window closes (Belgian date)", () => {
  it.each([
    { name: "no closing date recorded", closesOn: null, now: "2026-11-14T12:00:00Z", expected: null },
    { name: "LA28's last qualification event, 11 Jun 2028", closesOn: "2028-06-11", now: "2026-11-14T12:00:00Z", expected: 575 },
    { name: "closes tomorrow (just after midnight in Brussels)", closesOn: "2027-08-24", now: "2027-08-22T22:30:00Z", expected: 1 },
    { name: "closes today", closesOn: "2027-08-24", now: "2027-08-24T08:00:00Z", expected: 0 },
    { name: "closed yesterday", closesOn: "2027-08-24", now: "2027-08-25T08:00:00Z", expected: -1 },
  ])("$name", ({ closesOn, now, expected }) => {
    expect(windowCountdown(closesOn, new Date(now))).toBe(expected);
  });
});

const comp = (c: Partial<TargetCompetition> & Pick<TargetCompetition, "id" | "kind" | "sport" | "startDate" | "endDate">): TargetCompetition => ({
  source: "test-source",
  sourceRef: c.id,
  ...c,
});

const la28 = comp({ id: "la28", kind: "games", sport: "Olympic Games", startDate: "2028-07-14", endDate: "2028-07-30", source: "owner", sourceRef: "la-2028" });
const alps30 = comp({ id: "alps30", kind: "games", sport: "Olympic Winter Games", startDate: "2030-02-01", endDate: "2030-02-17", source: "owner", sourceRef: "french-alps-2030" });
const paris24 = comp({ id: "paris24", kind: "games", sport: "Olympic Games", startDate: "2024-07-24", endDate: "2024-08-11", source: "owner", sourceRef: "paris-2024" });
// Olympic Games a source published on Milano-Cortina's days: a reference Games.
const milanoAsPublished = comp({ id: "milano-isu", kind: "games", sport: "Speed skating", startDate: "2026-02-07", endDate: "2026-02-21" });
const europeanIndoors = comp({ id: "ech-indoor", kind: "championship", sport: "Athletics", startDate: "2027-03-05", endDate: "2027-03-07" });
const worlds = comp({ id: "wch", kind: "championship", sport: "Athletics", startDate: "2027-09-11", endDate: "2027-09-19" });
const pastWorlds = comp({ id: "wch-2026", kind: "championship", sport: "Athletics", startDate: "2026-08-01", endDate: "2026-08-09" });
const skatingEuros = comp({ id: "ech-skating", kind: "championship", sport: "Speed skating", startDate: "2027-01-08", endDate: "2027-01-10" });
const diamondLeague = comp({ id: "dl", kind: "circuit", sport: "Athletics", startDate: "2026-12-01", endDate: "2026-12-01" });
const all = [paris24, la28, alps30, milanoAsPublished, pastWorlds, europeanIndoors, worlds, skatingEuros, diamondLeague];

describe("qualificationTargets: the next Olympics and the next Championship for an Entry", () => {
  it.each([
    {
      name: "a summer sport: LA 2028; the next Championship in its sport",
      sport: "Athletics",
      withEntries: [],
      now: "2026-11-14T12:00:00Z",
      expected: { olympics: "la28", championship: "ech-indoor" },
    },
    {
      name: "the next Championship is the next one with a recorded Entry, even when another comes first",
      sport: "Athletics",
      withEntries: ["wch"],
      now: "2026-11-14T12:00:00Z",
      expected: { olympics: "la28", championship: "wch" },
    },
    {
      name: "a Championship with an Entry that is over no longer counts",
      sport: "Athletics",
      withEntries: ["wch-2026"],
      now: "2026-11-14T12:00:00Z",
      expected: { olympics: "la28", championship: "ech-indoor" },
    },
    {
      name: "a Championship counts until its last day ends",
      sport: "Athletics",
      withEntries: [],
      now: "2027-03-07T20:00:00Z",
      expected: { olympics: "la28", championship: "ech-indoor" },
    },
    {
      name: "a winter sport: French Alps 2030, never a reference Games",
      sport: "Speed skating",
      withEntries: [],
      now: "2026-02-10T12:00:00Z",
      expected: { olympics: "alps30", championship: "ech-skating" },
    },
    {
      name: "no Championship recorded in the sport",
      sport: "Judo",
      withEntries: [],
      now: "2026-11-14T12:00:00Z",
      expected: { olympics: "la28", championship: null },
    },
    {
      name: "once LA 2028 is over, no next summer Games is recorded",
      sport: "Athletics",
      withEntries: [],
      now: "2028-08-01T12:00:00Z",
      expected: { olympics: null, championship: null },
    },
  ])("$name", ({ sport, withEntries, now, expected }) => {
    const targets = qualificationTargets({ sport, competitions: all, withEntries: new Set(withEntries) }, new Date(now));
    expect({ olympics: targets.olympics?.id ?? null, championship: targets.championship?.id ?? null }).toEqual(expected);
  });
});
