// Spec #20, stories 47, 55–57 and 59; GLOSSARY "Session"; ticket #37. How a
// Belgian Entry sits in the schedule, and the Live phase's day picker.
import { wallClockIn } from "./time-display";

/**
 * "scheduled": a round the Entry competes in (the one it starts in, or one a
 * result or start list shows it reached); "if-through": a later round,
 * reached only by advancing; "match-tbd": a pool or preliminary match whose
 * opponent and time wait for the draw.
 */
export type RoundState = "scheduled" | "if-through" | "match-tbd";

/** What a round's result said about the Entry: through to the next round, or out. */
export type RoundOutcome = "advanced" | "eliminated";

/**
 * What is known about an Entry in one round (ticket #38): its outcome there,
 * and whether a start list, heat draw or match detail names it in the round.
 */
export type RoundProgress = { round: string; outcome: RoundOutcome | null; listed: boolean };

/** The Entry's final classification in the event (a `result` row), when there is one. */
export type EventResult = { date: string; status: string };

export type EntryProgress = { rounds: readonly RoundProgress[]; result: EventResult | null };

const POOL = /^(pool|group|preliminar)/i;

const NO_PROGRESS: EntryProgress = { rounds: [], result: null };

/**
 * The rounds of its event an Entry is placed in, in time order: every round
 * from the one it starts in (`firstRound`, after a bye; the first round when
 * null or not in the timetable). Later rounds are "if through" until a result
 * or start list shows the Entry reached them, and drop once it is out: after
 * the round it was eliminated in, or after the date of a final
 * classification that is not a finish. A finished classification means every
 * round up to its date was reached.
 */
export function roundsFor<R extends { round: string; date: string }>(
  entry: { firstRound: string | null },
  rounds: readonly R[],
  progress: EntryProgress = NO_PROGRESS,
): (R & { state: RoundState; outcome: RoundOutcome | null })[] {
  const from = Math.max(0, rounds.findIndex((r) => r.round === entry.firstRound));
  const attached = rounds.slice(from);
  // A round may span several Sessions: progress is per round name, in order.
  const names = [...new Set(attached.map((r) => r.round))];
  const step = (round: string) => names.indexOf(round);
  let reached = 0;
  let outAfter = Infinity;
  const outcomes = new Map<string, RoundOutcome>();
  const listed = new Set<string>();
  for (const p of progress.rounds) {
    const i = step(p.round);
    if (i < 0) continue;
    if (p.listed) listed.add(p.round);
    if (p.outcome) outcomes.set(p.round, p.outcome);
    if (p.listed || p.outcome) reached = Math.max(reached, i);
    if (p.outcome === "advanced") reached = Math.max(reached, i + 1);
    if (p.outcome === "eliminated") outAfter = Math.min(outAfter, i);
  }
  const result = progress.result;
  if (result?.status === "finished") {
    for (const r of attached) if (r.date <= result.date) reached = Math.max(reached, step(r.round));
  }
  const kept = attached.filter((r) => step(r.round) <= outAfter && (!result || r.date <= result.date));
  return kept.map((r) => {
    const i = step(r.round);
    // A pool match stays TBD until its draw is known or the pool is behind the Entry.
    const state: RoundState = POOL.test(r.round)
      ? listed.has(r.round) || outcomes.has(r.round) || i < reached
        ? "scheduled"
        : "match-tbd"
      : i <= reached
        ? "scheduled"
        : "if-through";
    return { ...r, state, outcome: outcomes.get(r.round) ?? null };
  });
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
