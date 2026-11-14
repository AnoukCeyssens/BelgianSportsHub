// The owner's answer to a merge-queue item (spec #20, stories 3 and 6): link
// the incoming identity to an existing Athlete, create a new Athlete from it,
// or mark it "not an Athlete". Linking or creating moves the item's results
// to the Athlete and remembers the IF ID, so later runs match on it.
import { asc, eq } from "drizzle-orm";
import { now } from "~/clock";
import { getDb, schema } from "~/db/client";

export type Resolution = { kind: "link"; athleteId: string } | { kind: "create" } | { kind: "not-an-athlete" };

export async function resolveMergeQueueItem(d1: D1Database, itemId: string, resolution: Resolution): Promise<void> {
  const db = getDb(d1);
  const item = await db.query.mergeQueueItem.findFirst({ where: eq(schema.mergeQueueItem.id, itemId) });
  if (!item || item.status !== "open") throw new Error(`No open merge-queue item ${itemId}`);
  const resolvedAt = now().toISOString();

  if (resolution.kind === "not-an-athlete") {
    await db.update(schema.mergeQueueItem).set({ status: "not-an-athlete", resolvedAt }).where(eq(schema.mergeQueueItem.id, item.id));
    return;
  }

  // The first senior international performance among the item's results starts the record.
  const [first] = await db
    .select({ date: schema.result.date, competition: schema.competition.name })
    .from(schema.result)
    .innerJoin(schema.competition, eq(schema.result.competitionId, schema.competition.id))
    .where(eq(schema.result.mergeQueueItemId, item.id))
    .orderBy(asc(schema.result.date))
    .limit(1);

  let athleteId: string;
  if (resolution.kind === "create") {
    const [row] = await db
      .insert(schema.athlete)
      .values({
        name: item.name,
        sport: item.sport,
        dateOfBirth: item.dateOfBirth,
        athleteSince: first?.date ?? null,
        athleteSinceCompetition: first?.competition ?? null,
        rawCopyId: item.rawCopyId,
      })
      .returning({ id: schema.athlete.id });
    athleteId = row.id;
  } else {
    athleteId = resolution.athleteId;
    const athlete = await db.query.athlete.findFirst({ where: eq(schema.athlete.id, athleteId) });
    if (!athlete) throw new Error(`No Athlete ${athleteId}`);
    if (first && (!athlete.athleteSince || first.date < athlete.athleteSince)) {
      await db
        .update(schema.athlete)
        .set({ athleteSince: first.date, athleteSinceCompetition: first.competition })
        .where(eq(schema.athlete.id, athleteId));
    }
  }

  await db
    .insert(schema.athleteExternalId)
    .values({ athleteId, scheme: item.scheme, value: item.value, rawCopyId: item.rawCopyId })
    .onConflictDoNothing();
  await db
    .update(schema.result)
    .set({ athleteId, mergeQueueItemId: null })
    .where(eq(schema.result.mergeQueueItemId, item.id));
  await db
    .update(schema.mergeQueueItem)
    .set({ status: resolution.kind === "create" ? "created" : "linked", athleteId, resolvedAt })
    .where(eq(schema.mergeQueueItem.id, item.id));
}
