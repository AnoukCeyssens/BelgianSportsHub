// Belgian Participation per competition (spec #20, stories 38, 40, 96 and
// 109), for the Calendar, the Selections & likely step and (later) the iCal
// feed. Gathers the facts from storage and hands them to the domain rule:
// - named: an entry list (`entrant`) or a result names a Belgian Athlete
//   (start lists and Selections join here when they arrive);
// - previous edition: a result of a currently Active Belgian Entry at the
//   latest earlier competition of the same series (inactive Entries drop out
//   of likely Participation, story 25);
// - in contention: an Active Belgian Entry has a Qualification status still
//   in the race there (#32, `inContentionAt`);
// - the owner's word: `participation_curation`.
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { now } from "~/clock";
import { type Db, schema } from "~/db/client";
import { inContentionAt } from "~/qualification/entries";
import { activeStatuses } from "~/roster/active";
import { participation, type OwnerParticipationDecision, type Participation, type ParticipationReason } from "~/domain";

export type CompetitionParticipation = {
  id: string;
  name: string;
  sport: string;
  /** Key of the source the competition came from. */
  source: string;
  kind: "championship" | "games" | "circuit";
  startDate: string;
  endDate: string;
  city: string | null;
  participation: Participation;
  /** Belgian Athletes an entry list or result names, by name. */
  named: string[];
  curation: typeof schema.participationCuration.$inferSelect | null;
};

/** Every competition overlapping [from, to] (YYYY-MM-DD, inclusive), with its Participation. */
export async function participationsBetween(db: Db, from: string, to: string): Promise<CompetitionParticipation[]> {
  const c = schema.competition;
  const competitions = await db
    .select()
    .from(c)
    .where(and(lte(c.startDate, to), gte(c.endDate, from)))
    .orderBy(asc(c.startDate), asc(c.name));
  if (competitions.length === 0) return [];
  const ids = competitions.map((x) => x.id);

  const [entrants, results, curations, previous, contending] = await Promise.all([
    db
      .select({ competitionId: schema.entrant.competitionId, name: schema.athlete.name })
      .from(schema.entrant)
      .innerJoin(schema.athlete, eq(schema.entrant.athleteId, schema.athlete.id))
      .where(inArray(schema.entrant.competitionId, ids)),
    // A result names a Belgian Entry: an Athlete or a Team (ADR 0001).
    db
      .select({ competitionId: schema.result.competitionId, name: sql<string>`coalesce(${schema.athlete.name}, ${schema.team.name})` })
      .from(schema.result)
      .leftJoin(schema.athlete, eq(schema.result.athleteId, schema.athlete.id))
      .leftJoin(schema.team, eq(schema.result.teamId, schema.team.id))
      .where(and(inArray(schema.result.competitionId, ids), or(isNotNull(schema.athlete.id), isNotNull(schema.team.id)))),
    db.select().from(schema.participationCuration).where(inArray(schema.participationCuration.competitionId, ids)),
    previousEditionsWithBelgians(db, competitions),
    inContentionAt(db, ids, now()),
  ]);

  const named = new Map<string, Set<string>>();
  for (const row of [...entrants, ...results]) {
    if (!named.has(row.competitionId)) named.set(row.competitionId, new Set());
    named.get(row.competitionId)!.add(row.name);
  }
  const curationOf = new Map(curations.map((x) => [x.competitionId, x]));

  return competitions.map((comp) => {
    const names = [...(named.get(comp.id) ?? [])].sort((a, b) => a.localeCompare(b));
    const curation = curationOf.get(comp.id) ?? null;
    return {
      id: comp.id,
      name: comp.name,
      sport: comp.sport,
      source: comp.source,
      kind: comp.kind as CompetitionParticipation["kind"],
      startDate: comp.startDate,
      endDate: comp.endDate,
      city: comp.city,
      named: names,
      curation,
      participation: participation({
        namedBelgianEntry: names.length > 0,
        previousEdition: previous.has(comp.id),
        inContention: contending.has(comp.id),
        owner: ownerDecision(curation),
      }),
    };
  });
}

/** Kept after being added by hand is still added by hand. */
function ownerDecision(curation: typeof schema.participationCuration.$inferSelect | null): OwnerParticipationDecision | null {
  if (!curation) return null;
  if (curation.decision === "confirmed" || curation.decision === "dropped") return curation.decision;
  if (curation.addedAt) return "added";
  return curation.decision === "kept" ? "kept" : null;
}

/** Ids of the competitions whose previous edition (same series, latest earlier start) had a Belgian result. */
async function previousEditionsWithBelgians(db: Db, competitions: (typeof schema.competition.$inferSelect)[]) {
  const withSeries = competitions.filter((x) => x.series !== null);
  const found = new Set<string>();
  if (withSeries.length === 0) return found;
  const c = schema.competition;
  const latestStart = withSeries.map((x) => x.startDate).sort().at(-1)!;
  const editions = await db
    .select({ id: c.id, series: c.series, startDate: c.startDate })
    .from(c)
    .where(and(inArray(c.series, [...new Set(withSeries.map((x) => x.series!))]), lt(c.startDate, latestStart)));
  const editionIds = editions.map((e) => e.id);
  const withBelgians = new Set<string>();
  if (editionIds.length > 0) {
    const r = schema.result;
    const entries = await db
      .selectDistinct({ id: r.competitionId, athleteId: r.athleteId, teamId: r.teamId })
      .from(r)
      .where(and(inArray(r.competitionId, editionIds), or(isNotNull(r.athleteId), isNotNull(r.teamId))));
    const active = await activeStatuses(db, now(), {
      athleteIds: [...new Set(entries.flatMap((e) => (e.athleteId ? [e.athleteId] : [])))],
      teamIds: [...new Set(entries.flatMap((e) => (e.teamId ? [e.teamId] : [])))],
    });
    for (const e of entries) {
      const status = e.teamId ? active.teams.get(e.teamId) : active.athletes.get(e.athleteId!);
      if (status?.active) withBelgians.add(e.id);
    }
  }
  for (const comp of withSeries) {
    const previous = editions
      .filter((e) => e.series === comp.series && e.startDate < comp.startDate)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (previous && withBelgians.has(previous.id)) found.add(comp.id);
  }
  return found;
}

/** Why a competition has its Participation, as the owner and readers read it. */
export const REASON_TEXT: Record<ParticipationReason, string> = {
  named: "named on an entry list or result",
  "confirmed-by-hand": "confirmed by hand",
  "previous-edition": "Belgian Entry at the previous edition",
  "in-contention": "a Belgian Entry is in contention",
  "added-by-hand": "added by hand",
  kept: "kept by hand",
};

/** "Confirmed · Sandrine Tas", "Likely: added by hand", "No Belgian Participation known yet". */
export function participationText(c: Pick<CompetitionParticipation, "participation" | "named">) {
  const { status, why } = c.participation;
  if (status === "confirmed") return ["Confirmed", ...(c.named.length > 0 ? [c.named.join(", ")] : [])].join(" · ");
  if (status === "likely") return `Likely: ${why.map((w) => REASON_TEXT[w]).join("; ")}`;
  return "No Belgian Participation known yet";
}
