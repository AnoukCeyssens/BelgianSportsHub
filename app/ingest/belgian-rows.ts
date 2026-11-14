// The writing half of a source run: Belgian rows only, identities matched on
// the IF ID, then name + date of birth, and otherwise sent to the merge queue
// (spec #20, stories 3, 4 and 92). Counts every insert or change, so the run
// can stamp the source's "last data change".
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "~/db/client";
import { identityMatch, type KnownIdentity } from "~/domain";
import { knownIdentities } from "./identities";
import type { BelgianRows, CompetitionInput, Person, ResultInput } from "./source-adapter";

const BELGIUM = "BEL";

export type BelgianRowWriter = BelgianRows & { changes(): number };

export function belgianRows(d1: D1Database, source: string, now: Date): BelgianRowWriter {
  const db = getDb(d1);
  let changes = 0;
  let roster: KnownIdentity[] | null = null;

  async function sportOf(competitionId: string) {
    const row = await db.query.competition.findFirst({ where: eq(schema.competition.id, competitionId) });
    return row?.sport ?? "";
  }

  /** The Athlete this person is, if known; otherwise null (and the person is not on the roster yet). */
  async function athleteFor(person: Person): Promise<{ athleteId: string | null; item: typeof schema.mergeQueueItem.$inferSelect | null }> {
    const item = await db.query.mergeQueueItem.findFirst({
      where: and(eq(schema.mergeQueueItem.scheme, person.ifId.scheme), eq(schema.mergeQueueItem.value, person.ifId.value)),
    });
    if (item) return { athleteId: item.athleteId, item };

    roster ??= await knownIdentities(d1);
    const match = identityMatch({ name: person.name, dateOfBirth: person.dateOfBirth, externalIds: [person.ifId] }, roster);
    if (match.kind === "queue") return { athleteId: null, item: null };
    if (match.kind === "name-and-dob") {
      // Matched by name + date of birth: remember the IF ID, so the next run matches on it.
      const added = await db
        .insert(schema.athleteExternalId)
        .values({ athleteId: match.athleteId, ...person.ifId })
        .onConflictDoNothing()
        .returning();
      changes += added.length;
      roster.find((k) => k.athleteId === match.athleteId)?.externalIds.push(person.ifId);
    }
    return { athleteId: match.athleteId, item: null };
  }

  return {
    changes: () => changes,

    async competition(input: CompetitionInput) {
      const { rawCopyId, ...rest } = input;
      const values = { ...rest, series: rest.series ?? null };
      const existing = await db.query.competition.findFirst({
        where: and(eq(schema.competition.source, source), eq(schema.competition.sourceRef, input.sourceRef)),
      });
      if (!existing) {
        const [row] = await db
          .insert(schema.competition)
          .values({ ...values, source, rawCopyId })
          .returning({ id: schema.competition.id });
        changes++;
        return row.id;
      }
      const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => existing[k] !== values[k]);
      if (changed) {
        await db.update(schema.competition).set({ ...values, rawCopyId }).where(eq(schema.competition.id, existing.id));
        changes++;
      }
      return existing.id;
    },

    async result(input: ResultInput) {
      if (input.person.nationality !== BELGIUM) return;
      let { athleteId, item } = await athleteFor(input.person);
      if (!athleteId && !item) {
        await db
          .insert(schema.mergeQueueItem)
          .values({
            source,
            name: input.person.name,
            dateOfBirth: input.person.dateOfBirth,
            sport: await sportOf(input.competitionId),
            ...input.person.ifId,
            rawCopyId: input.rawCopyId,
            createdAt: now.toISOString(),
          });
        changes++;
        ({ athleteId, item } = await athleteFor(input.person));
      }

      const values = {
        competitionId: input.competitionId,
        athleteId,
        mergeQueueItemId: athleteId ? null : item!.id,
        event: input.event,
        date: input.date,
        place: input.place,
        status: input.status,
        performance: input.performance,
      };
      const existing = await db.query.result.findFirst({
        where: and(eq(schema.result.source, source), eq(schema.result.sourceRef, input.sourceRef)),
      });
      if (!existing) {
        await db.insert(schema.result).values({ ...values, source, sourceRef: input.sourceRef, rawCopyId: input.rawCopyId });
        changes++;
      } else if ((Object.keys(values) as (keyof typeof values)[]).some((k) => existing[k] !== values[k])) {
        await db.update(schema.result).set({ ...values, rawCopyId: input.rawCopyId }).where(eq(schema.result.id, existing.id));
        changes++;
      }
      if (athleteId) await extendAthleteSince(athleteId, input.date, input.competitionId);
    },

    async entrants(competitionId: string, people: Person[], rawCopyId: string) {
      const athleteIds = new Set<string>();
      for (const person of people) {
        if (person.nationality !== BELGIUM) continue;
        const { athleteId } = await athleteFor(person);
        if (athleteId) athleteIds.add(athleteId);
      }
      const current = await db.select().from(schema.entrant).where(eq(schema.entrant.competitionId, competitionId));
      const same = current.length === athleteIds.size && current.every((e) => athleteIds.has(e.athleteId));
      if (same) return;
      await db.delete(schema.entrant).where(eq(schema.entrant.competitionId, competitionId));
      if (athleteIds.size > 0) {
        await db.insert(schema.entrant).values([...athleteIds].map((athleteId) => ({ competitionId, athleteId, rawCopyId })));
      }
      changes++;
    },
  };

  /** "Athlete since" moves back when an earlier senior international performance turns up. */
  async function extendAthleteSince(athleteId: string, date: string, competitionId: string) {
    const athlete = await db.query.athlete.findFirst({ where: eq(schema.athlete.id, athleteId) });
    if (!athlete || (athlete.athleteSince && athlete.athleteSince <= date)) return;
    const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, competitionId) });
    await db
      .update(schema.athlete)
      .set({ athleteSince: date, athleteSinceCompetition: competition?.name ?? null })
      .where(eq(schema.athlete.id, athleteId));
    changes++;
  }
}
