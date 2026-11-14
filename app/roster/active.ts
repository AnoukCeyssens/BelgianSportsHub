// Active status of every Athlete and Team (GLOSSARY "Active"; ticket #28).
// Gathers the facts from storage and hands them to the domain rule
// `activeStatus`:
// - performances: an Athlete's own results, the results of Teams whose
//   roster credits them, and the latest performance their Team Belgium
//   profile showed when the roster seed read it; a Team's own results only
//   (its status is independent of its members);
// - the owner's curated facts: `active_fact`.
// Everything that shows or follows only Active Entries (the default Athletes
// list, likely Participation, later Qualification tracking) reads through here.
import { and, eq, inArray, isNotNull, max, type SQL } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { activeStatus, type ActiveFacts, type ActivePerformance, type ActiveStatus } from "~/domain";

export type ActiveFactKind = "hold" | "retirement" | "dissolution" | "nationality-change";
export type ActiveFactRow = typeof schema.activeFact.$inferSelect;

export type ActiveStatuses = { athletes: Map<string, ActiveStatus>; teams: Map<string, ActiveStatus> };

/** The Active status of every Athlete and Team, or only of those asked for. */
export async function activeStatuses(db: Db, now: Date, only?: { athleteIds?: string[]; teamIds?: string[] }): Promise<ActiveStatuses> {
  const r = schema.result;
  const roster = schema.rosterMember;
  const f = schema.activeFact;
  const within = <T,>(column: Parameters<typeof inArray>[0], ids: T[] | undefined): SQL | undefined =>
    ids === undefined ? undefined : inArray(column, ids as string[]);
  const athleteIds = only ? (only.athleteIds ?? []) : undefined;
  const teamIds = only ? (only.teamIds ?? []) : undefined;

  const [athletes, teams, own, asTeam, ofTeams, facts] = await Promise.all([
    db
      .select({ id: schema.athlete.id, profileLatest: schema.athlete.profileLatestPerformanceOn })
      .from(schema.athlete)
      .where(within(schema.athlete.id, athleteIds)),
    db.select({ id: schema.team.id }).from(schema.team).where(within(schema.team.id, teamIds)),
    db
      .select({ id: r.athleteId, status: r.status, date: max(r.date) })
      .from(r)
      .where(and(isNotNull(r.athleteId), within(r.athleteId, athleteIds)))
      .groupBy(r.athleteId, r.status),
    db
      .select({ id: roster.athleteId, status: r.status, date: max(r.date) })
      .from(roster)
      .innerJoin(r, and(eq(r.teamId, roster.teamId), eq(r.competitionId, roster.competitionId)))
      .where(and(isNotNull(roster.athleteId), within(roster.athleteId, athleteIds)))
      .groupBy(roster.athleteId, r.status),
    db
      .select({ id: r.teamId, status: r.status, date: max(r.date) })
      .from(r)
      .where(and(isNotNull(r.teamId), within(r.teamId, teamIds)))
      .groupBy(r.teamId, r.status),
    db.select().from(f),
  ]);

  const performancesOf = (rows: { id: string | null; status: string; date: string | null }[]) => {
    const by = new Map<string, ActivePerformance[]>();
    for (const row of rows) {
      if (!row.id || !row.date) continue;
      if (!by.has(row.id)) by.set(row.id, []);
      by.get(row.id)!.push({ date: row.date, status: row.status });
    }
    return by;
  };
  const athletePerformances = performancesOf([...own, ...asTeam]);
  const teamPerformances = performancesOf(ofTeams);
  const athleteFacts = factsBy(facts, "athleteId");
  const teamFacts = factsBy(facts, "teamId");

  return {
    athletes: new Map(
      athletes.map((a) => {
        const performances = [...(athletePerformances.get(a.id) ?? [])];
        if (a.profileLatest) performances.push({ date: a.profileLatest, status: "finished" });
        return [a.id, activeStatus({ kind: "athlete" }, performances, athleteFacts.get(a.id) ?? {}, now)];
      }),
    ),
    teams: new Map(
      teams.map((t) => [t.id, activeStatus({ kind: "team" }, teamPerformances.get(t.id) ?? [], teamFacts.get(t.id) ?? {}, now)]),
    ),
  };
}

function factsBy(rows: ActiveFactRow[], key: "athleteId" | "teamId") {
  const by = new Map<string, ActiveFacts>();
  for (const row of rows) {
    const id = row[key];
    if (!id) continue;
    const facts = by.get(id) ?? {};
    if (row.kind === "hold") facts.holdUntil = row.date;
    else if (row.kind === "retirement" || row.kind === "dissolution") facts.retiredOn = row.date;
    else if (row.kind === "nationality-change") facts.nationalityChangedOn = row.date;
    by.set(id, facts);
  }
  return by;
}

/** One Entry's curated facts, by kind. */
export async function activeFactsOf(db: Db, entry: { athleteId: string } | { teamId: string }) {
  const f = schema.activeFact;
  const rows = await db
    .select()
    .from(f)
    .where("athleteId" in entry ? eq(f.athleteId, entry.athleteId) : eq(f.teamId, entry.teamId));
  return new Map(rows.map((row) => [row.kind as ActiveFactKind, row]));
}
