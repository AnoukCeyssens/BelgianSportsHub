// The writing half of a source run: Belgian rows only, identities matched on
// the IF ID, then name + date of birth, and otherwise sent to the merge queue
// (spec #20, stories 3, 4 and 92). Counts every insert or change, so the run
// can stamp the source's "last data change".
//
// The Games (#20 review, finding F): a source's own Olympic Games competition
// is the Games the app follows. `competition()` returns the owner's Games row
// whose dates overlap (creating a reference Games' row on first use) instead
// of a second Games, never changing that row; what this run writes against it
// carries the source competition's sport (`result.sport`, the Team's sport,
// the merge-queue item's sport), unless a result names its own. A tracked
// Games whose dates the owner has not recorded yet keeps the source's own row.
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { referenceGamesRow } from "~/competition/reference-games";
import { getDb, schema } from "~/db/client";
import {
  belgianDate,
  GAMES_SOURCE,
  identityMatch,
  REFERENCE_GAMES,
  requireSport,
  sameSport,
  teamIdentity,
  TIMETABLE_TEXT_HEAD,
  timetableText,
  type KnownIdentity,
  type TimetableRound,
} from "~/domain";
import { followRanking } from "~/qualification/ranked-tracks";
import { applyEntryList } from "~/qualification/selection";
import { knownIdentities } from "./identities";
import { keepRawCopy } from "./raw-copy";
import type { BelgianRows, CompetitionInput, Entrant, Person, RankingInput, ResultInput, TeamInput, TeamResultInput, TimetableInput } from "./source-adapter";
import { addVersion, fingerprintOf, replaceSessions, versionsOf } from "./timetable-versions";

type MergeQueueItem = typeof schema.mergeQueueItem.$inferSelect;

const BELGIUM = "BEL";
/** Raw copies of timetables, pasted or fetched: the Schedules step reads them back by this source. */
export const TIMETABLE_RAW_SOURCE = "timetable";

export type BelgianRowWriter = BelgianRows & { changes(): number };

export function belgianRows(env: Pick<Env, "DB" | "RAW">, source: string, now: Date): BelgianRowWriter {
  const d1 = env.DB;
  const db = getDb(d1);
  let changes = 0;
  let roster: KnownIdentity[] | null = null;

  /** The owner's Games rows this run resolved a source's Games to, with the sport the source's competition is. */
  const gamesSports = new Map<string, string>();
  const competitions = new Map<string, typeof schema.competition.$inferSelect | undefined>();

  async function competitionRow(competitionId: string) {
    if (!competitions.has(competitionId)) {
      competitions.set(competitionId, await db.query.competition.findFirst({ where: eq(schema.competition.id, competitionId) }));
    }
    return competitions.get(competitionId);
  }

  /** The sport of what this run writes against a competition: at the Games, the source competition's sport. */
  async function sportOf(competitionId: string) {
    return gamesSports.get(competitionId) ?? (await competitionRow(competitionId))?.sport ?? "";
  }

  /**
   * A result's stored sport: at the owner's Games row (which spans every sport)
   * the result's own or this run's sport; elsewhere only a sport other than
   * the competition's (null means the competition's own).
   */
  async function resultSport(competitionId: string, sport: string | null | undefined): Promise<string | null> {
    const row = await competitionRow(competitionId);
    if (row?.source === GAMES_SOURCE && row.kind === "games") {
      const named = sport ?? gamesSports.get(competitionId) ?? null;
      return named === null ? null : requireSport(named);
    }
    if (!sport || (row && sameSport(sport, row.sport))) return null;
    return requireSport(sport);
  }

  /** The owner's row for the Games a source's Olympic Games competition is (dates overlap); a reference Games' row is created on first use. */
  async function ownerGamesRow(input: CompetitionInput): Promise<string | null> {
    const c = schema.competition;
    const [row] = await db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.source, GAMES_SOURCE), eq(c.kind, "games"), lte(c.startDate, input.endDate), gte(c.endDate, input.startDate)))
      .limit(1);
    if (row) return row.id;
    const reference = REFERENCE_GAMES.find((g) => g.startDate <= input.endDate && g.endDate >= input.startDate);
    return reference ? referenceGamesRow(env, reference, now) : null;
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
      if (source !== GAMES_SOURCE && input.kind === "games") {
        const sport = requireSport(input.sport);
        const games = await ownerGamesRow(input);
        if (games) {
          gamesSports.set(games, sport);
          return games;
        }
      }
      const { rawCopyId, ...rest } = input;
      const existing = await db.query.competition.findFirst({
        where: and(eq(schema.competition.source, source), eq(schema.competition.sourceRef, input.sourceRef)),
      });
      // A source that does not know the venue's zone keeps the one a timetable (or the owner) gave.
      // The owner's Games rows span every sport ("Olympic Games"); any other competition is one sport.
      const sport = source === GAMES_SOURCE && rest.kind === "games" ? rest.sport : requireSport(rest.sport);
      const values = { ...rest, sport, series: rest.series ?? null, venueZone: rest.venueZone ?? existing?.venueZone ?? null };
      if (!existing) {
        const [row] = await db
          .insert(schema.competition)
          .values({ ...values, source, rawCopyId })
          .returning({ id: schema.competition.id });
        changes++;
        return row.id;
      }
      const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => existing[k] !== values[k]);
      competitions.delete(existing.id);
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
        ({ athleteId, item } = await athleteOrQueued(input.person, input.competitionId, input.rawCopyId, input.sport));
      }
      await writeResult(input, { athleteId, mergeQueueItemId: athleteId ? null : item!.id, teamId: null });
      // Only appearing in the result is a performance (DNF and DSQ included, DNS not).
      if (athleteId && input.status !== "DNS") await extendAthleteSince(athleteId, input.date, input.competitionId);
    },

    async teamResult(input: TeamResultInput) {
      if (input.nationality !== BELGIUM) return;
      const sport = requireSport((await resultSport(input.competitionId, input.sport)) ?? (await sportOf(input.competitionId)));
      const belgians = input.roster.filter((p) => p.nationality === BELGIUM);
      const teamId = await findOrCreateTeam({ sport, event: input.teamEvent ?? input.event, members: belgians, rawCopyId: input.rawCopyId });
      await writeResult(input, { athleteId: null, mergeQueueItemId: null, teamId });
      for (const person of belgians) {
        const { athleteId, item } = await athleteOrQueued(person, input.competitionId, input.rawCopyId, sport);
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
      return findOrCreateTeam({ ...input, sport: requireSport(input.sport), members: input.members?.filter((p) => p.nationality === BELGIUM) ?? null });
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
      const values = { sport: requireSport(input.sport), position: input.position, points: input.points };
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

    async entrants(competitionId: string, people: Entrant[], rawCopyId: string) {
      const athleteIds = new Set<string>();
      // The events the list names each Athlete in; null once a listing names none.
      const events = new Map<string, string[] | null>();
      for (const person of people) {
        if (person.nationality !== BELGIUM) continue;
        const { athleteId } = await athleteFor(person);
        if (!athleteId) continue;
        athleteIds.add(athleteId);
        const seen = events.has(athleteId) ? events.get(athleteId)! : [];
        events.set(athleteId, seen === null || !person.events ? null : [...seen, ...person.events]);
      }
      // At the Games a source's list covers its own sport only: the other sports' entrants stay.
      const gamesSport = gamesSports.get(competitionId);
      const listed = await db
        .select({ athleteId: schema.entrant.athleteId, rawCopyId: schema.entrant.rawCopyId, sport: schema.athlete.sport })
        .from(schema.entrant)
        .innerJoin(schema.athlete, eq(schema.entrant.athleteId, schema.athlete.id))
        .where(eq(schema.entrant.competitionId, competitionId));
      const current = gamesSport ? listed.filter((e) => sameSport(e.sport, gamesSport) || athleteIds.has(e.athleteId)) : listed;
      const same = current.length === athleteIds.size && current.every((e) => athleteIds.has(e.athleteId));
      if (!same) {
        const e = schema.entrant;
        if (current.length > 0) {
          await db.delete(e).where(and(eq(e.competitionId, competitionId), inArray(e.athleteId, current.map((x) => x.athleteId))));
        }
        if (athleteIds.size > 0) {
          await db.insert(e).values([...athleteIds].map((athleteId) => ({ competitionId, athleteId, rawCopyId })));
        }
        changes++;
      }
      // The IF entry list replaces the Selection (#34), also for Entries named since the list was stored.
      // A list without Belgians may simply not be published yet, so it leaves the Selection alone.
      if (athleteIds.size > 0) {
        const listed = [...events].map(([athleteId, named]) => ({ athleteId, events: named }));
        changes += await applyEntryList(db, competitionId, same ? current[0]?.rawCopyId ?? rawCopyId : rawCopyId, listed, now);
      }
    },

    async timetable(input: TimetableInput) {
      const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, input.competitionId) });
      if (!competition) throw new Error(`No competition ${input.competitionId}`);
      const venueZone = input.venueZone ?? competition.venueZone;
      if (!venueZone || input.rounds.length === 0) return;
      const rounds: TimetableRound[] = input.rounds.map((r, index) => ({ ...r, index, sport: gamesSports.get(competition.id) ?? competition.sport }));
      const text = timetableText(rounds);
      const fingerprint = await fingerprintOf(text);

      const versions = await versionsOf(db, competition.id);
      const [latest] = versions;
      if (latest?.fingerprint === fingerprint) {
        // The same timetable: no new version, but Entries named since place their rounds.
        const { changed } = await replaceSessions(db, competition.id, latest.id, rounds, venueZone);
        if (changed) changes++;
        return;
      }
      // Seen before, and a later version (the owner's paste) replaced it: that one stands until the source changes.
      if (versions.some((v) => v.fingerprint === fingerprint)) return;

      const rawCopyId = await keepRawCopy(env, {
        source: TIMETABLE_RAW_SOURCE,
        url: input.sourceUrl,
        body: text,
        contentType: "text/tab-separated-values; charset=utf-8",
        fetchedAt: now,
        derivedFrom: input.rawCopyId,
      });
      const versionId = await addVersion(db, {
        competitionId: competition.id,
        version: input.version ?? `fetched ${belgianDate(now)}`,
        publishedOn: input.publishedOn,
        sourceUrl: input.sourceUrl,
        // Each column of the kept table is its own timetable role.
        columnMapping: Object.fromEntries(TIMETABLE_TEXT_HEAD.map((h) => [h.toLowerCase(), h.toLowerCase()])),
        rawCopyId,
        fingerprint,
        storedAt: now,
      });
      if (!competition.venueZone) await db.update(schema.competition).set({ venueZone }).where(eq(schema.competition.id, competition.id));
      await replaceSessions(db, competition.id, versionId, rounds, venueZone);
      changes++;
    },
  };

  /** The Athlete this person is; an unknown person is put in the merge queue (once per IF ID). */
  async function athleteOrQueued(person: Person, competitionId: string, rawCopyId: string, sport?: string | null) {
    const found = await athleteFor(person);
    if (found.athleteId || found.item) return found;
    await db.insert(schema.mergeQueueItem).values({
      source,
      name: person.name,
      dateOfBirth: person.dateOfBirth,
      sport: sport ? requireSport(sport) : await sportOf(competitionId),
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
      sport: await resultSport(input.competitionId, input.sport),
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
