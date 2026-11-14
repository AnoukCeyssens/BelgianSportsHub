// Test-data builders. They write rows the way an import or the curation area
// would, so Worker-surface tests can arrange state before calling a handler.
// Assertions still go through the handler (rendered page, response, R2 object).
import { eq } from "drizzle-orm";
import { getDb, schema } from "~/db/client";

type AthleteSeed = {
  name: string;
  sport: string;
  dateOfBirth?: string;
  note?: string;
  externalIds?: { scheme: string; value: string }[];
};

export async function seedAthlete(d1: D1Database, a: AthleteSeed): Promise<string> {
  const db = getDb(d1);
  const [row] = await db
    .insert(schema.athlete)
    .values({ name: a.name, sport: a.sport, dateOfBirth: a.dateOfBirth, note: a.note })
    .returning({ id: schema.athlete.id });
  for (const x of a.externalIds ?? []) {
    await db.insert(schema.athleteExternalId).values({ athleteId: row.id, ...x });
  }
  return row.id;
}

/** Sets a Source row's tier, cadence or health columns, as earlier runs or the owner would have. */
export async function setSource(d1: D1Database, key: string, patch: Partial<typeof schema.source.$inferInsert>) {
  await getDb(d1).update(schema.source).set(patch).where(eq(schema.source.key, key));
}

/**
 * Storage is shared by the tests in one file. Removes every Athlete and
 * everything ingest wrote (rows and raw copies in R2), keeping Source rows.
 */
export async function clearIngestedData(env: Pick<Env, "DB" | "RAW">) {
  const db = getDb(env.DB);
  for (const table of [
    schema.entrant,
    schema.result,
    schema.mergeQueueItem,
    schema.competition,
    schema.athleteExternalId,
    schema.athlete,
    schema.rawCopy,
  ]) {
    await db.delete(table);
  }
  const keys = (await env.RAW.list({ prefix: "raw/" })).objects.map((o) => o.key);
  if (keys.length > 0) await env.RAW.delete(keys);
}
