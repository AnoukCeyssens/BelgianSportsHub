import { getDb, schema } from "~/db/client";
import type { ExternalId, KnownIdentity } from "~/domain";

/** Every Athlete on the roster with their external IDs, ready for identityMatch(). */
export async function knownIdentities(d1: D1Database): Promise<KnownIdentity[]> {
  const db = getDb(d1);
  const [athletes, ids] = await Promise.all([
    db.select({ id: schema.athlete.id, name: schema.athlete.name, dateOfBirth: schema.athlete.dateOfBirth }).from(schema.athlete),
    db.select().from(schema.athleteExternalId),
  ]);
  const idsByAthlete = new Map<string, ExternalId[]>();
  for (const { athleteId, scheme, value } of ids) {
    idsByAthlete.set(athleteId, [...(idsByAthlete.get(athleteId) ?? []), { scheme, value }]);
  }
  return athletes.map((a) => ({
    athleteId: a.id,
    name: a.name,
    dateOfBirth: a.dateOfBirth,
    externalIds: idsByAthlete.get(a.id) ?? [],
  }));
}
