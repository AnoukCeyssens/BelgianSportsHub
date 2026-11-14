// Qualification status and tracks from storage (GLOSSARY "Qualification
// status", "Qualification track"; ticket #32). The hub every qualification
// feature reads through:
// - `potentialEntries`: a target competition's potential Entries (`entry`
//   rows) with their status and tracks, Active Athletes and Teams only
//   (story 25, filtered through `activeStatuses`);
// - `qualificationOf`: an Athlete's or Team's two targets (the next Olympics,
//   the next Championship) with its own Entries there;
// - `inContentionAt`: the competitions where an Active Belgian Entry is in
//   contention (likely Participation, #29).
// Writes are the owner's, in app/routes/curate.qualification.tsx.
import { and, asc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import {
  belgianDate,
  inContention,
  isQualificationStatus,
  qualificationTargets,
  trackProgress,
  windowCountdown,
  type QualificationStatus,
  type TrackBetter,
  type TrackState,
} from "~/domain";
import { activeStatuses } from "~/roster/active";

export type TrackView = {
  id: string;
  name: string;
  needed: string;
  has: string;
  state: TrackState;
  better: TrackBetter | null;
  source: string | null;
  checkedOn: string;
  changedOn: string;
  /** 0–100, the progress bar (`trackProgress`). */
  progress: number;
};

export type PotentialEntry = {
  id: string;
  competitionId: string;
  sport: string;
  event: string;
  who: { kind: "athlete" | "team"; id: string; name: string };
  status: QualificationStatus | null;
  source: string | null;
  checkedOn: string | null;
  /** The Selection behind a Selected / Not selected status (#34); null while none names the Entry. */
  selection: EntrySelection | null;
  tracks: TrackView[];
};

export type EntrySelection = { selector: string | null; source: string | null; kind: "press-release" | "entry-list"; on: string | null };

type Who = { athleteId: string } | { teamId: string };

/**
 * The potential Entries of these competitions, Active Athletes and Teams
 * only, with their tracks in order; sorted by sport, name, event. `who`
 * narrows them to one Athlete's or Team's own Entries.
 */
export async function potentialEntries(db: Db, competitionIds: readonly string[], now: Date, who?: Who): Promise<PotentialEntry[]> {
  if (competitionIds.length === 0) return [];
  const e = schema.entry;
  const rows = await db
    .select({ entry: e, athlete: schema.athlete.name, team: schema.team.name })
    .from(e)
    .leftJoin(schema.athlete, eq(e.athleteId, schema.athlete.id))
    .leftJoin(schema.team, eq(e.teamId, schema.team.id))
    .where(
      and(
        inArray(e.competitionId, [...competitionIds]),
        who ? ("athleteId" in who ? eq(e.athleteId, who.athleteId) : eq(e.teamId, who.teamId)) : undefined,
      ),
    );
  if (rows.length === 0) return [];
  const active = await activeStatuses(db, now, {
    athleteIds: [...new Set(rows.flatMap((r) => (r.entry.athleteId ? [r.entry.athleteId] : [])))],
    teamIds: [...new Set(rows.flatMap((r) => (r.entry.teamId ? [r.entry.teamId] : [])))],
  });
  const kept = rows.filter((r) => (r.entry.teamId ? active.teams.get(r.entry.teamId) : active.athletes.get(r.entry.athleteId!))?.active);
  const t = schema.qualificationTrack;
  const tracks =
    kept.length === 0
      ? []
      : await db
          .select()
          .from(t)
          .where(inArray(t.entryId, kept.map((r) => r.entry.id)))
          .orderBy(asc(t.position));
  return kept
    .map(({ entry, athlete, team }) => ({
      id: entry.id,
      competitionId: entry.competitionId,
      sport: entry.sport,
      event: entry.event,
      who: entry.teamId ? { kind: "team" as const, id: entry.teamId, name: team ?? "" } : { kind: "athlete" as const, id: entry.athleteId!, name: athlete ?? "" },
      status: isQualificationStatus(entry.qualificationStatus) ? entry.qualificationStatus : null,
      source: entry.qualificationSource,
      checkedOn: entry.qualificationCheckedOn,
      selection:
        entry.selectionKind === "press-release" || entry.selectionKind === "entry-list"
          ? { selector: entry.selector, source: entry.selectionSource, kind: entry.selectionKind as EntrySelection["kind"], on: entry.selectedOn }
          : null,
      tracks: tracks
        .filter((x) => x.entryId === entry.id)
        .map((x) => {
          const measure = { needed: x.needed, has: x.has, state: x.state as TrackState, better: (x.better as TrackBetter | null) ?? null };
          return { ...measure, id: x.id, name: x.name, source: x.source, checkedOn: x.checkedOn, changedOn: x.changedOn, progress: trackProgress(measure) };
        }),
    }))
    .toSorted((a, b) => a.sport.localeCompare(b.sport) || a.who.name.localeCompare(b.who.name) || a.event.localeCompare(b.event));
}

export type TargetKey = "olympics" | "championship";

export type QualificationTarget = {
  key: TargetKey;
  competition: { id: string; name: string; kind: string; startDate: string; endDate: string; closesOn: string | null } | null;
  /** Days until the qualification window closes; null when not recorded. */
  closesIn: number | null;
  entries: PotentialEntry[];
};

/**
 * An Athlete's or Team's Qualification (story 28): null while it is inactive
 * (only Active Entries are tracked), else its two targets with its own
 * Entries there. A Team's status is its own: an Athlete's targets never show
 * the Teams whose rosters credit them.
 */
export async function qualificationOf(db: Db, who: Who & { sport: string }, now: Date): Promise<QualificationTarget[] | null> {
  const statuses = await activeStatuses(db, now, "athleteId" in who ? { athleteIds: [who.athleteId] } : { teamIds: [who.teamId] });
  const status = "athleteId" in who ? statuses.athletes.get(who.athleteId) : statuses.teams.get(who.teamId);
  if (!status?.active) return null;

  const c = schema.competition;
  const e = schema.entry;
  const [competitions, own] = await Promise.all([
    db
      .select()
      .from(c)
      .where(and(or(eq(c.kind, "games"), eq(c.kind, "championship")), gte(c.endDate, belgianDate(now)))),
    db
      .select({ competitionId: e.competitionId })
      .from(e)
      .where("athleteId" in who ? eq(e.athleteId, who.athleteId) : eq(e.teamId, who.teamId)),
  ]);
  const targets = qualificationTargets({ sport: who.sport, competitions, withEntries: new Set(own.map((x) => x.competitionId)) }, now);
  const ids = [targets.olympics?.id, targets.championship?.id].filter((x): x is string => x !== undefined);
  const entries = await potentialEntries(db, ids, now, who);
  return (["olympics", "championship"] as const).map((key) => {
    const target = targets[key];
    return {
      key,
      competition: target
        ? { id: target.id, name: target.name, kind: target.kind, startDate: target.startDate, endDate: target.endDate, closesOn: target.qualificationClosesOn }
        : null,
      closesIn: target ? windowCountdown(target.qualificationClosesOn, now) : null,
      entries: target ? entries.filter((x) => x.competitionId === target.id) : [],
    };
  });
}

/** Ids of these competitions where an Active Belgian Entry is in contention (GLOSSARY "Participation"). */
export async function inContentionAt(db: Db, competitionIds: readonly string[], now: Date): Promise<Set<string>> {
  if (competitionIds.length === 0) return new Set();
  const e = schema.entry;
  const rows = await db
    .select({ competitionId: e.competitionId, athleteId: e.athleteId, teamId: e.teamId, status: e.qualificationStatus })
    .from(e)
    .where(and(inArray(e.competitionId, [...competitionIds]), isNotNull(e.qualificationStatus)));
  const contending = rows.filter((r) => isQualificationStatus(r.status) && inContention(r.status));
  if (contending.length === 0) return new Set();
  const active = await activeStatuses(db, now, {
    athleteIds: [...new Set(contending.flatMap((r) => (r.athleteId ? [r.athleteId] : [])))],
    teamIds: [...new Set(contending.flatMap((r) => (r.teamId ? [r.teamId] : [])))],
  });
  return new Set(
    contending.filter((r) => (r.teamId ? active.teams.get(r.teamId) : active.athletes.get(r.athleteId!))?.active).map((r) => r.competitionId),
  );
}
