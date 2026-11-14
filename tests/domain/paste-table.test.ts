import { describe, expect, it } from "vitest";
import { belgianPastedRows, belgianRankingRows, columnMapping, readHtmlTable, readPastedTable, type PasteColumnRole } from "~/domain";

// Spec #20, story 104; ticket #25: the generic paste importer reads a table
// pasted from the browser (or a plain HTML page), guesses what each column
// holds the first time, and suggests the Belgian rows.

describe("readPastedTable", () => {
  it.each([
    {
      name: "tab-separated, as copied from a browser table",
      text: "Pl\tName\tNat\n1\tKIM Ji-woo\tKOR\n5\tVOS Hanne\tBEL\n",
      head: ["Pl", "Name", "Nat"],
      rows: [
        ["1", "KIM Ji-woo", "KOR"],
        ["5", "VOS Hanne", "BEL"],
      ],
    },
    {
      name: "Windows line ends, blank lines and an ellipsis row are dropped",
      text: "Rank\tName\r\n\r\n1\tLI Wen\r\n...\t...\r\n61\tDE WAELE Jonas\r\n",
      head: ["Rank", "Name"],
      rows: [
        ["1", "LI Wen"],
        ["61", "DE WAELE Jonas"],
      ],
    },
    {
      name: "comma-separated",
      text: "Rank,Name,NOC\n3,LECLERCQ Charlotte,BEL",
      head: ["Rank", "Name", "NOC"],
      rows: [["3", "LECLERCQ Charlotte", "BEL"]],
    },
    {
      name: "columns aligned with runs of spaces",
      text: "Rank  Name            NOC\n3     LECLERCQ Charlotte  BEL",
      head: ["Rank", "Name", "NOC"],
      rows: [["3", "LECLERCQ Charlotte", "BEL"]],
    },
  ])("$name", ({ text, head, rows }) => {
    expect(readPastedTable(text)).toEqual({ head, rows });
  });
});

describe("readHtmlTable", () => {
  it.each([
    {
      name: "the biggest table on the page, cells as text",
      html: `<table><tr><td>Menu</td></tr></table>
        <table class="results"><thead><tr><th>Pl.</th><th>Athlete</th><th>NOC</th></tr></thead>
        <tbody><tr><td>1</td><td><a href="/a/1">KIM&nbsp;Ji-woo</a></td><td>KOR</td></tr>
        <tr><td>5</td><td>VOS <b>Hanne</b></td><td>BEL</td></tr>
        <tr><td>6</td><td>D&#233;BORAH &amp; co</td><td>FRA</td></tr></tbody></table>`,
      head: ["Pl.", "Athlete", "NOC"],
      rows: [
        ["1", "KIM Ji-woo", "KOR"],
        ["5", "VOS Hanne", "BEL"],
        ["6", "DéBORAH & co", "FRA"],
      ],
    },
    { name: "no table at all", html: "<p>Results will follow</p>", head: [], rows: [] },
  ])("$name", ({ html, head, rows }) => {
    expect(readHtmlTable(html)).toEqual({ head, rows });
  });
});

describe("columnMapping", () => {
  it.each<{ name: string; head: string[]; saved: Record<string, PasteColumnRole> | null; roles: PasteColumnRole[]; fromSaved: boolean }>([
    {
      name: "guessed on first use",
      head: ["Pl", "Name", "Nat", "Time", "ISU ID", "Born", "Club"],
      saved: null,
      roles: ["place", "name", "nation", "performance", "if-id", "date-of-birth", "ignore"],
      fromSaved: false,
    },
    {
      name: "guessing other common headers",
      head: ["Rank", "Rider", "Horse", "NF", "Faults", "FEI ID", "Event", "DOB"],
      saved: null,
      roles: ["place", "name", "ignore", "nation", "performance", "if-id", "event", "date-of-birth"],
      fromSaved: false,
    },
    {
      name: "the saved mapping wins over guessing, matched by header",
      head: ["Rank", "Rider", "Horse", "NF"],
      saved: { rank: "place", rider: "name", horse: "ignore", nf: "nation" },
      roles: ["place", "name", "ignore", "nation"],
      fromSaved: true,
    },
    {
      name: "a header the saved mapping never saw is guessed",
      head: ["Rank", "Rider", "Time"],
      saved: { rank: "place", rider: "name" },
      roles: ["place", "name", "performance"],
      fromSaved: false,
    },
  ])("$name", ({ head, saved, roles, fromSaved }) => {
    expect(columnMapping(head, saved)).toEqual({ roles, fromSaved });
  });
});

describe("belgianPastedRows", () => {
  const roles: PasteColumnRole[] = ["place", "name", "nation", "performance", "if-id", "date-of-birth"];

  it.each([
    {
      name: "a finisher",
      row: ["5", "VOS Hanne", "BEL", "1:29.871", "SR-20451", "2001-03-04"],
      expected: { name: "VOS Hanne", ifId: "SR-20451", dateOfBirth: "2001-03-04", place: 5, status: "finished", performance: "1:29.871" },
    },
    {
      name: "place with a dot or a tie mark, day-first date of birth",
      row: ["=12.", "PEETERS Ella", "bel", "1:31.402", "SR-23901", "04/03/2001"],
      expected: { name: "PEETERS Ella", ifId: "SR-23901", dateOfBirth: "2001-03-04", place: 12, status: "finished", performance: "1:31.402" },
    },
    {
      name: "did not finish, written in the place column",
      row: ["DNF", "MAES Tibo", "BEL", "", "SR-1", ""],
      expected: { name: "MAES Tibo", ifId: "SR-1", dateOfBirth: null, place: null, status: "DNF", performance: null },
    },
    {
      name: "disqualified, written in the performance column",
      row: ["", "MAES Tibo", "Belgium", "DQ", "SR-1", "4.3.2001"],
      expected: { name: "MAES Tibo", ifId: "SR-1", dateOfBirth: "2001-03-04", place: null, status: "DSQ", performance: null },
    },
  ])("$name", ({ row, expected }) => {
    expect(belgianPastedRows({ head: [], rows: [row] }, roles)).toEqual([{ index: 0, event: null, ...expected }]);
  });

  it.each([
    { name: "another nation", row: ["1", "KIM Ji-woo", "KOR", "1:28.902", "SR-10011", ""] },
    { name: "did not start", row: ["DNS", "VOS Hanne", "BEL", "", "SR-20451", ""] },
  ])("leaves out $name", ({ row }) => {
    expect(belgianPastedRows({ head: [], rows: [row] }, roles)).toEqual([]);
  });

  it("reads the event from its column when one is mapped, keeping the row's position", () => {
    const table = { head: [], rows: [["WS", "1", "KOVAC M.", "SLO"], ["MS", "3", "DE WAELE Jonas", "BEL"]] };
    expect(belgianPastedRows(table, ["event", "place", "name", "nation"])).toEqual([
      { index: 1, event: "MS", name: "DE WAELE Jonas", ifId: null, dateOfBirth: null, place: 3, status: "finished", performance: null },
    ]);
  });
});

// #20 review (D): a pasted ranking (Assisted sources' world rankings) uses the
// same importer, with the ranking position and points as column roles.
describe("belgianRankingRows", () => {
  const roles: PasteColumnRole[] = ["ranking-position", "name", "nation", "ranking-points", "if-id"];

  it.each([
    {
      name: "an Athlete's position and points",
      row: ["18", "DE WAELE Jonas", "BEL", "412.50", "BWF-77"],
      expected: [{ index: 0, event: null, name: "DE WAELE Jonas", ifId: "BWF-77", dateOfBirth: null, position: 18, points: "412.50" }],
    },
    {
      name: "a tied position (T18, =18)",
      row: ["T18", "DE WAELE Jonas", "Belgium", "", "BWF-77"],
      expected: [{ index: 0, event: null, name: "DE WAELE Jonas", ifId: "BWF-77", dateOfBirth: null, position: 18, points: null }],
    },
    { name: "no position: left out", row: ["", "DE WAELE Jonas", "BEL", "", "BWF-77"], expected: [] },
    { name: "another nation: left out", row: ["1", "AXELSEN Viktor", "DEN", "110000", "BWF-1"], expected: [] },
  ])("$name", ({ row, expected }) => {
    expect(belgianRankingRows({ head: [], rows: [row] }, roles)).toEqual(expected);
  });

  it("reads a nation ranking (no name column) as Belgium's rows", () => {
    const table = { head: [], rows: [["7", "Netherlands", "2210"], ["12", "Belgium", "1540"]] };
    expect(belgianRankingRows(table, ["ranking-position", "nation", "ranking-points"])).toEqual([
      { index: 1, event: null, name: null, ifId: null, dateOfBirth: null, position: 12, points: "1540" },
    ]);
  });
});
