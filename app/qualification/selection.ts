// Selections from storage (GLOSSARY "Selection"; spec #20, stories 46, 81,
// 85, 96 and 108; ticket #34). Selected / Not selected are Qualification
// statuses on the same `entry` row; the Selection behind them is stored there
// too (selector, source URL, press release or IF entry list, announced date,
// raw copy).
// - `selectionCandidates`: a competition's candidates in one sport (Active
//   potential Entries, not withdrawn) with the names a press release may use;
// - `recordSelection`: the owner's Selection: ticked Entries Selected, the
//   other candidates Not selected;
// - `applyEntryList`: a published IF entry list replaces the Selection
//   (called by the Belgian-row writer when an adapter stores entrants);
// - `firstSelectedOn`: the earliest Selection per competition (and per Games
//   sport), the Selection phase's input.
import { and, eq, inArray, min, sql } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { belgianDate, entryListSelection, sameSport, selectorFor, type ListedEntrant, type SelectionCandidate } from "~/domain";
import { potentialEntries, type PotentialEntry } from "./entries";
import { linkAtSelection } from "./quota-places";

export type Candidate = PotentialEntry & { names: string[] };

/** The candidates of a Selection: Active potential Entries of this sport at the competition, withdrawn ones left out. */
export async function selectionCandidates(db: Db, competitionId: string, sport: string, now: Date): Promise<Candidate[]> {
  const entries = (await potentialEntries(db, [competitionId], now)).filter(
    (e) => sameSport(e.sport, sport) && e.status !== "withdrawn",
  );
  // A Team goes by its own name and its members' ("A / B" for a partnership).
  return entries.map((e) => ({
    ...e,
    names: e.who.kind === "team" ? [e.who.name, ...e.who.name.split(" / ").filter((n) => n !== e.who.name)] : [e.who.name],
  }));
}

export const asSelectionCandidates = (candidates: readonly Candidate[]): SelectionCandidate[] =>
  candidates.map((c) => ({ id: c.id, names: c.names }));

export type SelectionInput = {
  competitionId: string;
  sport: string;
  selector: string;
  sourceUrl: string;
  kind: "press-release" | "entry-list";
  announcedOn: string;
  rawCopyId: string | null;
  /** Ids of the ticked Entries. */
  selected: readonly string[];
};

/** Saves the owner's Selection: ticked candidates Selected, the others Not selected; stamped checked today. Returns the counts. */
export async function recordSelection(db: Db, input: SelectionInput, now: Date): Promise<{ selected: number; notSelected: number }> {
  const candidates = await selectionCandidates(db, input.competitionId, input.sport, now);
  const ticked = new Set(input.selected);
  const unknown = [...ticked].filter((id) => !candidates.some((c) => c.id === id));
  if (unknown.length > 0)
    throw new Response("A ticked Entry is not a candidate of this Selection", {
      status: 400,
    });
  const today = belgianDate(now);
  for (const c of candidates) {
    await db
      .update(schema.entry)
      .set({
        qualificationStatus: ticked.has(c.id) ? "selected" : "not-selected",
        qualificationSource: input.sourceUrl,
        qualificationCheckedOn: today,
        selector: input.selector,
        selectionSource: input.sourceUrl,
        selectionKind: input.kind,
        selectedOn: input.announcedOn,
        selectionRawCopyId: input.rawCopyId,
        withdrawnAt: null,
      })
      .where(eq(schema.entry.id, c.id));
  }
  await linkNocPlaces(db, input.competitionId, candidates);
  return { selected: ticked.size, notSelected: candidates.length - ticked.size };
}

/**
 * A published IF entry list (the Belgians it names, with the events it names
 * them in where the source says) replaces the Selection as far as it goes
 * (`entryListSelection`): per event, and for Teams through their members
 * (ADR 0001). The selector stays (the BOIC at the Games). Returns the number
 * of Entries changed.
 */
export async function applyEntryList(db: Db, competitionId: string, rawCopyId: string, listed: readonly ListedEntrant[], now: Date): Promise<number> {
  const e = schema.entry;
  const [rows, copy, competition] = await Promise.all([
    db.select().from(e).where(eq(e.competitionId, competitionId)),
    db.query.rawCopy.findFirst({ where: eq(schema.rawCopy.id, rawCopyId) }),
    db.query.competition.findFirst({
      where: eq(schema.competition.id, competitionId),
    }),
  ]);
  if (rows.length === 0 || !copy || !competition) return 0;
  const entries = await withMembers(db, rows);
  const today = belgianDate(now);
  let changed = 0;
  for (const { id, status } of entryListSelection(entries, listed)) {
    const row = entries.find((x) => x.id === id)!;
    if (row.qualificationStatus === status && row.selectionKind === "entry-list" && row.selectionSource === copy.url) continue;
    await db
      .update(e)
      .set({
        qualificationStatus: status,
        qualificationSource: copy.url,
        qualificationCheckedOn: today,
        selector: row.selector ?? selectorFor(competition.kind),
        selectionSource: copy.url,
        selectionKind: "entry-list",
        selectedOn: row.selectionKind === "entry-list" && row.selectedOn ? row.selectedOn : belgianDate(new Date(copy.fetchedAt)),
        selectionRawCopyId: rawCopyId,
        withdrawnAt: null,
      })
      .where(eq(e.id, id));
    changed++;
  }
  if (changed > 0) await linkNocPlaces(db, competitionId, entries);
  return changed;
}

/** Each Entry with its Team's members: everyone a roster of the Team has credited, at any competition. */
async function withMembers(db: Db, rows: (typeof schema.entry.$inferSelect)[]) {
  const teamIds = [...new Set(rows.flatMap((r) => (r.teamId ? [r.teamId] : [])))];
  const [teams, members] =
    teamIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.select({ id: schema.team.id, kind: schema.team.kind }).from(schema.team).where(inArray(schema.team.id, teamIds)),
          db
            .selectDistinct({ teamId: schema.rosterMember.teamId, athleteId: schema.rosterMember.athleteId })
            .from(schema.rosterMember)
            .where(inArray(schema.rosterMember.teamId, teamIds)),
        ]);
  return rows.map((r) => ({
    ...r,
    members: members.flatMap((m) => (m.teamId === r.teamId && m.athleteId ? [m.athleteId] : [])),
    partnership: teams.find((t) => t.id === r.teamId)?.kind === "partnership",
  }));
}

/**
 * The Belgian date of the earliest Selection naming a Selected Entry, by
 * competition id (or by "<competition id>:<sport, lower-cased>"). A Selected
 * status set by hand without a Selection counts from its checked date.
 */
export async function firstSelectedOn(db: Db, ids: readonly string[], bySport = false): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const e = schema.entry;
  const on = min(sql<string>`coalesce(${e.selectedOn}, ${e.qualificationCheckedOn})`);
  const where = and(inArray(e.competitionId, [...ids]), eq(e.qualificationStatus, "selected"));
  const rows = bySport
    ? await db
        .select({
          competitionId: e.competitionId,
          sport: sql<string>`lower(${e.sport})`,
          first: on,
        })
        .from(e)
        .where(where)
        .groupBy(e.competitionId, sql`lower(${e.sport})`)
    : await db
        .select({
          competitionId: e.competitionId,
          sport: e.competitionId,
          first: on,
        })
        .from(e)
        .where(where)
        .groupBy(e.competitionId);
  return new Map(rows.filter((r) => r.first !== null).map((r) => [bySport ? `${r.competitionId}:${r.sport}` : r.competitionId, r.first!]));
}

/** At the Games, NOC-owned Quota places follow Selection in each event the Selection touched (#36, story 81). */
async function linkNocPlaces(db: Db, competitionId: string, entries: readonly { sport: string; event: string }[]) {
  const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, competitionId) });
  if (competition?.kind !== "games") return;
  const events = new Map(entries.map((e) => [`${e.sport.toLowerCase()}\n${e.event.toLowerCase()}`, e]));
  for (const e of events.values()) await linkAtSelection(db, competitionId, e.sport, e.event);
}
