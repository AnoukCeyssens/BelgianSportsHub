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

type CompetitionSeed = {
  name: string;
  sport: string;
  source: string;
  startDate: string;
  endDate: string;
  city?: string;
  kind?: "championship" | "games" | "circuit";
};

/** Adds a competition as its source would publish it (with a raw copy it came from). */
export async function seedCompetition(d1: D1Database, c: CompetitionSeed): Promise<string> {
  const db = getDb(d1);
  const [raw] = await db
    .insert(schema.rawCopy)
    .values({ source: c.source, url: `https://example.test/${c.source}/calendar`, r2Key: `raw/${c.source}/${crypto.randomUUID()}`, fetchedAt: "2026-10-01T04:00:00.000Z" })
    .returning({ id: schema.rawCopy.id });
  const [row] = await db
    .insert(schema.competition)
    .values({ kind: "circuit", ...c, sourceRef: crypto.randomUUID(), rawCopyId: raw.id })
    .returning({ id: schema.competition.id });
  return row.id;
}

/** Names an Athlete on a competition's entry list. */
export async function seedEntrant(d1: D1Database, competitionId: string, athleteId: string) {
  const db = getDb(d1);
  const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, competitionId) });
  await db.insert(schema.entrant).values({ competitionId, athleteId, rawCopyId: competition!.rawCopyId });
}

type TeamResultSeed = { competitionId: string; sport: string; event: string; place: number; roster: string[] };

/** Gives Belgium's default Team for the event a finished result, with these Athletes on its roster. Returns the Team's id. */
export async function seedTeamResult(d1: D1Database, r: TeamResultSeed): Promise<string> {
  const db = getDb(d1);
  const competition = (await db.query.competition.findFirst({ where: eq(schema.competition.id, r.competitionId) }))!;
  const [team] = await db
    .insert(schema.team)
    .values({ key: `${r.sport}|${r.event}`, name: `Belgium · ${r.event}`, sport: r.sport, event: r.event, kind: "default" })
    .returning({ id: schema.team.id });
  await db.insert(schema.result).values({
    competitionId: r.competitionId,
    teamId: team.id,
    event: r.event,
    date: competition.endDate,
    place: r.place,
    status: "finished",
    source: competition.source,
    sourceRef: crypto.randomUUID(),
    rawCopyId: competition.rawCopyId,
  });
  for (const athleteId of r.roster) {
    await db.insert(schema.rosterMember).values({ teamId: team.id, competitionId: r.competitionId, athleteId, rawCopyId: competition.rawCopyId });
  }
  return team.id;
}

/**
 * Storage is shared by the tests in one file. Removes every Athlete and
 * everything ingest wrote (rows and raw copies in R2), keeping Source rows.
 */
export async function clearIngestedData(env: Pick<Env, "DB" | "RAW">) {
  const db = getDb(env.DB);
  for (const table of [
    schema.entrant,
    schema.rosterMember,
    schema.result,
    schema.team,
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
