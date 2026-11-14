// Where each Belgian Entry of a competition sits in its schedule (spec #20,
// stories 55–58; tickets #37 and #38): every round of its event from the one
// it starts in, moved on or dropped by what results and start lists say
// (`roundsFor`), with the optional heat or match detail and the Entry's final
// result. Read by the Live day view and by the Live day pass.
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { currentPhasesOf, type CompetitionRow } from "./phase-inputs";
import { roundsFor, sameSport, type RoundOutcome, type RoundState } from "~/domain";

export type EntryRow = typeof schema.entry.$inferSelect;
export type SessionRow = typeof schema.session.$inferSelect;

export type RoundDetail = { heat: string | null; lane: string | null; opponent: string | null; startsAt: string | null };

export type EventResultRow = { place: number | null; status: string; performance: string | null; date: string };

export type PlacedRound = {
  /** Unique per Session round and Entry. */
  key: string;
  entry: EntryRow;
  who: string;
  href: string | null;
  session: SessionRow;
  round: string;
  state: RoundState;
  outcome: RoundOutcome | null;
  /** The heat or match detail, when any was given. */
  detail: RoundDetail | null;
  /** When the owner last looked for detail on this round, and the start list it was read on. */
  detailCheckedAt: string | null;
  detailSource: string | null;
  /** The Entry's final result in the event, when there is one. */
  result: EventResultRow | null;
  /** The last round of the event the Entry can still reach (its result shows there). */
  last: boolean;
};

/** Every placed round of the competition's Belgian Entries, in the chosen sports (none chosen: all), in time order. */
export async function loadPlacedRounds(db: Db, competition: CompetitionRow, chosen: readonly string[] = []): Promise<{ sessions: SessionRow[]; placed: PlacedRound[] }> {
  const s = schema.session;
  const sessions = await db.select().from(s).where(eq(s.competitionId, competition.id)).orderBy(asc(s.date), asc(s.startsAt));
  if (sessions.length === 0) return { sessions, placed: [] };
  const r = schema.result;
  const [rounds, entries, results] = await Promise.all([
    db.select().from(schema.sessionRound).where(inArray(schema.sessionRound.sessionId, sessions.map((x) => x.id))).orderBy(asc(schema.sessionRound.position)),
    db
      .select({ entry: schema.entry, athlete: schema.athlete.name, team: schema.team.name })
      .from(schema.entry)
      .leftJoin(schema.athlete, eq(schema.entry.athleteId, schema.athlete.id))
      .leftJoin(schema.team, eq(schema.entry.teamId, schema.team.id))
      .where(eq(schema.entry.competitionId, competition.id)),
    db
      .select()
      .from(r)
      .where(and(eq(r.competitionId, competition.id), or(isNotNull(r.athleteId), isNotNull(r.teamId))))
      .orderBy(asc(r.date)),
  ]);
  const attachments = entries.length
    ? await db.select().from(schema.entryRound).where(inArray(schema.entryRound.entryId, entries.map((e) => e.entry.id)))
    : [];

  const sessionById = new Map(sessions.map((x) => [x.id, x]));
  // Every round of every event, in time order (sessions are ordered; rounds keep their place in the Session).
  const timed = rounds
    .map((x) => ({ ...x, session: sessionById.get(x.sessionId)!, date: sessionById.get(x.sessionId)!.date }))
    .sort((a, b) => sessions.indexOf(a.session) - sessions.indexOf(b.session) || a.position - b.position);

  const placed = entries
    .filter(({ entry }) => chosen.length === 0 || chosen.includes(entry.sport))
    .flatMap(({ entry, athlete, team }) => {
      const own = attachments.filter((a) => a.entryId === entry.id);
      const result =
        results.findLast(
          (x) =>
            x.event.toLowerCase() === entry.event.toLowerCase() &&
            (entry.athleteId ? x.athleteId === entry.athleteId : x.teamId === entry.teamId),
        ) ?? null;
      const kept = roundsFor(
        entry,
        timed.filter((x) => x.event === entry.event && sameSport(x.session.sport, entry.sport)),
        {
          rounds: own.map((a) => ({ round: a.round, outcome: (a.outcome as RoundOutcome | null) ?? null, listed: hasDetail(a) })),
          result: result ? { date: result.date, status: result.status } : null,
        },
      );
      const lastRound = kept.at(-1)?.round;
      return kept.map((x): PlacedRound => {
        const a = own.find((o) => o.round === x.round);
        return {
          key: `${x.id}:${entry.id}`,
          entry,
          who: athlete ?? team ?? "",
          href: entry.athleteId ? `/athletes/${entry.athleteId}` : entry.teamId ? `/teams/${entry.teamId}` : null,
          session: x.session,
          round: x.round,
          state: x.state,
          outcome: x.outcome,
          detail: a && hasDetail(a) ? { heat: a.heat, lane: a.lane, opponent: a.opponent, startsAt: a.startsAt } : null,
          detailCheckedAt: a?.detailCheckedAt ?? null,
          detailSource: a?.detailSource ?? null,
          result: result ? { place: result.place, status: result.status, performance: result.performance, date: result.date } : null,
          last: x.round === lastRound,
        };
      });
    });
  return { sessions, placed };
}

function hasDetail(a: { heat: string | null; lane: string | null; opponent: string | null; startsAt: string | null }) {
  return Boolean(a.heat || a.lane || a.opponent || a.startsAt);
}

/** "heat 2 · lane 4 · v LI Wen (CHN)": the detail without its start time; null when there is none. */
export function detailText(detail: RoundDetail | null): string | null {
  if (!detail) return null;
  const parts = [detail.heat ? `heat ${detail.heat}` : null, detail.lane ? `lane ${detail.lane}` : null, detail.opponent ? `v ${detail.opponent}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The competitions with Belgian Entries that are Live now (the Live day pass runs while there is one). */
export async function liveCompetitions(db: Db, now: Date): Promise<CompetitionRow[]> {
  const ids = [...new Set((await db.selectDistinct({ id: schema.entry.competitionId }).from(schema.entry)).map((e) => e.id))];
  const phases = await currentPhasesOf(db, ids, now);
  const live = ids.filter((id) => phases.get(id) === "live");
  if (live.length === 0) return [];
  return db.select().from(schema.competition).where(inArray(schema.competition.id, live)).orderBy(asc(schema.competition.startDate));
}
