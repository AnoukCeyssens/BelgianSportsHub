import { describe, expect, it } from "vitest";
import { athleteMedals, belgiumMedals, teamIdentity, type MedalResult } from "~/domain";

// GLOSSARY "Team", "Roster"; ADR 0001; spec #20 stories 9–15. By default one
// Team per Belgium + event, keeping its identity as its roster changes; where
// Belgium can field several at once, each standing partnership is its own Team.
// Members are named by their IF ID ("scheme:value").
const swings = { id: "isu:692", name: "Bart Swings" };
const medard = { id: "isu:2049", name: "Indra Medard" };
const vosté = { id: "isu:1005", name: "Mathias Vosté" };
const gilles = { id: "fivb:142921", name: "Gilles Vandecaveye" };
const louis = { id: "fivb:137300", name: "Louis Vandecaveye" };
const coens = { id: "fivb:190214", name: "Youna Coens" };
const thant = { id: "fivb:210116", name: "Lente Thant" };
const vanDeun = { id: "fivb:200001", name: "Mae Van Deun" };

describe("teamIdentity", () => {
  it.each([
    {
      name: "a team pursuit is Belgium's default Team for the event",
      input: { sport: "Speed skating", event: "Team Pursuit Men", members: [swings, medard, vosté] },
      expected: { kind: "default", key: "Speed skating|Team Pursuit Men", name: "Belgium · Team Pursuit Men" },
    },
    {
      name: "the default Team keeps its identity when the roster changes",
      input: { sport: "Speed skating", event: "Team Pursuit Men", members: [swings, medard] },
      expected: { kind: "default", key: "Speed skating|Team Pursuit Men", name: "Belgium · Team Pursuit Men" },
    },
    {
      name: "a national volleyball side is the default Team",
      input: { sport: "Volleyball", event: "Women", members: [] },
      expected: { kind: "default", key: "Volleyball|Women", name: "Belgium · Women" },
    },
    {
      name: "a triathlon mixed relay is the default Team",
      input: { sport: "Triathlon", event: "Mixed Relay", members: [swings] },
      expected: { kind: "default", key: "Triathlon|Mixed Relay", name: "Belgium · Mixed Relay" },
    },
    {
      name: "a beach volleyball pair is its own Team",
      input: { sport: "Beach volleyball", event: "Men", members: [gilles, louis] },
      expected: { kind: "partnership", key: "Beach volleyball|Men|fivb:137300+fivb:142921", name: "Gilles Vandecaveye / Louis Vandecaveye" },
    },
    {
      name: "the same pair listed the other way round is the same Team",
      input: { sport: "Beach volleyball", event: "Men", members: [louis, gilles] },
      expected: { kind: "partnership", key: "Beach volleyball|Men|fivb:137300+fivb:142921", name: "Louis Vandecaveye / Gilles Vandecaveye" },
    },
    {
      name: "a new partnership is a new Team",
      input: { sport: "Beach volleyball", event: "Women", members: [coens, vanDeun] },
      expected: { kind: "partnership", key: "Beach volleyball|Women|fivb:190214+fivb:200001", name: "Youna Coens / Mae Van Deun" },
    },
    {
      name: "a rowing double is a partnership",
      input: { sport: "Rowing", event: "Men's Double Sculls", members: [swings, medard] },
      expected: { kind: "partnership", key: "Rowing|Men's Double Sculls|isu:2049+isu:692", name: "Bart Swings / Indra Medard" },
    },
    {
      name: "badminton doubles are a partnership",
      input: { sport: "Badminton", event: "Mixed Doubles", members: [swings, medard] },
      expected: { kind: "partnership", key: "Badminton|Mixed Doubles|isu:2049+isu:692", name: "Bart Swings / Indra Medard" },
    },
    {
      name: "synchronised diving is a partnership",
      input: { sport: "Diving", event: "Women's Synchronised 3m Springboard", members: [coens, thant] },
      expected: { kind: "partnership", key: "Diving|Women's Synchronised 3m Springboard|fivb:190214+fivb:210116", name: "Youna Coens / Lente Thant" },
    },
    {
      name: "a canoe K2 is a partnership",
      input: { sport: "Canoe sprint", event: "K2 500m Women", members: [coens, thant] },
      expected: { kind: "partnership", key: "Canoe sprint|K2 500m Women|fivb:190214+fivb:210116", name: "Youna Coens / Lente Thant" },
    },
    {
      name: "a table tennis team event is the default Team, not a doubles pair",
      input: { sport: "Table tennis", event: "Men's Team", members: [swings, medard, vosté] },
      expected: { kind: "default", key: "Table tennis|Men's Team", name: "Belgium · Men's Team" },
    },
    {
      name: "a pair ranking attaches to the pair's Team",
      input: { sport: "Beach volleyball", event: "Women", members: [thant, coens] },
      expected: { kind: "partnership", key: "Beach volleyball|Women|fivb:190214+fivb:210116", name: "Lente Thant / Youna Coens" },
    },
    {
      name: "a nation ranking (no members) attaches to the default Team, even in a pairs sport",
      input: { sport: "Beach volleyball", event: "Women", members: null },
      expected: { kind: "default", key: "Beach volleyball|Women", name: "Belgium · Women" },
    },
  ])("$name", ({ input, expected }) => {
    expect(teamIdentity(input)).toEqual(expected);
  });
});

// Spec #20 stories 13 and 14: a Team medal counts once per event for Belgium,
// and once for every roster member on their own Athlete record. Medals are won
// at Championships and the Games only.
const champs = { competitionId: "euros", competitionKind: "championship" } as const;
const r = (x: Partial<MedalResult> & Pick<MedalResult, "entry" | "event" | "place">): MedalResult => ({
  ...champs,
  status: "finished",
  ...x,
});
const relay = (roster: string[]) => ({ kind: "team" as const, teamId: "relay", roster });

describe("belgiumMedals", () => {
  it.each([
    { name: "nothing won", results: [], expected: { gold: 0, silver: 0, bronze: 0 } },
    {
      name: "a four-member Team's gold counts once",
      results: [r({ event: "4x400m Mixed", place: 1, entry: relay(["a", "b", "c", "d"]) })],
      expected: { gold: 1, silver: 0, bronze: 0 },
    },
    {
      name: "two Belgian pairs on the podium of one event count twice",
      results: [
        r({ event: "Men", place: 1, entry: { kind: "team", teamId: "pair-1", roster: ["a", "b"] } }),
        r({ event: "Men", place: 3, entry: { kind: "team", teamId: "pair-2", roster: ["c", "d"] } }),
      ],
      expected: { gold: 1, silver: 0, bronze: 1 },
    },
    {
      name: "the same Team result listed twice still counts once",
      results: [
        r({ event: "4x400m Mixed", place: 2, entry: relay(["a", "b", "c", "d"]) }),
        r({ event: "4x400m Mixed", place: 2, entry: relay(["a", "b", "c", "d", "e"]) }),
      ],
      expected: { gold: 0, silver: 1, bronze: 0 },
    },
    {
      name: "an individual bronze and a Team silver",
      results: [
        r({ event: "400m Women", place: 3, entry: { kind: "athlete", athleteId: "a" } }),
        r({ event: "4x400m Mixed", place: 2, entry: relay(["a", "b", "c", "d"]) }),
      ],
      expected: { gold: 0, silver: 1, bronze: 1 },
    },
    {
      name: "a World Cup podium is not a medal",
      results: [r({ competitionKind: "circuit", event: "Team Pursuit Women", place: 1, entry: relay(["a", "b", "c"]) })],
      expected: { gold: 0, silver: 0, bronze: 0 },
    },
    {
      name: "fourth place and DSQ are no medals",
      results: [
        r({ event: "Men", place: 4, entry: relay(["a", "b"]) }),
        r({ event: "Women", place: null, status: "DSQ", entry: { kind: "athlete", athleteId: "c" } }),
      ],
      expected: { gold: 0, silver: 0, bronze: 0 },
    },
    {
      name: "the Games count",
      results: [r({ competitionId: "la28", competitionKind: "games", event: "Men", place: 1, entry: relay(["a", "b"]) })],
      expected: { gold: 1, silver: 0, bronze: 0 },
    },
  ])("$name", ({ results, expected }) => {
    expect(belgiumMedals(results)).toEqual(expected);
  });
});

describe("athleteMedals", () => {
  it.each([
    {
      name: "a roster member gets the Team's medal",
      athleteId: "b",
      results: [r({ event: "4x400m Mixed", place: 1, entry: relay(["a", "b", "c", "d"]) })],
      expected: { gold: 1, silver: 0, bronze: 0 },
    },
    {
      name: "a heats-only relay member on the roster gets it too",
      athleteId: "e",
      results: [r({ event: "4x400m Mixed", place: 1, entry: relay(["a", "b", "c", "d", "e"]) })],
      expected: { gold: 1, silver: 0, bronze: 0 },
    },
    {
      name: "someone not on the roster does not",
      athleteId: "z",
      results: [r({ event: "4x400m Mixed", place: 1, entry: relay(["a", "b", "c", "d"]) })],
      expected: { gold: 0, silver: 0, bronze: 0 },
    },
    {
      name: "own medals and Team medals add up",
      athleteId: "a",
      results: [
        r({ event: "400m Women", place: 3, entry: { kind: "athlete", athleteId: "a" } }),
        r({ event: "4x400m Mixed", place: 2, entry: relay(["a", "b", "c", "d"]) }),
        r({ event: "400m Women", place: 1, entry: { kind: "athlete", athleteId: "b" } }),
      ],
      expected: { gold: 0, silver: 1, bronze: 1 },
    },
    {
      name: "one event's medal counts once even when listed twice",
      athleteId: "a",
      results: [
        r({ event: "4x400m Mixed", place: 2, entry: relay(["a", "b", "c", "d"]) }),
        r({ event: "4x400m Mixed", place: 2, entry: relay(["a", "b", "c", "d"]) }),
      ],
      expected: { gold: 0, silver: 1, bronze: 0 },
    },
  ])("$name", ({ athleteId, results, expected }) => {
    expect(athleteMedals(results, athleteId)).toEqual(expected);
  });
});
