import { describe, expect, it } from "vitest";
import { referenceGamesOf } from "~/domain";

// Spec #20, story 119 and "Reference backfill"; ticket #46. Paris 2024 and
// Milano-Cortina 2026 are reference Games: Belgian results only, as history.
// A Games competition belongs to one when it is the owner's reference row, or
// when a source published it as Olympic Games on that Games' days (e.g. World
// Athletics' Olympic athletics programme).
describe("referenceGamesOf", () => {
  it.each([
    {
      name: "the owner's Paris 2024 row",
      competition: { kind: "games", source: "owner", sourceRef: "paris-2024", startDate: "2024-07-24", endDate: "2024-08-11" },
      expected: "paris-2024",
    },
    {
      name: "the owner's Milano-Cortina 2026 row",
      competition: { kind: "games", source: "owner", sourceRef: "milano-cortina-2026", startDate: "2026-02-04", endDate: "2026-02-22" },
      expected: "milano-cortina-2026",
    },
    {
      name: "a source's Olympic athletics at Paris 2024",
      competition: { kind: "games", source: "world-athletics", sourceRef: "7087", startDate: "2024-08-01", endDate: "2024-08-11" },
      expected: "paris-2024",
    },
    {
      name: "a source's Olympic speed skating at Milano-Cortina 2026",
      competition: { kind: "games", source: "isu-speed-skating", sourceRef: "2026_ITA_0001", startDate: "2026-02-07", endDate: "2026-02-21" },
      expected: "milano-cortina-2026",
    },
    {
      name: "the owner's LA 2028 row is followed, not a reference",
      competition: { kind: "games", source: "owner", sourceRef: "la-2028", startDate: "2028-07-12", endDate: "2028-07-30" },
      expected: null,
    },
    {
      name: "a Championship on the Paris 2024 days is not the Games",
      competition: { kind: "championship", source: "uci", sourceRef: "x", startDate: "2024-08-01", endDate: "2024-08-04" },
      expected: null,
    },
    {
      name: "Tokyo 2020 (before the reference Games)",
      competition: { kind: "games", source: "world-athletics", sourceRef: "tokyo", startDate: "2021-07-30", endDate: "2021-08-08" },
      expected: null,
    },
  ])("$name", ({ competition, expected }) => {
    expect(referenceGamesOf(competition)?.key ?? null).toBe(expected);
  });
});
