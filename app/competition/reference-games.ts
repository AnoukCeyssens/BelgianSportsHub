// Reference Games (spec #20, story 119; ticket #46): Paris 2024 and
// Milano-Cortina 2026 as history, Belgian results only. Their results attach
// to the owner's row for the Games (entered by hand or through the paste
// importer); Olympic results a source published on the Games' days count too.
import { and, asc, eq, gte, lte } from "drizzle-orm";
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
  return belgianRows(env.DB, GAMES_SOURCE, now).competition({
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

export type ReferenceSport = {
  sport: string;
  results: { athleteId: string; athlete: string; event: string; date: string; place: number | null; status: string; performance: string | null }[];
};

/** A reference Games' Belgian results per sport (A–Z), each by date and event; inactive Athletes included. */
export async function referenceResults(db: Db, games: ReferenceGames): Promise<ReferenceSport[]> {
  const { competition: c, result: r, athlete: a } = schema;
  const rows = await db
    .select({
      kind: c.kind,
      source: c.source,
      sourceRef: c.sourceRef,
      startDate: c.startDate,
      endDate: c.endDate,
      competitionSport: c.sport,
      sport: r.sport,
      athleteId: a.id,
      athlete: a.name,
      event: r.event,
      date: r.date,
      place: r.place,
      status: r.status,
      performance: r.performance,
    })
    .from(r)
    .innerJoin(c, eq(r.competitionId, c.id))
    .innerJoin(a, eq(r.athleteId, a.id))
    .where(and(eq(c.kind, "games"), lte(c.startDate, games.endDate), gte(c.endDate, games.startDate)))
    .orderBy(asc(r.date), asc(r.event), asc(a.name));

  const bySport = new Map<string, ReferenceSport["results"]>();
  for (const row of rows) {
    if (referenceGamesOf(row)?.key !== games.key) continue;
    const sport = row.sport ?? row.competitionSport;
    if (!bySport.has(sport)) bySport.set(sport, []);
    const { athleteId, athlete, event, date, place, status, performance } = row;
    bySport.get(sport)!.push({ athleteId, athlete, event, date, place, status, performance });
  }
  return [...bySport].map(([sport, results]) => ({ sport, results })).sort((x, y) => x.sport.localeCompare(y.sport));
}
