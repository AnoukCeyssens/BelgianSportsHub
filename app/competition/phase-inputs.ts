// Gathers the phase inputs of Championships, the Games and each
// Games sport (#35) from storage and hands them to the domain rule
// `currentPhase`. Ticket #31. Each input has one source:
// - standards published: the owner's record on `competition` (ticket #31);
// - first Selected Entry: the Belgian date of the earliest Selection naming a
//   Selected Entry (#34, `firstSelectedOn`), per competition and, at the
//   Games, per sport;
// - first Session start: the earliest timed Session's venue-local start
//   (#37), per competition and, at the Games, per sport; null without one
//   (midnight venue time on day one is the rule's fallback).
// Add an input here (one batched query per input), never in a page.
import { and, asc, eq, inArray, isNotNull, min } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { firstSelectedOn } from "~/qualification/selection";
import { combinedPhaseInputs, currentPhase, type Phase, type PhaseInputs } from "~/domain";

export type CompetitionRow = typeof schema.competition.$inferSelect;

/** The phase inputs of each competition, by id. */
export async function phaseInputsFor(db: Db, competitions: readonly CompetitionRow[]): Promise<Map<string, PhaseInputs>> {
  const ids = competitions.map((c) => c.id);
  const [firstSessions, firstSelections] = await Promise.all([firstSessionStarts(db, ids), firstSelectedOn(db, ids)]);
  return new Map(
    competitions.map((c) => [
      c.id,
      {
        startDate: c.startDate,
        endDate: c.endDate,
        venueZone: c.venueZone,
        standardsPublishedOn: c.standardsPublishedOn,
        firstSelectedOn: firstSelections.get(c.id) ?? null,
        firstSessionStart: firstSessions.get(c.id) ?? null,
      },
    ]),
  );
}

/** The earliest timed Session's venue-local start, by competition id (or by "<competition id>:<sport>"). */
async function firstSessionStarts(db: Db, ids: readonly string[], bySport = false): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const s = schema.session;
  const where = and(inArray(s.competitionId, [...ids]), isNotNull(s.startsAt));
  const rows = bySport
    ? await db.select({ competitionId: s.competitionId, sport: s.sport, first: min(s.startsAt) }).from(s).where(where).groupBy(s.competitionId, s.sport)
    : await db.select({ competitionId: s.competitionId, sport: s.competitionId, first: min(s.startsAt) }).from(s).where(where).groupBy(s.competitionId);
  return new Map(rows.filter((r) => r.first !== null).map((r) => [bySport ? `${r.competitionId}:${r.sport}` : r.competitionId, r.first!]));
}

/** The current phase of each competition with the given ids, by id. */
export async function currentPhasesOf(db: Db, ids: readonly string[], now: Date): Promise<Map<string, Phase>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(schema.competition).where(inArray(schema.competition.id, [...ids]));
  const inputs = await phaseInputsFor(db, rows);
  return new Map([...inputs].map(([id, i]) => [id, currentPhase(i, now)]));
}

export type GamesSport = { sport: string; firstDay: string; lastDay: string; inputs: PhaseInputs };

/**
 * A Games' phase inputs (ticket #35): one set per sport (that sport's first
 * and last day from `games_sport_window` and its own first Session, #37, and its
 * own first Selection, #34) and the Games as a whole, which combines its
 * own dates and Sessions with every sport's (Live at the first day or Session
 * in any sport). Sports in alphabetical order.
 */
export async function gamesPhaseInputs(db: Db, games: CompetitionRow): Promise<{ whole: PhaseInputs; sports: GamesSport[] }> {
  const own = (await phaseInputsFor(db, [games])).get(games.id)!;
  const w = schema.gamesSportWindow;
  const [windows, firstSessions, firstSelections] = await Promise.all([
    db.select().from(w).where(eq(w.competitionId, games.id)).orderBy(asc(w.sport)),
    firstSessionStarts(db, [games.id], true),
    firstSelectedOn(db, [games.id], true),
  ]);
  const sports = windows.map((s) => ({
    sport: s.sport,
    firstDay: s.firstDay,
    lastDay: s.lastDay,
    // The Games' standards and venue; the sport's own days, first Session and first Selection.
    inputs: {
      ...own,
      startDate: s.firstDay,
      endDate: s.lastDay,
      firstSelectedOn: firstSelections.get(`${games.id}:${s.sport.toLowerCase()}`) ?? null,
      firstSessionStart: firstSessions.get(`${games.id}:${s.sport}`) ?? null,
    },
  }));
  return { whole: combinedPhaseInputs([own, ...sports.map((s) => s.inputs)]), sports };
}
