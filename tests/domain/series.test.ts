import { describe, expect, it } from "vitest";
import { seriesKey, seriesSlug } from "~/domain";

// GLOSSARY "Participation" (likely: a Belgian Entry at the previous edition);
// spec #20 review, finding C. A series is the recurring competition a row is
// an edition of: stable from one edition to the next, prefixed by source.

describe("seriesSlug: a name as a series key part", () => {
  it.each([
    { name: "accents and punctuation go", raw: "Grand Prix de Montréal!", expected: "grand-prix-de-montreal" },
    { name: "years and seasons go", raw: "2026 World Triathlon Championship Series Yokohama 2026/27", expected: "world-triathlon-championship-series-yokohama" },
    { name: "edition ordinals go", raw: "53rd European Championships", expected: "european-championships" },
    { name: "a hyphenated season goes", raw: "Ski World Cup 2026-2027", expected: "ski-world-cup" },
  ])("$name", ({ raw, expected }) => {
    expect(seriesSlug(raw)).toBe(expected);
  });
});

describe("seriesKey: the recurring competition a source's competition is an edition of", () => {
  it.each([
    {
      name: "a summer Games is the Olympic Games",
      input: { source: "world-athletics", name: "Games of the XXXIV Olympiad", kind: "games", sport: "Athletics", city: "Los Angeles" },
      expected: "olympic-games",
    },
    {
      name: "a winter Games is the Olympic Winter Games",
      input: { source: "isu", name: "Olympic Winter Games Milano Cortina 2026", kind: "games", sport: "Speed skating", city: "Milan" },
      expected: "olympic-winter-games",
    },
    {
      name: "a Championship moves host: its city leaves the key",
      input: { source: "ijf", name: "World Championships Seniors Doha 2023", kind: "championship", sport: "Judo", city: "Doha" },
      expected: "ijf:world-championships-seniors",
    },
    {
      name: "Europeans and Worlds stay apart",
      input: { source: "ijf", name: "European Championships Seniors Montpellier 2023", kind: "championship", sport: "Judo", city: "Montpellier" },
      expected: "ijf:european-championships-seniors",
    },
    {
      name: "short course stays apart from long course",
      input: { source: "world-aquatics", name: "World Aquatics Swimming Championships (25m) 2026", kind: "championship", sport: "Swimming", city: "Beijing" },
      expected: "world-aquatics:world-aquatics-swimming-championships-25m",
    },
    {
      name: "a circuit leg recurs by its city",
      input: { source: "ijf", name: "Grand Slam Paris 2026", kind: "circuit", sport: "Judo", city: "Paris" },
      expected: "ijf:grand-slam-paris",
    },
    {
      name: "a circuit leg whose name lacks the city gets it",
      input: { source: "fivb-beach-volleyball", name: "Beach Pro Tour Elite16", kind: "circuit", sport: "Beach volleyball", city: "Ostrava" },
      expected: "fivb-beach-volleyball:beach-pro-tour-elite16:ostrava",
    },
    {
      name: "a circuit leg without a city keeps its name",
      input: { source: "uci-cycling", name: "Tour of Guangxi", kind: "circuit", sport: "Cycling road", city: null },
      expected: "uci-cycling:tour-of-guangxi",
    },
  ] as const)("$name", ({ input, expected }) => {
    expect(seriesKey(input)).toBe(expected);
  });
});
