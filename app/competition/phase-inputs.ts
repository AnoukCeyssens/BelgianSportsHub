// Gathers the phase inputs of Championships, the Games and each
// Games sport (#35) from storage and hands them to the domain rule
// `currentPhase`. Ticket #31. Each input has one source:
// - standards published: the owner's record on `competition` (ticket #31);
// - first Selected Entry: null until Selections exist; #34 fills it with the
//   Belgian date of the earliest Selection naming an Entry;
// - first Session start: null until Sessions exist; #37 fills it with the
//   earliest Session's venue-local start (midnight venue time on day one is
//   the rule's fallback, so no Session is needed for Live).
// Add an input here (one batched query per input), never in a page.
import { asc, eq, inArray } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { combinedPhaseInputs, currentPhase, type Phase, type PhaseInputs } from "~/domain";

export type CompetitionRow = typeof schema.competition.$inferSelect;

/** The phase inputs of each competition, by id. */
export async function phaseInputsFor(_db: Db, competitions: readonly CompetitionRow[]): Promise<Map<string, PhaseInputs>> {
  return new Map(
    competitions.map((c) => [
      c.id,
      {
        startDate: c.startDate,
        endDate: c.endDate,
        venueZone: c.venueZone,
        standardsPublishedOn: c.standardsPublishedOn,
        firstSelectedOn: null,
        firstSessionStart: null,
      },
    ]),
  );
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
 * and last day from `games_sport_window`; #34 and #37 add its own first
 * Selection and first Session) and the Games as a whole, which combines its
 * own dates with every sport's (Live at the first day or Session in any
 * sport). Sports in alphabetical order.
 */
export async function gamesPhaseInputs(db: Db, games: CompetitionRow): Promise<{ whole: PhaseInputs; sports: GamesSport[] }> {
  const own = (await phaseInputsFor(db, [games])).get(games.id)!;
  const w = schema.gamesSportWindow;
  const windows = await db.select().from(w).where(eq(w.competitionId, games.id)).orderBy(asc(w.sport));
  const sports = windows.map((s) => ({
    sport: s.sport,
    firstDay: s.firstDay,
    lastDay: s.lastDay,
    // The Games' standards and venue; the sport's own days. Its own first Selection (#34) and first Session (#37) go here.
    inputs: { ...own, startDate: s.firstDay, endDate: s.lastDay, firstSelectedOn: null, firstSessionStart: null },
  }));
  return { whole: combinedPhaseInputs([own, ...sports.map((s) => s.inputs)]), sports };
}
