// Spec #20, stories 55, 61, 63 and 110; GLOSSARY "Session"; ticket #37. A
// timetable pasted into the Run sheet's Schedules step through the paste
// importer's table reading and column mapping, with timetable column roles:
// one row per event round (a Championship timetable) or per coded Session
// listing its rounds ("Women's 100m Semifinal / Men's 400m Hurdles Round 1",
// the Games' by-event schedule). Times are venue-local wall-clock times.
import { columnMapping, type PastedTable } from "./paste-table";

export const TIMETABLE_COLUMN_ROLES = ["ignore", "date", "start", "end", "session", "sport", "event", "round"] as const;
export type TimetableColumnRole = (typeof TIMETABLE_COLUMN_ROLES)[number];
export type SavedTimetableMapping = Partial<Record<string, TimetableColumnRole>>;

const GUESSES: [RegExp, TimetableColumnRole][] = [
  [/games day|session type|venue$|^zone$/, "ignore"],
  [/^(session )?code$|^session( (code|no\.?|id|number))?$/, "session"],
  [/^(date|day)$|^date\b/, "date"],
  [/^start|venue time|^time$|^local time$|kick-?off|^from$/, "start"],
  [/^end|^to$|^finish/, "end"],
  [/^sport|^discipline/, "sport"],
  [/^event$/, "event"],
  [/round|phase|description|^race$|^match$|programme|^unit$/, "round"],
];

function guessTimetableRole(header: string): TimetableColumnRole {
  const h = header.trim().toLowerCase();
  return GUESSES.find(([pattern]) => pattern.test(h))?.[1] ?? "ignore";
}

/** Each timetable column's role: from the saved mapping where it knows the header, guessed otherwise. */
export function timetableColumnMapping(head: readonly string[], saved: SavedTimetableMapping | null) {
  return columnMapping<TimetableColumnRole>(head, saved, guessTimetableRole);
}

const ROUND =
  /^(.*?)\s+((?:pool|group|preliminar(?:y|ies))\b.*|(?:heats?|round (?:of )?\d+|r\d+|repechages?|quarter-?finals?|semi-?finals?|finals?|qualification(?: [a-z+]+)?|qualifying|day \d+|run \d+|ranking round|(?:gold|bronze) medal (?:match|game)|medal matches)(?:\s*\(.*\))?)$/i;

/** "Women's 500 m heats" → event "Women's 500 m", round "Heats". Without a round word the whole race is its one round, the Final. */
export function splitEventRound(text: string): { event: string; round: string } {
  const m = text.trim().match(ROUND);
  if (!m) return { event: text.trim(), round: "Final" };
  return { event: m[1].trim(), round: m[2][0].toUpperCase() + m[2].slice(1) };
}

/** One event round read from a timetable: a Session's date, times and code, and the round in it. */
export type TimetableRound = {
  /** The table row it came from (a coded Session row gives several rounds). */
  index: number;
  /** YYYY-MM-DD, venue-local. */
  date: string;
  /** HH:mm venue-local; null when the timetable gives none (TBD). */
  start: string | null;
  end: string | null;
  /** The organiser's Session code (LA28 "ATH02"); null when the timetable has no blocks. */
  session: string | null;
  sport: string;
  event: string;
  round: string;
};

export type TimetableSkip = { index: number; why: "no date" | "outside the competition's days" | "no event" };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The event rounds of a pasted timetable. Dates without a year take the year
 * that puts them inside the competition's days; rows outside those days, or
 * without a date or event, are skipped (and said so).
 */
export function readTimetable(
  table: PastedTable,
  roles: readonly TimetableColumnRole[],
  competition: { startDate: string; endDate: string; sport: string },
): { rounds: TimetableRound[]; skipped: TimetableSkip[] } {
  const rounds: TimetableRound[] = [];
  const skipped: TimetableSkip[] = [];
  table.rows.forEach((row, index) => {
    const cell = (role: TimetableColumnRole) => {
      const i = roles.indexOf(role);
      const value = i < 0 ? "" : (row[i] ?? "").trim();
      return value === "" ? null : value;
    };
    const date = readDate(cell("date"), competition);
    if (!date) return skipped.push({ index, why: "no date" });
    if (date < competition.startDate || date > competition.endDate) return skipped.push({ index, why: "outside the competition's days" });
    const startCell = readTimes(cell("start"));
    const end = readTimes(cell("end"))?.[0] ?? startCell?.[1] ?? null;
    const event = cell("event");
    const roundCell = cell("round");
    const parts = event
      ? [{ event, round: roundCell ?? "Final" }]
      : (roundCell ?? "")
          .split(/\s+\/\s+/)
          .filter((p) => p.trim() !== "")
          .map(splitEventRound);
    if (parts.length === 0) return skipped.push({ index, why: "no event" });
    for (const p of parts) {
      rounds.push({
        index,
        date,
        start: startCell?.[0] ?? null,
        end,
        session: cell("session"),
        sport: cell("sport") ?? competition.sport,
        event: p.event,
        round: p.round,
      });
    }
  });
  return { rounds, skipped };
}

/** "17:00–20:15" → ["17:00", "20:15"]; "9:35" → ["09:35", null]; TBD → null. */
function readTimes(value: string | null): [string, string | null] | null {
  const times = [...(value ?? "").matchAll(/\b(\d{1,2})[:.h](\d{2})\b/g)].map((m) => `${m[1].padStart(2, "0")}:${m[2]}`);
  return times.length === 0 ? null : [times[0], times[1] ?? null];
}

function readDate(value: string | null, competition: { startDate: string; endDate: string }): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const numeric = value.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}))?\b/);
  if (numeric) return withYear(numeric[3], Number(numeric[2]), Number(numeric[1]), competition);
  const lower = value.toLowerCase();
  const dayFirst = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/);
  const monthFirst = lower.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/);
  for (const [day, month, year] of [
    dayFirst ? [dayFirst[1], dayFirst[2], dayFirst[3]] : null,
    monthFirst ? [monthFirst[2], monthFirst[1], monthFirst[3]] : null,
  ].filter((x) => x !== null)) {
    const m = MONTHS.indexOf(month!);
    if (m >= 0) return withYear(year, m + 1, Number(day), competition);
  }
  return null;
}

function withYear(year: string | undefined, month: number, day: number, competition: { startDate: string; endDate: string }) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const on = (y: string) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (year) return on(year);
  const years = [competition.startDate.slice(0, 4), competition.endDate.slice(0, 4)];
  return years.map(on).find((d) => d >= competition.startDate && d <= competition.endDate) ?? on(years[0]);
}
