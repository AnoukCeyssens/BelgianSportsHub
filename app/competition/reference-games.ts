// Reference Games (spec #20, story 119; ticket #46): Paris 2024 and
// Milano-Cortina 2026 as history, Belgian results only. Their results attach
// to the owner's row for the Games (entered by hand or through the paste
// importer); Olympic results a source published on the Games' days count too.
import { and, asc, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { type Db, getDb, schema } from "~/db/client";
import { GAMES_SOURCE, referenceGamesOf, type ReferenceGames } from "~/domain";
import { belgianRows } from "~/ingest/belgian-rows";
import { keepRawCopy } from "~/ingest/raw-copy";

/** The owner's row for a reference Games, created (with its definition kept as a raw copy) on first use. */
export async function referenceGamesRow(env: Pick<Env, "DB" | "RAW">, games: ReferenceGames, now: Date): Promise<string> {
  const c = schema.competition;
  const existing = await getDb(env.DB).query.competition.findFirst({ where: and(eq(c.source, GAMES_SOURCE), eq(c.sourceRef, games.key)) });
  if (existing) return existing.id;
  const { key, name, sport, city, country, venueZone, series, startDate, endDate, resultsUrl } = games;
  const rawCopyId = await keepRawCopy(env, {
    source: GAMES_SOURCE,
    url: resultsUrl,
    body: JSON.stringify({ games: key, startDate, endDate }),
    contentType: "application/json",
    fetchedAt: now,
  });
  return belgianRows(env, GAMES_SOURCE, now).competition({
    name,
    sport,
    kind: "games",
    startDate,
    endDate,
    city,
    country,
    venueZone,
    series,
    sourceRef: key,
    rawCopyId,
  });
}

/** Who competed: an Athlete, or a Team with the Athletes its result credits. */
export type ReferenceEntry = { kind: "athlete"; id: string; name: string } | { kind: "team"; id: string; name: string; roster: { id: string; name: string }[] };

export type ReferenceSport = {
  sport: string;
  results: { entry: ReferenceEntry; event: string; date: string; place: number | null; status: string; performance: string | null }[];
};

/** A reference Games' Belgian results per sport (A–Z), each by date and event; inactive Athletes and Teams included. */
export async function referenceResults(db: Db, games: ReferenceGames): Promise<ReferenceSport[]> {
  const { competition: c, result: r, athlete: a, team: t, rosterMember: m } = schema;
  const rows = await db
    .select({
      kind: c.kind,
      source: c.source,
      sourceRef: c.sourceRef,
      startDate: c.startDate,
      endDate: c.endDate,
      competitionId: c.id,
      competitionSport: c.sport,
      sport: r.sport,
      athleteId: a.id,
      athlete: a.name,
      teamId: t.id,
      team: t.name,
      event: r.event,
      date: r.date,
      place: r.place,
      status: r.status,
      performance: r.performance,
    })
    .from(r)
    .innerJoin(c, eq(r.competitionId, c.id))
    .leftJoin(a, eq(r.athleteId, a.id))
    .leftJoin(t, eq(r.teamId, t.id))
    .where(and(eq(c.kind, "games"), lte(c.startDate, games.endDate), gte(c.endDate, games.startDate), or(isNotNull(r.athleteId), isNotNull(r.teamId))))
    .orderBy(asc(r.date), asc(r.event), asc(a.name), asc(t.name));
  const ours = rows.filter((row) => referenceGamesOf(row)?.key === games.key);

  const teamIds = [...new Set(ours.flatMap((row) => (row.teamId ? [row.teamId] : [])))];
  const members =
    teamIds.length === 0
      ? []
      : await db
          .select({ teamId: m.teamId, competitionId: m.competitionId, id: a.id, name: a.name })
          .from(m)
          .innerJoin(a, eq(m.athleteId, a.id))
          .where(inArray(m.teamId, teamIds))
          .orderBy(asc(a.name));

  const bySport = new Map<string, ReferenceSport["results"]>();
  for (const row of ours) {
    const sport = row.sport ?? row.competitionSport;
    if (!bySport.has(sport)) bySport.set(sport, []);
    const entry: ReferenceEntry = row.teamId
      ? {
          kind: "team",
          id: row.teamId,
          name: row.team!,
          roster: members.filter((x) => x.teamId === row.teamId && x.competitionId === row.competitionId).map(({ id, name }) => ({ id, name })),
        }
      : { kind: "athlete", id: row.athleteId!, name: row.athlete! };
    const { event, date, place, status, performance } = row;
    bySport.get(sport)!.push({ entry, event, date, place, status, performance });
  }
  return [...bySport].map(([sport, results]) => ({ sport, results })).sort((x, y) => x.sport.localeCompare(y.sport));
}
