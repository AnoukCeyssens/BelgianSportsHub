// Tracks that follow a ranking (ticket #33): each takes its Entry's latest
// snapshot on that ranking (`rankedTrack`), so ranking ingest updates what a
// track "has" and stamps `changed_on` only on a real change. Called by the
// ingest writer after every snapshot and by the owner's page when a track is
// linked to a ranking.
import { and, desc, eq, inArray } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { belgianDate, rankedTrack, type TrackState } from "~/domain";

export type RankedWho = { athleteId: string } | { teamId: string };

/** The latest snapshot of an Athlete or Team on one ranking, or undefined. */
export async function latestSnapshot(db: Db, source: string, ranking: string, who: RankedWho) {
  const s = schema.rankingSnapshot;
  const [row] = await db
    .select()
    .from(s)
    .where(and(eq(s.source, source), eq(s.ranking, ranking), "athleteId" in who ? eq(s.athleteId, who.athleteId) : eq(s.teamId, who.teamId)))
    .orderBy(desc(s.asOf))
    .limit(1);
  return row;
}

/**
 * Moves the tracks of this Athlete's or Team's Entries that follow this
 * ranking to its latest snapshot. `trackId` narrows it to one track. Returns
 * how many tracks changed.
 */
export async function followRanking(db: Db, ranking: { source: string; ranking: string; who: RankedWho; trackId?: string }, now: Date) {
  const snapshot = await latestSnapshot(db, ranking.source, ranking.ranking, ranking.who);
  if (!snapshot) return 0;
  const e = schema.entry;
  const t = schema.qualificationTrack;
  const entries = await db
    .select({ id: e.id, closesOn: schema.competition.qualificationClosesOn })
    .from(e)
    .innerJoin(schema.competition, eq(schema.competition.id, e.competitionId))
    .where("athleteId" in ranking.who ? eq(e.athleteId, ranking.who.athleteId) : eq(e.teamId, ranking.who.teamId));
  if (entries.length === 0) return 0;
  const tracks = await db
    .select()
    .from(t)
    .where(
      and(
        inArray(
          t.entryId,
          entries.map((x) => x.id),
        ),
        eq(t.rankingSource, ranking.source),
        eq(t.ranking, ranking.ranking),
        ranking.trackId ? eq(t.id, ranking.trackId) : undefined,
      ),
    );
  const today = belgianDate(now);
  let changed = 0;
  for (const track of tracks) {
    const closesOn = entries.find((x) => x.id === track.entryId)?.closesOn;
    const next = rankedTrack({ needed: track.needed, state: track.state as TrackState }, snapshot, closesOn ? closesOn < today : false);
    if (next.has === track.has && next.state === track.state) {
      await db.update(t).set({ checkedOn: today }).where(eq(t.id, track.id));
      continue;
    }
    await db
      .update(t)
      .set({ ...next, previousHas: next.has === track.has ? track.previousHas : track.has, checkedOn: today, changedOn: today })
      .where(eq(t.id, track.id));
    changed++;
  }
  return changed;
}
