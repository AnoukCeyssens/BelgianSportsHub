// Spec #20, stories 64, 67–70 and the `pickLockAt` / `canPick` /
// `expandShortcut` rules; GLOSSARY "Expectation", "Seed"; ticket #40 (decided
// in #12 and #16).
// - An Expectation's value is a finishing place or a place range (`PlaceRange`).
// - A personal pick is entered through shortcuts (`readShortcut` reads what the
//   owner typed, `expandShortcut` gives its place range).
// - Picks open once the Entry is Selected and lock at the competition's first
//   Session, midnight venue time on day one without one (`pickLockAt`,
//   `canPick`). At the Games, pass the Games' combined inputs: every sport
//   locks together at the Games' first Session.
// - Seeds are dated snapshots: the Entry's world-ranking position monthly
//   until the entry list exists (`worldRankSnapshotDue`), then the final Seed
//   with its method. Verdicts (#41) compare with the last snapshot before the
//   start (`lastSnapshotBefore`).
import { zonedWallClockToInstant, BELGIAN_ZONE } from "./time-display";
import type { PhaseInputs } from "./phase";
import type { QualificationStatus } from "./qualification";

/** A finishing place (from = to) or a place range, 1-based, from ≤ to. */
export type PlaceRange = { from: number; to: number };

/** Knockout rounds whose exit classifies a place range (the losers of that round). */
export const KNOCKOUT_ROUNDS = {
  SF: { label: "Semi-final exit", range: { from: 3, to: 4 } },
  QF: { label: "Quarter-final exit", range: { from: 5, to: 8 } },
  R16: { label: "Round of 16 exit", range: { from: 9, to: 16 } },
  R32: { label: "Round of 32 exit", range: { from: 17, to: 32 } },
  R64: { label: "Round of 64 exit", range: { from: 33, to: 64 } },
} as const;
export type KnockoutRound = keyof typeof KNOCKOUT_ROUNDS;

export type Shortcut =
  | { kind: "gold" | "silver" | "bronze" | "medal" | "final" }
  | { kind: "round"; round: KnockoutRound }
  | { kind: "place"; place: number }
  | { kind: "range"; from: number; to: number };

const NAMED: Record<string, Shortcut> = {
  gold: { kind: "gold" },
  silver: { kind: "silver" },
  bronze: { kind: "bronze" },
  medal: { kind: "medal" },
  final: { kind: "final" },
  "top 8": { kind: "final" },
  top8: { kind: "final" },
  "final / top 8": { kind: "final" },
};

const ROUND_WORDS: Record<string, KnockoutRound> = {
  sf: "SF",
  "semi-final": "SF",
  semifinal: "SF",
  qf: "QF",
  "quarter-final": "QF",
  quarterfinal: "QF",
  r16: "R16",
  "round of 16": "R16",
  r32: "R32",
  "round of 32": "R32",
  r64: "R64",
  "round of 64": "R64",
};

/** The shortcuts offered as suggestions in the pick input, in order. */
export const PICK_SUGGESTIONS = ["Gold", "Silver", "Bronze", "Medal", "Top 8", "SF exit", "QF exit", "R16 exit", "R32 exit", "5", "5-8"] as const;

/**
 * What the owner typed, as a shortcut: Gold, Silver, Bronze, Medal, Final or
 * Top 8, a round exit (SF, QF, R16, R32, R64, written out or not, "exit"
 * optional), an exact place ("5", "5th") or a range ("5-8", "5th–8th").
 * Null when it is none of these or the places make no sense.
 */
export function readShortcut(typed: string): Shortcut | null {
  const text = typed.trim().toLowerCase().replace(/\s+/g, " ");
  if (text in NAMED) return NAMED[text];
  const round = ROUND_WORDS[text.replace(/ exit$/, "")];
  if (round) return { kind: "round", round };
  const place = /^(\d+)(?:st|nd|rd|th)?$/.exec(text);
  if (place) {
    const n = Number(place[1]);
    return n >= 1 ? { kind: "place", place: n } : null;
  }
  const range = /^(\d+)(?:st|nd|rd|th)? ?[-–—] ?(\d+)(?:st|nd|rd|th)?$/.exec(text);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    if (from < 1 || to < from) return null;
    return from === to ? { kind: "place", place: from } : { kind: "range", from, to };
  }
  return null;
}

/** The place range a shortcut stands for. */
export function expandShortcut(shortcut: Shortcut): PlaceRange {
  switch (shortcut.kind) {
    case "gold":
      return { from: 1, to: 1 };
    case "silver":
      return { from: 2, to: 2 };
    case "bronze":
      return { from: 3, to: 3 };
    case "medal":
      return { from: 1, to: 3 };
    case "final":
      return { from: 1, to: 8 };
    case "round":
      return { ...KNOCKOUT_ROUNDS[shortcut.round].range };
    case "place":
      return { from: shortcut.place, to: shortcut.place };
    case "range":
      return { from: shortcut.from, to: shortcut.to };
  }
}

/** How a shortcut reads: "Medal", "Final / top 8", "Quarter-final exit", "5th", "5th–8th". */
export function shortcutLabel(shortcut: Shortcut): string {
  switch (shortcut.kind) {
    case "gold":
    case "silver":
    case "bronze":
    case "medal":
      return shortcut.kind[0].toUpperCase() + shortcut.kind.slice(1);
    case "final":
      return "Final / top 8";
    case "round":
      return KNOCKOUT_ROUNDS[shortcut.round].label;
    default:
      return placeRangeLabel(expandShortcut(shortcut));
  }
}

/** The shortcut as stored and typed back into the input: "medal", "QF exit", "5", "5-8". */
export function shortcutText(shortcut: Shortcut): string {
  switch (shortcut.kind) {
    case "round":
      return `${shortcut.round} exit`;
    case "place":
      return String(shortcut.place);
    case "range":
      return `${shortcut.from}-${shortcut.to}`;
    default:
      return shortcut.kind;
  }
}

/** "17th"; "5th–8th" for a range. */
export function placeRangeLabel(range: PlaceRange): string {
  return range.from === range.to ? ordinal(range.from) : `${ordinal(range.from)}–${ordinal(range.to)}`;
}

function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/**
 * When a competition's personal picks lock: its first Session's start at the
 * venue, or midnight venue time on day one without one (Belgian time when the
 * venue zone is unknown). The same moment the competition goes Live. For the
 * Games pass `gamesPhaseInputs(...).whole`: every sport locks together.
 */
export function pickLockAt(inputs: PhaseInputs): Date {
  return zonedWallClockToInstant(inputs.firstSessionStart ?? `${inputs.startDate}T00:00`, inputs.venueZone ?? BELGIAN_ZONE);
}

/** Whether a pick can be made or changed now: the Entry is Selected and its competition's picks have not locked. */
export function canPick(entry: { status: QualificationStatus | null; lockAt: Date }, now: Date): boolean {
  return entry.status === "selected" && now < entry.lockAt;
}

/** Sources of external Expectations. Gracenote is entered at the Games only (#41). */
export const EXPECTATION_SOURCES = ["seed", "gracenote"] as const;
export type ExpectationSource = (typeof EXPECTATION_SOURCES)[number];

/**
 * How a Seed was taken: the Entry's world-ranking position (monthly, before
 * the entry list exists), or the final Seed: the international federation's
 * seeding, or the Entry's position in the entry list ranked by world ranking
 * or by season's best.
 */
export const SEED_METHODS = ["world-rank", "federation-seed", "ranking", "season-best"] as const;
export type SeedMethod = (typeof SEED_METHODS)[number];

export const SEED_METHOD_LABELS: Record<SeedMethod, string> = {
  "world-rank": "world ranking",
  "federation-seed": "federation seed",
  ranking: "entry list by ranking",
  "season-best": "entry list by season's best",
};

export const isSeedMethod = (value: unknown): value is SeedMethod => SEED_METHODS.includes(value as SeedMethod);

/** Whether a Seed snapshot is the final Seed (taken from the entry list), not a monthly world-rank snapshot. */
export const isFinalSeed = (method: string | null) => method !== null && method !== "world-rank";

/**
 * Whether the Entry's monthly world-rank snapshot is due today (Belgian date):
 * none this month yet, and no final Seed recorded (the entry list exists).
 */
export function worldRankSnapshotDue(seeds: readonly { asOf: string; method: string | null }[], today: string): boolean {
  if (seeds.some((s) => isFinalSeed(s.method))) return false;
  return !seeds.some((s) => s.asOf.slice(0, 7) === today.slice(0, 7));
}

/**
 * The snapshot a Verdict compares with (story 75): the latest one dated
 * before `day` (YYYY-MM-DD, the competition's first day), so later
 * information never changes history. Null when none is that early.
 */
export function lastSnapshotBefore<T extends { asOf: string }>(snapshots: readonly T[], day: string): T | null {
  return snapshots.filter((s) => s.asOf < day).toSorted((a, b) => b.asOf.localeCompare(a.asOf))[0] ?? null;
}
