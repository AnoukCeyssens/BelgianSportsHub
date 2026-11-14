import { describe, expect, it } from "vitest";
import { medalTable, readMedalTable } from "~/domain";

// Spec #20, stories 47 and 49; ticket #38. During Live the competition page
// shows the medal table with Belgium highlighted. The other nations' counts
// come from a medal table the owner pastes in the Live day pass; Belgium's
// row is always Belgium's own medals (`belgiumMedals`), never the pasted one.

describe("readMedalTable", () => {
  it.each([
    {
      name: "a table copied from an official results site (tab-separated, with a total)",
      text: "Rank\tNOC\tGold\tSilver\tBronze\tTotal\n1\tUnited States of America\t40\t44\t42\t126\n2\tPeople's Republic of China\t40\t27\t24\t91\n=34\tBelgium\t3\t1\t6\t10",
      expected: [
        { nation: "United States of America", gold: 40, silver: 44, bronze: 42 },
        { nation: "People's Republic of China", gold: 40, silver: 27, bronze: 24 },
        { nation: "Belgium", gold: 3, silver: 1, bronze: 6 },
      ],
    },
    {
      name: "lines typed with spaces, codes in brackets and no total",
      text: "1 Netherlands (NED) 4 2 1\n2 Norway (NOR) 3 3 0\n",
      expected: [
        { nation: "Netherlands (NED)", gold: 4, silver: 2, bronze: 1 },
        { nation: "Norway (NOR)", gold: 3, silver: 3, bronze: 0 },
      ],
    },
    {
      name: "a rank first and a total last are both dropped",
      text: "7 Italy 1 2 3 6\n",
      expected: [{ nation: "Italy", gold: 1, silver: 2, bronze: 3 }],
    },
    {
      name: "headers, blank lines and lines without three counts are left out",
      text: "Medal table after day 4\n\nGold Silver Bronze\nJapan 2 1\nKenya 1 0 0",
      expected: [{ nation: "Kenya", gold: 1, silver: 0, bronze: 0 }],
    },
  ])("$name", ({ text, expected }) => {
    expect(readMedalTable(text)).toEqual(expected);
  });
});

describe("medalTable", () => {
  const nl = { nation: "Netherlands", gold: 4, silver: 2, bronze: 1 };
  const no = { nation: "Norway", gold: 3, silver: 3, bronze: 0 };
  const it_ = { nation: "Italy", gold: 0, silver: 1, bronze: 2 };
  const row = (rank: number, nation: string, gold: number, silver: number, bronze: number, belgium = false) => ({ rank, nation, gold, silver, bronze, belgium });

  it.each([
    {
      name: "ranked by gold, then silver, then bronze, Belgium highlighted in its place",
      standings: [it_, nl, no],
      belgium: { gold: 1, silver: 0, bronze: 0 },
      expected: [row(1, "Netherlands", 4, 2, 1), row(2, "Norway", 3, 3, 0), row(3, "Belgium", 1, 0, 0, true), row(4, "Italy", 0, 1, 2)],
    },
    {
      name: "Belgium's own medals replace the pasted Belgium row",
      standings: [nl, { nation: "Belgium (BEL)", gold: 0, silver: 0, bronze: 1 }],
      belgium: { gold: 0, silver: 1, bronze: 1 },
      expected: [row(1, "Netherlands", 4, 2, 1), row(2, "Belgium", 0, 1, 1, true)],
    },
    {
      name: "a pasted BEL code is Belgium too",
      standings: [{ nation: "BEL", gold: 9, silver: 9, bronze: 9 }],
      belgium: { gold: 0, silver: 0, bronze: 1 },
      expected: [row(1, "Belgium", 0, 0, 1, true)],
    },
    {
      name: "equal counts share a rank",
      standings: [nl, { nation: "Austria", gold: 4, silver: 2, bronze: 1 }, no],
      belgium: { gold: 0, silver: 0, bronze: 0 },
      expected: [row(1, "Austria", 4, 2, 1), row(1, "Netherlands", 4, 2, 1), row(3, "Norway", 3, 3, 0), row(4, "Belgium", 0, 0, 0, true)],
    },
    {
      name: "nothing pasted yet: Belgium alone",
      standings: [],
      belgium: { gold: 2, silver: 0, bronze: 1 },
      expected: [row(1, "Belgium", 2, 0, 1, true)],
    },
  ])("$name", ({ standings, belgium, expected }) => {
    expect(medalTable(standings, belgium)).toEqual(expected);
  });
});
