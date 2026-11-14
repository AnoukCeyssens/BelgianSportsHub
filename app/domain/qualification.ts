// GLOSSARY "Qualification status", "Qualification track", "Olympic cycle",
// "Quota place"; ADR 0002; spec #20, stories 28–30, 34, 45, 82–87; ticket #32.
//
// A Qualification status is where one Entry (an Athlete or a Team, never a
// roster member) stands for one target: the next Olympic Games in its cycle,
// or its next Championship. It is curated (source + last-checked date);
// trackers and rankings only suggest (#33's `suggestStatus` goes next to
// these rules). Quota places (#36) are a separate fact (ADR 0002).
import { belgianDate } from "./monthly-checklist";
import { referenceGamesOf } from "./games";

export const QUALIFICATION_STATUSES = [
  "not-in-contention",
  "at-risk",
  "on-track",
  "eligible",
  "qualified",
  "selected",
  "not-selected",
  "withdrawn",
] as const;

export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];

export const QUALIFICATION_STATUS_LABELS: Record<QualificationStatus, string> = {
  "not-in-contention": "Not in contention",
  "at-risk": "At risk",
  "on-track": "On track",
  eligible: "Eligible",
  qualified: "Qualified",
  selected: "Selected",
  "not-selected": "Not selected",
  withdrawn: "Withdrawn",
};

export function isQualificationStatus(value: unknown): value is QualificationStatus {
  return typeof value === "string" && (QUALIFICATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether an Entry with this status is still in the race for its target,
 * which makes Belgium's Participation there likely (GLOSSARY "Participation").
 * Selected counts too: a Selection then also confirms it (#34).
 */
export function inContention(status: QualificationStatus): boolean {
  return status !== "not-in-contention" && status !== "not-selected" && status !== "withdrawn";
}

/** A track's state: ✓ met, ✗ not met, … pending (not decided yet). */
export type TrackState = "met" | "not-met" | "pending";

export const TRACK_STATES: readonly TrackState[] = ["met", "not-met", "pending"];

/** "higher": points, distances; "lower": times, ranking positions. Null: read from the text (rank or h:mm:ss → lower, else higher). */
export type TrackBetter = "higher" | "lower";

export type TrackMeasure = { needed: string; has: string; state: TrackState; better: TrackBetter | null };

const RANK = /\btop\s*\d|#\s*\d|\d\s*(?:st|nd|rd|th)\b/i;
const CLOCK = /\d+(?::\d{1,2}){1,2}(?:[.,]\d+)?/;
const NUMBER = /\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/;

/** The first figure in a track's text: "6 500 pts" → 6500, "#48" → 48, "2:06:30" → 7590 (seconds). */
function figure(text: string): number | null {
  const clock = text.match(CLOCK);
  if (clock) {
    return clock[0]
      .replace(",", ".")
      .split(":")
      .reduce((total, part) => total * 60 + Number(part), 0);
  }
  const n = text.match(NUMBER);
  return n ? Number(n[0].replace(/[   ]/g, "").replace(",", ".")) : null;
}

/**
 * How far along its progress bar a track is, 0–100: full once met; otherwise
 * what the Entry has against what is needed, when both hold a figure (a
 * ranking position, a time, points, a distance), else empty.
 */
export function trackProgress(track: TrackMeasure): number {
  if (track.state === "met") return 100;
  const needed = figure(track.needed);
  const has = figure(track.has);
  if (needed === null || has === null || needed <= 0 || has <= 0) return 0;
  const lower =
    track.better !== null ? track.better === "lower" : RANK.test(track.needed) || RANK.test(track.has) || CLOCK.test(track.needed);
  const ratio = lower ? needed / has : has / needed;
  return Math.max(0, Math.min(100, Math.floor(ratio * 100)));
}

/** Winter sports on the Olympic programme (Milano-Cortina 2026, French Alps 2030); anything else is summer. */
const WINTER_SPORTS = [
  "alpine skiing",
  "biathlon",
  "bobsleigh",
  "cross-country skiing",
  "curling",
  "figure skating",
  "freeride",
  "freestyle skiing",
  "ice hockey",
  "luge",
  "nordic combined",
  "short track",
  "skeleton",
  "ski jumping",
  "ski mountaineering",
  "snowboard",
  "speed skating",
];

export type OlympicCycle = "summer" | "winter";

/** GLOSSARY "Olympic cycle": the summer cycle (LA 2028) or the winter cycle (French Alps 2030). */
export function olympicCycleOf(sport: string): OlympicCycle {
  const s = sport.toLowerCase();
  return WINTER_SPORTS.some((w) => s === w || s.startsWith(`${w} `)) ? "winter" : "summer";
}

/** A Games competition's cycle: the Games' "sport" is "Olympic Games" or "Olympic Winter Games" (TRACKED_GAMES). */
function gamesCycle(c: { sport: string; series?: string | null }): OlympicCycle {
  return /winter/i.test(c.sport) || /winter/i.test(c.series ?? "") ? "winter" : olympicCycleOf(c.sport);
}

export type TargetCompetition = {
  id: string;
  kind: string;
  sport: string;
  series?: string | null;
  source: string;
  sourceRef: string;
  startDate: string;
  endDate: string;
};

export type QualificationTargets<C extends TargetCompetition> = { olympics: C | null; championship: C | null };

/**
 * An Entry's two targets (GLOSSARY "Qualification track"; stories 28 and 34):
 * - the next Olympics: the next Games of its sport's cycle not over yet
 *   (Belgian date), never a reference Games;
 * - the next Championship: only the one coming up next, i.e. the earliest
 *   Championship not over yet that has an Entry recorded for it
 *   (`withEntries`, competition ids), else the earliest in its sport.
 */
export function qualificationTargets<C extends TargetCompetition>(
  input: { sport: string; competitions: readonly C[]; withEntries: ReadonlySet<string> },
  now: Date,
): QualificationTargets<C> {
  const today = belgianDate(now);
  const ahead = input.competitions.filter((c) => c.endDate >= today).toSorted((a, b) => a.startDate.localeCompare(b.startDate));
  const cycle = olympicCycleOf(input.sport);
  const olympics = ahead.find((c) => c.kind === "games" && referenceGamesOf(c) === null && gamesCycle(c) === cycle) ?? null;
  const championships = ahead.filter((c) => c.kind === "championship");
  const championship =
    championships.find((c) => input.withEntries.has(c.id)) ??
    championships.find((c) => c.sport.toLowerCase() === input.sport.toLowerCase()) ??
    null;
  return { olympics, championship };
}

/** The number of ranking places a track's needed text names ("Top 24", "top-16 SOQC"); null when it names none. */
export function rankingPlaces(needed: string): number | null {
  const top = needed.match(/\btop[\s-]*(\d+)/i);
  return top ? Number(top[1]) : null;
}

export type RankingSnapshotFigures = { position: number; points: string | null };

/**
 * A ranking-linked track after a new ranking snapshot (ticket #33): it has
 * the snapshot's position (and points). While the window is open a position
 * is only where the Entry stands today, so the state is decided only once
 * the window has closed (inside the places → met, outside → not met), and
 * only when what is needed names a number of places; otherwise it stays.
 */
export function rankedTrack(
  track: { needed: string; state: TrackState },
  snapshot: RankingSnapshotFigures,
  windowClosed: boolean,
): { has: string; state: TrackState } {
  const has = snapshot.points ? `#${snapshot.position} · ${snapshot.points} pts` : `#${snapshot.position}`;
  const places = rankingPlaces(track.needed);
  if (places === null) return { has, state: track.state };
  if (!windowClosed) return { has, state: "pending" };
  return { has, state: snapshot.position <= places ? "met" : "not-met" };
}

/** A Quota place as the suggestion sees it (GLOSSARY "Quota place"; stored by #36). */
export type SuggestionQuotaPlace = {
  kind: "noc-owned" | "named";
  /** "provisional" | "allocated" | "accepted" | "entered" | "declined" | "lost". */
  state: string;
  /** The Entry a named place is linked to (an NOC-owned place links at Selection). */
  entryId: string | null;
};

export type SuggestionEntry = {
  id: string;
  status: QualificationStatus | null;
  /** The kind of target: the Games have Quota places, Championships only entry caps. */
  target: "games" | "championship";
  /** Whether the qualification window has closed (Belgian date past `qualification_closes_on`). */
  windowClosed: boolean;
  /** Belgian Entries in the same event that meet the criteria (`meetsCriteria`), this one included. */
  belgianCandidates: number;
};

/** The Entry's position on the ranking its tracks follow, and the places that ranking gives (null when not named). */
export type SuggestionRanking = { position: number; places: number | null };

/** An Entry meets the federation's criteria once one of its tracks (routes) is met. */
export function meetsCriteria(tracks: readonly { state: TrackState }[]): boolean {
  return tracks.some((t) => t.state === "met");
}

const OUTCOMES: readonly QualificationStatus[] = ["selected", "not-selected", "withdrawn"];
const FIRM_PLACE = ["allocated", "accepted", "entered"];

/**
 * The Qualification status trackers and rankings suggest for one Entry
 * (spec #20, stories 83 and 87; GLOSSARY "Qualification status"). Only ever
 * a suggestion: the owner applies, keeps or overrides it. Null when the
 * facts say nothing (only pending tracks, no ranking places).
 * - Selected, Not selected and Withdrawn are the selector's or the Entry's
 *   word: kept as they are.
 * - A named place linked to the Entry: Qualified once Allocated (or later),
 *   On track while Provisional.
 * - Meeting the criteria (a track met): Qualified at a Championship (no quota
 *   places). At the Games it depends on the NOC-owned places: as many places
 *   as Belgian candidates or more → Qualified (On track while the places are
 *   only Provisional), fewer → Eligible (three Belgians, two places: all
 *   Eligible); no place recorded yet → On track.
 * - Otherwise the ranking: inside its places → On track, outside → At risk.
 * - Every track missed → At risk. Once the window has closed, At risk
 *   becomes Not in contention.
 */
export function suggestStatus(
  entry: SuggestionEntry,
  tracks: readonly { state: TrackState }[],
  ranking: SuggestionRanking | null,
  quotaPlaces: readonly SuggestionQuotaPlace[],
): QualificationStatus | null {
  if (entry.status && OUTCOMES.includes(entry.status)) return entry.status;
  const live = quotaPlaces.filter((p) => p.state !== "declined" && p.state !== "lost");
  const named = live.find((p) => p.kind === "named" && p.entryId === entry.id);
  if (named) return FIRM_PLACE.includes(named.state) ? "qualified" : "on-track";

  if (meetsCriteria(tracks)) {
    if (entry.target === "championship") return "qualified";
    const noc = live.filter((p) => p.kind === "noc-owned");
    if (noc.length === 0) return "on-track";
    if (entry.belgianCandidates > noc.length) return "eligible";
    return noc.every((p) => FIRM_PLACE.includes(p.state)) ? "qualified" : "on-track";
  }

  const outside = entry.windowClosed ? "not-in-contention" : "at-risk";
  if (ranking && ranking.places !== null) return ranking.position <= ranking.places ? "on-track" : outside;
  if (tracks.length > 0 && tracks.every((t) => t.state === "not-met")) return outside;
  return null;
}

/** Days from today (Belgian date) until the qualification window closes: 0 on the day, negative once closed; null when not recorded. */
export function windowCountdown(closesOn: string | null, now: Date): number | null {
  if (!closesOn) return null;
  return Math.round((Date.parse(`${closesOn}T00:00:00Z`) - Date.parse(`${belgianDate(now)}T00:00:00Z`)) / 86_400_000);
}
