// Expectations from storage (GLOSSARY "Expectation", "Seed"; spec #20,
// stories 64 and 67–70; ticket #40). Two tables:
// - `expectation_snapshot`: dated external Expectations per Entry and source
//   (Seeds now; Gracenote from #41), a place or a place range;
// - `personal_pick`: the owner's one editable pick per Entry, no history.
// Every read and write goes through here:
// - `expectationsOf(db, entryIds)`: each Entry's Seed history, latest Seed and pick
//   (the Selection panel, the owner's page; #41's After panel);
// - `pickLockFor(db, competition)`: when the competition's picks lock (the
//   Games: one moment for every sport);
// - `setPick` / `clearPick`: the owner's pick, refused unless `canPick`;
// - `recordSeed` / `removeSeed`: a Seed snapshot (one per Entry per date);
// - `recordWorldRanks`: monthly world-rank snapshots from a ranking import
//   (#33), written only while one is due (`worldRankSnapshotDue`).
// Writes are the owner's (app/routes/curate.expectations.tsx) or an import's.
import { and, asc, eq, inArray } from "drizzle-orm";
import { gamesPhaseInputs, phaseInputsFor, type CompetitionRow } from "~/competition/phase-inputs";
import { type Db, schema } from "~/db/client";
import {
  belgianDate,
  canPick,
  expandShortcut,
  isQualificationStatus,
  isSeedMethod,
  pickLockAt,
  readShortcut,
  shortcutLabel,
  shortcutText,
  worldRankSnapshotDue,
  type ExpectationSource,
  type PlaceRange,
  type SeedMethod,
} from "~/domain";

export type SnapshotView = PlaceRange & {
  id: string;
  source: ExpectationSource;
  method: SeedMethod | null;
  asOf: string;
  sourceUrl: string | null;
};

export type PickView = PlaceRange & {
  /** As typed back into the input: "medal", "QF exit", "5-8". */
  shortcut: string;
  /** As read: "Medal", "Quarter-final exit", "5th–8th". */
  label: string;
  pickedAt: string;
};

export type EntryExpectations = {
  /** Seed snapshots, oldest first. */
  seeds: SnapshotView[];
  /** The latest Seed (the final Seed once recorded). */
  seed: SnapshotView | null;
  /** Whether this month's world-rank snapshot is still to be taken (no final Seed yet). */
  worldRankDue: boolean;
  pick: PickView | null;
};

/** Each Entry's Expectations, by Entry id (every id present). `now` decides whether a world-rank snapshot is due. */
export async function expectationsOf(db: Db, entryIds: readonly string[], now: Date): Promise<Map<string, EntryExpectations>> {
  if (entryIds.length === 0) return new Map();
  const s = schema.expectationSnapshot;
  const p = schema.personalPick;
  const [snapshots, picks] = await Promise.all([
    db
      .select()
      .from(s)
      .where(inArray(s.entryId, [...entryIds]))
      .orderBy(asc(s.asOf)),
    db
      .select()
      .from(p)
      .where(inArray(p.entryId, [...entryIds])),
  ]);
  const today = belgianDate(now);
  return new Map(
    entryIds.map((id) => {
      const seeds = snapshots
        .filter((x) => x.entryId === id && x.source === "seed")
        .map((x) => ({
          id: x.id,
          source: "seed" as const,
          from: x.placeFrom,
          to: x.placeTo,
          method: isSeedMethod(x.method) ? x.method : null,
          asOf: x.asOf,
          sourceUrl: x.sourceUrl,
        }));
      const row = picks.find((x) => x.entryId === id);
      const shortcut = row ? readShortcut(row.shortcut) : null;
      return [
        id,
        {
          seeds,
          seed: seeds.at(-1) ?? null,
          worldRankDue: worldRankSnapshotDue(seeds, today),
          pick:
            row && shortcut
              ? { from: row.placeFrom, to: row.placeTo, shortcut: row.shortcut, label: shortcutLabel(shortcut), pickedAt: row.pickedAt }
              : null,
        },
      ];
    }),
  );
}

/** When the competition's picks lock: its first Session (the Games: the first in any sport), else midnight venue time on day one. */
export async function pickLockFor(db: Db, competition: CompetitionRow): Promise<Date> {
  const inputs = competition.kind === "games" ? (await gamesPhaseInputs(db, competition)).whole : (await phaseInputsFor(db, [competition])).get(competition.id)!;
  return pickLockAt(inputs);
}

const refuse = (message: string, status = 400): never => {
  throw new Response(message, { status });
};

/** One Entry of the competition, refused when it is not there. */
async function entryAt(db: Db, competition: CompetitionRow, entryId: string) {
  const row = await db.query.entry.findFirst({ where: and(eq(schema.entry.id, entryId), eq(schema.entry.competitionId, competition.id)) });
  return row ?? refuse("No such Entry at this competition", 404);
}

/** Refused (409) unless the Entry is Selected and the competition's picks have not locked. */
async function mustBeAbleToPick(db: Db, competition: CompetitionRow, entryId: string, now: Date) {
  const row = await entryAt(db, competition, entryId);
  const status = isQualificationStatus(row.qualificationStatus) ? row.qualificationStatus : null;
  const lockAt = await pickLockFor(db, competition);
  if (!canPick({ status, lockAt }, now))
    refuse(status === "selected" ? "Picks for this competition are locked" : "A pick can be made once the Entry is Selected", 409);
}

/** The owner's pick for an Entry, typed as a shortcut; replaces any earlier pick (no history). */
export async function setPick(db: Db, competition: CompetitionRow, entryId: string, typed: string, now: Date) {
  await mustBeAbleToPick(db, competition, entryId, now);
  const shortcut = readShortcut(typed) ?? refuse(`Not a pick: "${typed}". Use Gold, Silver, Bronze, Medal, Top 8, a round exit (QF exit), a place (5) or a range (5-8).`);
  const range = expandShortcut(shortcut);
  const values = { shortcut: shortcutText(shortcut), placeFrom: range.from, placeTo: range.to, pickedAt: now.toISOString() };
  await db
    .insert(schema.personalPick)
    .values({ entryId, ...values })
    .onConflictDoUpdate({ target: schema.personalPick.entryId, set: values });
  return shortcutLabel(shortcut);
}

/** Clears the owner's pick (until the lock). */
export async function clearPick(db: Db, competition: CompetitionRow, entryId: string, now: Date) {
  await mustBeAbleToPick(db, competition, entryId, now);
  await db.delete(schema.personalPick).where(eq(schema.personalPick.entryId, entryId));
}

export type SeedInput = PlaceRange & {
  entryId: string;
  method: SeedMethod;
  /** Belgian date the Seed was taken. */
  asOf: string;
  sourceUrl: string | null;
  rawCopyId?: string | null;
};

/** Records a Seed snapshot; one on the same date for the same Entry is replaced. */
export async function recordSeed(db: Db, input: SeedInput, now: Date) {
  if (!Number.isInteger(input.from) || !Number.isInteger(input.to) || input.from < 1 || input.to < input.from) refuse("A Seed is a place or a place range");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) refuse("A Seed needs the date it was taken");
  const values = {
    placeFrom: input.from,
    placeTo: input.to,
    method: input.method,
    sourceUrl: input.sourceUrl,
    rawCopyId: input.rawCopyId ?? null,
    recordedAt: now.toISOString(),
  };
  const s = schema.expectationSnapshot;
  await db
    .insert(s)
    .values({ entryId: input.entryId, source: "seed", asOf: input.asOf, ...values })
    .onConflictDoUpdate({ target: [s.entryId, s.source, s.asOf], set: values });
}

/** Removes one Seed snapshot of this competition's Entries. */
export async function removeSeed(db: Db, competition: CompetitionRow, snapshotId: string) {
  const s = schema.expectationSnapshot;
  const row = await db.query.expectationSnapshot.findFirst({ where: and(eq(s.id, snapshotId), eq(s.source, "seed")) });
  if (!row) refuse("No such Seed", 404);
  await entryAt(db, competition, row!.entryId);
  await db.delete(s).where(eq(s.id, snapshotId));
}

/**
 * Monthly world-rank snapshots from a ranking import (#33): for each Entry,
 * its world-ranking position as of the ranking's date, written only when
 * that month's snapshot is due and no final Seed exists yet. Returns how many
 * were written.
 */
export async function recordWorldRanks(
  db: Db,
  ranks: readonly { entryId: string; rank: number; asOf: string; sourceUrl: string | null; rawCopyId: string | null }[],
  now: Date,
): Promise<number> {
  const existing = await expectationsOf(db, [...new Set(ranks.map((r) => r.entryId))], now);
  let written = 0;
  for (const r of ranks) {
    if (!worldRankSnapshotDue(existing.get(r.entryId)?.seeds ?? [], r.asOf)) continue;
    await recordSeed(db, { entryId: r.entryId, from: r.rank, to: r.rank, method: "world-rank", asOf: r.asOf, sourceUrl: r.sourceUrl, rawCopyId: r.rawCopyId }, now);
    existing.get(r.entryId)?.seeds.push({ id: "", source: "seed", from: r.rank, to: r.rank, method: "world-rank", asOf: r.asOf, sourceUrl: r.sourceUrl });
    written++;
  }
  return written;
}
