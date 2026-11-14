// The writing half of a source run: Belgian rows only, identities matched on
// the IF ID, then name + date of birth, and otherwise sent to the merge queue
// (spec #20, stories 3, 4 and 92). Counts every insert or change, so the run
// can stamp the source's "last data change".
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "~/db/client";
import { identityMatch, teamIdentity, type KnownIdentity } from "~/domain";
import { followRanking } from "~/qualification/ranked-tracks";
import { knownIdentities } from "./identities";
import type { BelgianRows, CompetitionInput, Person, RankingInput, ResultInput, TeamInput, TeamResultInput } from "./source-adapter";

type MergeQueueItem = typeof schema.mergeQueueItem.$inferSelect;

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
  async function athleteFor(person: Person): Promise<{ athleteId: string | null; item: MergeQueueItem | null }> {
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
      if ("teamId" in input) {
        await writeResult(input, { athleteId: null, mergeQueueItemId: null, teamId: input.teamId });
        for (const athleteId of input.roster) {
          const added = await db
            .insert(schema.rosterMember)
            .values({ teamId: input.teamId, competitionId: input.competitionId, athleteId, rawCopyId: input.rawCopyId })
            .onConflictDoNothing()
            .returning();
          changes += added.length;
          if (input.status !== "DNS") await extendAthleteSince(athleteId, input.date, input.competitionId);
        }
        return;
      }
      let athleteId: string | null;
      let item: MergeQueueItem | null = null;
      if ("athleteId" in input) athleteId = input.athleteId;
      else {
        if (input.person.nationality !== BELGIUM) return;
        ({ athleteId, item } = await athleteOrQueued(input.person, input.competitionId, input.rawCopyId));
      }
      await writeResult(input, { athleteId, mergeQueueItemId: athleteId ? null : item!.id, teamId: null });
      // Only appearing in the result is a performance (DNF and DSQ included, DNS not).
      if (athleteId && input.status !== "DNS") await extendAthleteSince(athleteId, input.date, input.competitionId);
    },

    async teamResult(input: TeamResultInput) {
      if (input.nationality !== BELGIUM) return;
      const sport = input.sport ?? (await sportOf(input.competitionId));
      const belgians = input.roster.filter((p) => p.nationality === BELGIUM);
      const teamId = await findOrCreateTeam({ sport, event: input.teamEvent ?? input.event, members: belgians, rawCopyId: input.rawCopyId });
      await writeResult(input, { athleteId: null, mergeQueueItemId: null, teamId });
      for (const person of belgians) {
        const { athleteId, item } = await athleteOrQueued(person, input.competitionId, input.rawCopyId);
        const added = await db
          .insert(schema.rosterMember)
          .values({ teamId, competitionId: input.competitionId, athleteId, mergeQueueItemId: athleteId ? null : item!.id, rawCopyId: input.rawCopyId })
          .onConflictDoNothing()
          .returning();
        changes += added.length;
        if (athleteId && input.status !== "DNS") await extendAthleteSince(athleteId, input.date, input.competitionId);
      }
    },

    async team(input: TeamInput) {
      return findOrCreateTeam({ ...input, members: input.members?.filter((p) => p.nationality === BELGIUM) ?? null });
    },

    async ranking(input: RankingInput) {
      let who: { athleteId: string } | { teamId: string };
      if ("teamId" in input) who = { teamId: input.teamId };
      else {
        // Rankings never create Athletes: a person not matched to one is left out.
        if (input.person.nationality !== BELGIUM) return;
        const { athleteId } = await athleteFor(input.person);
        if (!athleteId) return;
        who = { athleteId };
      }
      const s = schema.rankingSnapshot;
      const key = and(
        eq(s.source, source),
        eq(s.ranking, input.ranking),
        eq(s.asOf, input.asOf),
        "athleteId" in who ? eq(s.athleteId, who.athleteId) : eq(s.teamId, who.teamId),
      );
      const values = { sport: input.sport, position: input.position, points: input.points };
      const existing = await db.query.rankingSnapshot.findFirst({ where: key });
      if (!existing) {
        await db.insert(s).values({
          ...values,
          source,
          ranking: input.ranking,
          asOf: input.asOf,
          athleteId: "athleteId" in who ? who.athleteId : null,
          teamId: "teamId" in who ? who.teamId : null,
          rawCopyId: input.rawCopyId,
          recordedAt: now.toISOString(),
        });
        changes++;
      } else if (existing.position !== values.position || existing.points !== values.points || existing.sport !== values.sport) {
        await db.update(s).set({ ...values, rawCopyId: input.rawCopyId }).where(eq(s.id, existing.id));
        changes++;
      }
      changes += await followRanking(db, { source, ranking: input.ranking, who }, now);
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

  /** The Athlete this person is; an unknown person is put in the merge queue (once per IF ID). */
  async function athleteOrQueued(person: Person, competitionId: string, rawCopyId: string) {
    const found = await athleteFor(person);
    if (found.athleteId || found.item) return found;
    await db.insert(schema.mergeQueueItem).values({
      source,
      name: person.name,
      dateOfBirth: person.dateOfBirth,
      sport: await sportOf(competitionId),
      ...person.ifId,
      rawCopyId,
      createdAt: now.toISOString(),
    });
    changes++;
    return athleteFor(person);
  }

  /** Inserts or updates the result with this source ref, belonging to the given Entry. */
  async function writeResult(
    input: Omit<ResultInput, "person" | "athleteId" | "teamId" | "roster">,
    entry: { athleteId: string | null; mergeQueueItemId: string | null; teamId: string | null },
  ) {
    const values = {
      competitionId: input.competitionId,
      ...entry,
      event: input.event,
      sport: input.sport ?? null,
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
  }

  /** The Team these members (or, without members, Belgium's default Team) are in this event; created when new. */
  async function findOrCreateTeam(input: TeamInput) {
    const identity = teamIdentity({
      sport: input.sport,
      event: input.event,
      members: input.members?.map((p) => ({ id: `${p.ifId.scheme}:${p.ifId.value}`, name: p.name })) ?? null,
    });
    const existing = await db.query.team.findFirst({ where: eq(schema.team.key, identity.key) });
    if (existing) return existing.id;
    const [row] = await db
      .insert(schema.team)
      .values({ ...identity, sport: input.sport, event: input.event, rawCopyId: input.rawCopyId })
      .returning({ id: schema.team.id });
    changes++;
    return row.id;
  }

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
