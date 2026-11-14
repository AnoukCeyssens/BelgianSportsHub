// Spec #20, stories 47, 55–57 and 59; GLOSSARY "Session"; ticket #37. How a
// Belgian Entry sits in the schedule, and the Live phase's day picker.
import { wallClockIn } from "./time-display";

/**
 * "scheduled": the round the Entry starts in; "if-through": a later round,
 * reached only by advancing (#38 moves it on, or drops it, from results and
 * start lists); "match-tbd": a pool or preliminary match whose opponent and
 * time wait for the draw.
 */
export type RoundState = "scheduled" | "if-through" | "match-tbd";

const POOL = /^(pool|group|preliminar)/i;

/**
 * The rounds of its event an Entry is placed in, in time order: every round
 * from the one it starts in (`firstRound`, after a bye; the first round when
 * null or not in the timetable).
 */
export function roundsFor<R extends { round: string }>(entry: { firstRound: string | null }, rounds: readonly R[]): (R & { state: RoundState })[] {
  const from = Math.max(0, rounds.findIndex((r) => r.round === entry.firstRound));
  const attached = rounds.slice(from);
  const opening = attached.find((r) => !POOL.test(r.round))?.round;
  const startsInPool = attached.length > 0 && POOL.test(attached[0].round);
  return attached.map((r) => ({
    ...r,
    state: POOL.test(r.round) ? "match-tbd" : r.round === opening && !startsInPool ? "scheduled" : "if-through",
  }));
}

export type LiveDay = { date: string; day: number; marked: boolean };

/** Every competition day (venue-local), numbered from 1, marked when a Belgian Entry competes. */
export function liveDays(startDate: string, endDate: string, entryDates: readonly string[]): LiveDay[] {
  const marked = new Set(entryDates);
  const days: LiveDay[] = [];
  for (let date = startDate, day = 1; date <= endDate; date = nextDay(date), day++) days.push({ date, day, marked: marked.has(date) });
  return days;
}

/** The day the Live phase shows: the one asked for, else today at the venue, else the first day with Belgian Entries, else day one. */
export function dayToShow(asked: string | null, days: readonly LiveDay[], now: Date, venueZone: string): string {
  const has = (date: string | null) => date !== null && days.some((d) => d.date === date);
  if (has(asked)) return asked!;
  const today = wallClockIn(now, venueZone).slice(0, 10);
  if (has(today)) return today;
  return (days.find((d) => d.marked) ?? days[0]).date;
}

/** The short venue name after a venue time: initials of a several-word city ("LA"), else the city. */
export function venueLabel(city: string | null): string {
  if (!city) return "venue";
  const words = city.trim().split(/\s+/);
  return words.length > 1 ? words.map((w) => w[0].toUpperCase()).join("") : city.trim();
}

function nextDay(isoDate: string) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
