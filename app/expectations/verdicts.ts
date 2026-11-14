// The After phase (spec #20, stories 48, 51–52 and 71–75; ticket #41): every
// Expectation of a competition's Entries compared with the official outcome.
// `loadAfter` reads one competition's Entries (Selected, or Withdrawn with an
// Expectation), each source's Expectation as it stood (Seed and Gracenote:
// the last snapshot before the start, at the Games the start of the Entry's
// sport; the pick as locked), the outcome (`outcomeOf` over the Entry's results
// in its event), and applies the pure rules (`verdict`, `tally`,
// `impliedCounts`, app/domain/verdicts.ts). The BOIC target (the Games) is a
// delegation-level count compared with Belgium's, never an Expectation.
// Expectations are compared here only, never on an Athlete page.
import { and, asc, eq, inArray } from "drizzle-orm";
import { gamesPhaseInputs, phaseInputsFor, type CompetitionRow } from "~/competition/phase-inputs";
import { type Db, schema } from "~/db/client";
import {
  BELGIAN_ZONE,
  impliedCounts,
  isQualificationStatus,
  lastSnapshotBefore,
  outcomeOf,
  pickLockAt,
  sameSport,
  tally,
  verdict,
  withdrawnBeforeLock,
  zonedWallClockToInstant,
  type DelegationCounts,
  type Outcome,
  type PlaceRange,
  type Tally,
  type Verdict,
} from "~/domain";
import { boicTargetOf, expectationsOf } from "./expectations";

/** The sources compared in After: Seeds, Gracenote (the Games only) and the owner's pick. */
export type AfterSource = "seed" | "gracenote" | "pick";

export const AFTER_SOURCE_LABELS: Record<AfterSource, string> = { seed: "Seed", gracenote: "Gracenote", pick: "My pick" };

/** One source's Expectation for an Entry and its Verdict; null when the source has none. */
export type Compared = (PlaceRange & { verdict: Verdict; asOf: string | null; sourceUrl: string | null }) | null;

export type AfterRow = {
  id: string;
  sport: string;
  event: string;
  who: { kind: "athlete" | "team"; id: string; name: string };
  outcome: { place: number | null; status: string | null; performance: string | null; withdrawn: boolean };
  compared: Record<AfterSource, Compared>;
};

export type AfterView = {
  games: boolean;
  sources: AfterSource[];
  rows: AfterRow[];
  tallies: { source: AfterSource; tally: Tally }[];
  /** Belgium's counts first, then the BOIC target (the Games, all sports), then the counts each source implies. */
  counts: { label: string; counts: { medals: number | null; top8: number | null }; sourceUrl?: string }[];
  /** Belgium's best placings, best first. */
  best: AfterRow[];
  /** The Gracenote updates compared (attribution and link). */
  gracenoteUpdates: { asOf: string; sourceUrl: string }[];
};

const BEST_SHOWN = 5;

/** The After phase of a competition; `chosen` sport chips narrow it to those sports (none: all). */
export async function loadAfter(db: Db, competition: CompetitionRow, chosen: readonly string[] = []): Promise<AfterView> {
  const games = competition.kind === "games";
  const sources: AfterSource[] = games ? ["seed", "gracenote", "pick"] : ["seed", "pick"];
  const e = schema.entry;
  const [entries, timing, target] = await Promise.all([
    db
      .select({ entry: e, athlete: schema.athlete.name, team: schema.team.name })
      .from(e)
      .leftJoin(schema.athlete, eq(e.athleteId, schema.athlete.id))
      .leftJoin(schema.team, eq(e.teamId, schema.team.id))
      .where(and(eq(e.competitionId, competition.id), inArray(e.qualificationStatus, ["selected", "withdrawn"]))),
    timingOf(db, competition),
    chosen.length === 0 ? boicTargetOf(db, competition) : null,
  ]);
  const wanted = chosen.map((s) => s.toLowerCase());
  const shown = entries.filter(({ entry }) => wanted.length === 0 || wanted.includes(entry.sport.toLowerCase()));
  const r = schema.result;
  const [expectations, results] = await Promise.all([
    expectationsOf(
      db,
      shown.map(({ entry }) => entry.id),
      // Only the snapshots are read; `now` decides nothing here.
      timing.lockAt,
    ),
    db.select().from(r).where(eq(r.competitionId, competition.id)).orderBy(asc(r.date)),
  ]);

  const rows = shown
    .map(({ entry, athlete, team }): AfterRow | null => {
      const x = expectations.get(entry.id)!;
      const start = timing.startOf(entry.sport);
      const seed = lastSnapshotBefore(x.seeds, start);
      const gracenote = games ? lastSnapshotBefore(x.gracenote, start) : null;
      const withdrawn = isQualificationStatus(entry.qualificationStatus) && entry.qualificationStatus === "withdrawn";
      // An Entry withdrawn with nothing expected of it has nothing to compare.
      if (withdrawn && !seed && !gracenote && !x.pick) return null;
      const own = results.filter(
        (x) => x.event.toLowerCase() === entry.event.toLowerCase() && (entry.athleteId ? x.athleteId === entry.athleteId : x.teamId === entry.teamId),
      );
      const place = outcomeOf(own);
      const final = own.findLast((x) => x.place === place) ?? own.at(-1) ?? null;
      const outcome: Outcome = { place, withdrawnBeforeLock: withdrawn && withdrawnBeforeLock(withdrawnMoment(entry), timing.lockAt) };
      const compare = (expected: (PlaceRange & { asOf?: string; sourceUrl?: string | null }) | null): Compared => {
        const v = verdict(expected, outcome);
        return expected && v ? { from: expected.from, to: expected.to, verdict: v, asOf: expected.asOf ?? null, sourceUrl: expected.sourceUrl ?? null } : null;
      };
      return {
        id: entry.id,
        sport: entry.sport,
        event: entry.event,
        who: entry.teamId ? { kind: "team", id: entry.teamId, name: team ?? "" } : { kind: "athlete", id: entry.athleteId!, name: athlete ?? "" },
        outcome: { place, status: final?.status ?? null, performance: final?.performance ?? null, withdrawn },
        compared: { seed: compare(seed), gracenote: compare(gracenote), pick: compare(x.pick) },
      };
    })
    .filter((row): row is AfterRow => row !== null)
    .sort((a, b) => a.who.name.localeCompare(b.who.name) || a.event.localeCompare(b.event));

  const counted = (source: AfterSource) => rows.map((row) => row.compared[source]).filter((c) => c !== null && c.verdict !== "voided");
  const counts: AfterView["counts"] = [{ label: "Belgium", counts: impliedCounts(rows.map((row) => (row.outcome.place ? { from: row.outcome.place, to: row.outcome.place } : null))) }];
  if (target) counts.push({ label: "BOIC target", counts: { medals: target.medals, top8: target.top8 }, sourceUrl: target.sourceUrl });
  for (const source of sources) counts.push({ label: `Implied by ${source === "seed" ? "Seeds" : source === "pick" ? "my picks" : "Gracenote"}`, counts: impliedCounts(counted(source)) satisfies DelegationCounts });

  const updates = new Map<string, { asOf: string; sourceUrl: string }>();
  for (const row of rows) {
    const g = row.compared.gracenote;
    if (g?.sourceUrl && g.asOf) updates.set(`${g.asOf} ${g.sourceUrl}`, { asOf: g.asOf, sourceUrl: g.sourceUrl });
  }

  return {
    games,
    sources,
    rows,
    tallies: sources.map((source) => ({ source, tally: tally(rows.map((row) => row.compared[source]?.verdict ?? null)) })),
    counts,
    best: rows
      .filter((row) => row.outcome.place !== null)
      .toSorted((a, b) => a.outcome.place! - b.outcome.place!)
      .slice(0, BEST_SHOWN),
    gracenoteUpdates: [...updates.values()].sort((a, b) => a.asOf.localeCompare(b.asOf)),
  };
}

/**
 * When picks locked (the Games: every sport at the Games' first Session) and
 * the day each Entry's snapshots are compared before: the competition's first
 * day, at the Games the first day of the Entry's sport.
 */
async function timingOf(db: Db, competition: CompetitionRow) {
  if (competition.kind === "games") {
    const { whole, sports } = await gamesPhaseInputs(db, competition);
    return {
      lockAt: pickLockAt(whole),
      startOf: (sport: string) => sports.find((s) => sameSport(s.sport, sport))?.firstDay ?? competition.startDate,
    };
  }
  const inputs = (await phaseInputsFor(db, [competition])).get(competition.id)!;
  return { lockAt: pickLockAt(inputs), startOf: () => competition.startDate };
}

/** When the Entry withdrew; for a withdrawal recorded before #41, the start of the Belgian day its status was last checked. */
function withdrawnMoment(entry: typeof schema.entry.$inferSelect): string | null {
  if (entry.withdrawnAt) return entry.withdrawnAt;
  return entry.qualificationCheckedOn ? zonedWallClockToInstant(`${entry.qualificationCheckedOn}T00:00`, BELGIAN_ZONE).toISOString() : null;
}
