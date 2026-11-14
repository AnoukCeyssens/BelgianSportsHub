// Test-data builders. They write rows the way an import or the curation area
// would, so Worker-surface tests can arrange state before calling a handler.
// Assertions still go through the handler (rendered page, response, R2 object).
import { getDb, schema } from "~/db/client";

type AthleteSeed = {
  name: string;
  sport: string;
  dateOfBirth?: string;
  externalIds?: { scheme: string; value: string }[];
};

export async function seedAthlete(d1: D1Database, a: AthleteSeed): Promise<string> {
  const db = getDb(d1);
  const [row] = await db
    .insert(schema.athlete)
    .values({ name: a.name, sport: a.sport, dateOfBirth: a.dateOfBirth })
    .returning({ id: schema.athlete.id });
  for (const x of a.externalIds ?? []) {
    await db.insert(schema.athleteExternalId).values({ athleteId: row.id, ...x });
  }
  return row.id;
}
