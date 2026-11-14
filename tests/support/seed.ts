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

/** Adds a Source row (tier and health columns as earlier runs left them). */
export async function seedSource(d1: D1Database, key: string, row: Partial<typeof schema.source.$inferInsert> = {}) {
  await getDb(d1)
    .insert(schema.source)
    .values({ key, name: key, tier: "automatic", cadenceDays: 1, addedAt: "2026-11-01T00:00:00.000Z", ...row });
}

type MergeQueueSeed = { name: string; sport: string; dateOfBirth?: string; scheme: string; value: string; source?: string };

/** Puts an unmatched incoming identity in the merge queue, as an ingest run would. */
export async function seedMergeQueueItem(d1: D1Database, item: MergeQueueSeed): Promise<string> {
  const db = getDb(d1);
  const source = item.source ?? item.scheme;
  const [raw] = await db
    .insert(schema.rawCopy)
    .values({ source, url: `https://example.test/${source}/${item.value}`, r2Key: `raw/${source}/${crypto.randomUUID()}`, fetchedAt: "2026-11-13T04:00:00.000Z" })
    .returning({ id: schema.rawCopy.id });
  const [row] = await db
    .insert(schema.mergeQueueItem)
    .values({ source, name: item.name, sport: item.sport, dateOfBirth: item.dateOfBirth, scheme: item.scheme, value: item.value, rawCopyId: raw.id, createdAt: "2026-11-13T04:00:00.000Z" })
    .returning({ id: schema.mergeQueueItem.id });
  return row.id;
}

/** A raw copy row, as a fetch or paste would leave it (no R2 body). */
async function seedRawCopy(d1: D1Database, source: string) {
  const [raw] = await getDb(d1)
    .insert(schema.rawCopy)
    .values({ source, url: `https://example.test/${source}/${crypto.randomUUID()}`, r2Key: `raw/${source}/${crypto.randomUUID()}`, fetchedAt: "2026-10-01T04:00:00.000Z" })
    .returning({ id: schema.rawCopy.id });
  return raw.id;
}

type CompetitionSeed = {
  name: string;
  sport: string;
  /** Source key; "test-source" when it does not matter. */
  source?: string;
  kind?: "championship" | "games" | "circuit";
  startDate: string;
  /** Defaults to the start date (a one-day competition). */
  endDate?: string;
  city?: string;
  series?: string;
  /** IANA zone of the venue. */
  venueZone?: string;
};

/** Adds a competition as its source would publish it (with a raw copy it came from). */
export async function seedCompetition(d1: D1Database, c: CompetitionSeed): Promise<string> {
  const source = c.source ?? "test-source";
  const [row] = await getDb(d1)
    .insert(schema.competition)
    .values({
      name: c.name,
      sport: c.sport,
      kind: c.kind ?? "circuit",
      startDate: c.startDate,
      endDate: c.endDate ?? c.startDate,
      city: c.city,
      series: c.series,
      venueZone: c.venueZone,
      source,
      sourceRef: crypto.randomUUID(),
      rawCopyId: await seedRawCopy(d1, source),
    })
    .returning({ id: schema.competition.id });
  return row.id;
}

/** Names an Athlete on a competition's entry list. */
export async function seedEntrant(d1: D1Database, competitionId: string, athleteId: string) {
  const db = getDb(d1);
  const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, competitionId) });
  await db.insert(schema.entrant).values({ competitionId, athleteId, rawCopyId: competition!.rawCopyId });
}

/** A Belgian result of the Athlete at the competition. */
export async function seedResult(d1: D1Database, competitionId: string, athleteId: string, r: { event?: string; date: string; place?: number }) {
  await getDb(d1)
    .insert(schema.result)
    .values({
      competitionId,
      athleteId,
      event: r.event ?? "Event",
      date: r.date,
      place: r.place ?? 10,
      status: "finished",
      source: "test-source",
      sourceRef: crypto.randomUUID(),
      rawCopyId: await seedRawCopy(d1, "test-source"),
    });
}

/** The owner's word on a competition's Participation, as the Selections & likely step would store it. */
export async function seedParticipationCuration(
  d1: D1Database,
  competitionId: string,
  row: { addedAt?: string; decision?: "confirmed" | "kept" | "dropped"; checkedAt: string },
) {
  await getDb(d1).insert(schema.participationCuration).values({ competitionId, ...row });
}

/**
 * Storage is shared by the tests in one file. Removes every Athlete and
 * everything ingest wrote (rows and raw copies in R2), keeping Source rows.
 */
export async function clearIngestedData(env: Pick<Env, "DB" | "RAW">) {
  const db = getDb(env.DB);
  for (const table of [
    schema.participationCuration,
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

type ChecklistItemSeed = { topic: string; name: string; dueOn: string; url?: string; everyMonths?: number };

/** Adds a Monthly checklist item, as the owner would. */
export async function seedChecklistItem(d1: D1Database, item: ChecklistItemSeed): Promise<string> {
  const [row] = await getDb(d1).insert(schema.checklistItem).values(item).returning({ id: schema.checklistItem.id });
  return row.id;
}
