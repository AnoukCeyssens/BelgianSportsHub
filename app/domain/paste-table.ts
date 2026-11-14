// Spec #20, stories 4 and 104: the generic paste importer. The owner pastes a
// table copied from the browser (or the URL of a plain HTML page); each
// column's role is guessed the first time and then saved per source, matched
// by header; the Belgian rows are suggested for confirmation.

export type PastedTable = { head: string[]; rows: string[][] };

export const PASTE_COLUMN_ROLES = ["ignore", "place", "name", "nation", "performance", "if-id", "date-of-birth", "event"] as const;
export type PasteColumnRole = (typeof PASTE_COLUMN_ROLES)[number];

/** A saved column mapping: role per header, keyed by the header in lower case. */
export type SavedColumnMapping = Record<string, PasteColumnRole>;

/** Table text copied from a browser (tab-separated), or comma- or space-aligned text. */
export function readPastedTable(text: string): PastedTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const tabbed = lines.some((l) => l.includes("\t"));
  const split = (line: string) => (tabbed ? line.split("\t") : line.trim().split(/\s*,\s*|\s{2,}/)).map((c) => c.trim());
  const [head = [], ...rows] = lines.map(split);
  return { head, rows: rows.filter((r) => !r.every((c) => c === "..." || c === "…" || c === "")) };
}

/** The biggest table of a plain HTML page; its first row is the header. */
export function readHtmlTable(html: string): PastedTable {
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) =>
    [...m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
      .map((tr) => [...tr[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((td) => cellText(td[1])))
      .filter((cells) => cells.length > 0),
  );
  const biggest = tables.reduce<string[][]>((best, t) => (t.length > best.length ? t : best), []);
  const [head = [], ...rows] = biggest;
  return { head, rows };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function cellText(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const GUESSES: [RegExp, PasteColumnRole][] = [
  [/^(rank|rk|pl|pl\.|pos|pos\.|#|place|position|classification)$/, "place"],
  [/(^|\s)id$|^code$/, "if-id"],
  [/birth|^dob$|^born$|^yob$/, "date-of-birth"],
  [/^event|discipline|category/, "event"],
  [/name|athlete|player|rider|skater|competitor/, "name"],
  [/^(nat|nat\.|noc|nf|assoc|member|country|nation|nationality|team)$/, "nation"],
  [/time|result|mark|perf|faults|score|total|points/, "performance"],
];

function guessColumnRole(header: string): PasteColumnRole {
  const h = header.trim().toLowerCase();
  return GUESSES.find(([pattern]) => pattern.test(h))?.[1] ?? "ignore";
}

/**
 * Each column's role: from the source's saved mapping where it knows the
 * header, guessed otherwise. Results tables by default; other kinds of table
 * (timetables, #37) pass their own guess.
 */
export function columnMapping<Role extends string = PasteColumnRole>(
  head: readonly string[],
  saved: Partial<Record<string, Role>> | null,
  guess: (header: string) => Role = guessColumnRole as (header: string) => Role,
): { roles: Role[]; fromSaved: boolean } {
  const roles = head.map((h) => saved?.[h.trim().toLowerCase()] ?? guess(h));
  return { roles, fromSaved: saved !== null && head.every((h) => h.trim().toLowerCase() in saved) };
}

/** The mapping to save for a source: role per header. */
export function mappingToSave<Role extends string = PasteColumnRole>(head: readonly string[], roles: readonly Role[]): Record<string, Role | "ignore"> {
  return Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), roles[i] ?? "ignore"]));
}

export type PastedResultStatus = "finished" | "DNF" | "DSQ";

export type PastedResultRow = {
  /** Position in the table's rows, so the owner can tick it. */
  index: number;
  event: string | null;
  name: string;
  ifId: string | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  place: number | null;
  status: PastedResultStatus;
  performance: string | null;
};

const STATUS_WORDS: Record<string, PastedResultStatus | "DNS"> = { DNF: "DNF", DSQ: "DSQ", DQ: "DSQ", DNS: "DNS" };

/**
 * The Belgian rows of a pasted results table (nation BEL or Belgium). Did
 * not start is not a performance, so those rows are left out.
 */
export function belgianPastedRows(table: PastedTable, roles: readonly PasteColumnRole[]): PastedResultRow[] {
  const out: PastedResultRow[] = [];
  table.rows.forEach((row, index) => {
    const cell = (role: PasteColumnRole) => {
      const i = roles.indexOf(role);
      const value = i < 0 ? "" : (row[i] ?? "").trim();
      return value === "" ? null : value;
    };
    const nation = cell("nation")?.toUpperCase();
    if (nation !== "BEL" && nation !== "BELGIUM") return;
    const placeCell = cell("place");
    const performanceCell = cell("performance");
    const statusWord = STATUS_WORDS[placeCell?.toUpperCase() ?? ""] ?? STATUS_WORDS[performanceCell?.toUpperCase() ?? ""];
    if (statusWord === "DNS") return;
    const place = placeCell?.match(/^=?(\d+)\.?$/);
    out.push({
      index,
      event: cell("event"),
      name: cell("name") ?? "",
      ifId: cell("if-id"),
      dateOfBirth: isoDate(cell("date-of-birth")),
      place: statusWord ? null : place ? Number(place[1]) : null,
      status: statusWord ?? "finished",
      performance: statusWord && STATUS_WORDS[performanceCell?.toUpperCase() ?? ""] ? null : performanceCell,
    });
  });
  return out;
}

/** YYYY-MM-DD from ISO or day-first (04/03/2001, 4.3.2001) dates; null otherwise. */
function isoDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const m = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
