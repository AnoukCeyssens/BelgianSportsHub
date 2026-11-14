// Spec #20, stories 47 and 49; ticket #38: the Live phase's medal table. The
// other nations' counts are what the owner last pasted from the official
// medal table; Belgium's row is always Belgium's own medals (`belgiumMedals`).
import type { MedalCount } from "./teams";

export type MedalStanding = MedalCount & { nation: string };

export type MedalTableRow = MedalStanding & { rank: number; belgium: boolean };

const BELGIUM = /^(belgium|bel)\b|\(bel\)$/i;

/** Reads a pasted medal table: one nation per line, its gold, silver and bronze counts last (a rank before and a total after are dropped). */
export function readMedalTable(text: string): MedalStanding[] {
  const standings: MedalStanding[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    const counts: number[] = [];
    while (tokens.length > 0 && /^\d+$/.test(tokens.at(-1)!)) counts.unshift(Number(tokens.pop()));
    if (counts.length >= 4 && counts.at(-1) === counts.at(-4)! + counts.at(-3)! + counts.at(-2)!) counts.pop();
    if (counts.length < 3) continue;
    if (tokens.length > 0 && /^=?\d+\.?$/.test(tokens[0])) tokens.shift();
    const nation = tokens.join(" ");
    if (!nation) continue;
    const [gold, silver, bronze] = counts.slice(-3);
    standings.push({ nation, gold, silver, bronze });
  }
  return standings;
}

/** Whether a pasted nation is Belgium ("Belgium", "BEL", "Belgium (BEL)"). */
export function isBelgium(nation: string): boolean {
  return BELGIUM.test(nation.trim());
}

/** The medal table: by gold, then silver, then bronze (equal counts share a rank), with Belgium's own row in its place. */
export function medalTable(standings: readonly MedalStanding[], belgium: MedalCount): MedalTableRow[] {
  const rows = [
    ...standings.filter((s) => !isBelgium(s.nation)).map((s) => ({ ...s, belgium: false })),
    { nation: "Belgium", ...belgium, belgium: true },
  ].sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.nation.localeCompare(b.nation));
  return rows.map((row) => {
    const first = rows.findIndex((r) => r.gold === row.gold && r.silver === row.silver && r.bronze === row.bronze);
    return { rank: first + 1, nation: row.nation, gold: row.gold, silver: row.silver, bronze: row.bronze, belgium: row.belgium };
  });
}
