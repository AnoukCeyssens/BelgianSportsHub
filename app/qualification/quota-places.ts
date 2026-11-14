// Quota places from storage (GLOSSARY "Quota place", ADR 0002; ticket #36).
// A separate fact from the Entries' Qualification statuses: Belgium's places
// per Games and event, NOC-owned or named, with their lifecycle state,
// source and last check.
// - `quotaPlacesOf`: a Games' places, for its Qualification phase and the
//   owner's page;
// - `recordQuotaPlaces`: records n new places (a nation ranking that earns n
//   places records n; Rankings ingest (#33) can call it too);
// - `linkAtSelection`: NOC-owned places follow Selection in their event.
// Moves go through `quotaPlaceTransition`; the owner's writes are in
// app/routes/curate.qualification.tsx.
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { isQuotaPlaceState, quotaPlaceEnded, quotaPlaceTransition, type QuotaPlaceKind, type QuotaPlaceState } from "~/domain";

export type QuotaPlaceView = {
  id: string;
  sport: string;
  event: string;
  /** "place 2 of 3": its number and how many places Belgium has recorded in the event. */
  number: number;
  of: number;
  kind: QuotaPlaceKind;
  state: QuotaPlaceState;
  reallocated: boolean;
  earnedVia: string | null;
  /** The linked Entry: named places from when earned, NOC-owned places from Selection. */
  entry: { id: string; who: { kind: "athlete" | "team"; id: string; name: string } } | null;
  source: string;
  checkedOn: string;
};

/** A Games' Quota places, by sport, event and number. */
export async function quotaPlacesOf(db: Db, competitionId: string): Promise<QuotaPlaceView[]> {
  const q = schema.quotaPlace;
  const rows = await db
    .select({ place: q, entry: schema.entry, athlete: schema.athlete.name, team: schema.team.name })
    .from(q)
    .leftJoin(schema.entry, eq(q.entryId, schema.entry.id))
    .leftJoin(schema.athlete, eq(schema.entry.athleteId, schema.athlete.id))
    .leftJoin(schema.team, eq(schema.entry.teamId, schema.team.id))
    .where(eq(q.competitionId, competitionId))
    .orderBy(asc(q.sport), asc(q.event), asc(q.number));
  const key = (p: { sport: string; event: string }) => `${p.sport.toLowerCase()}|${p.event.toLowerCase()}`;
  const counts = new Map<string, number>();
  for (const { place } of rows) counts.set(key(place), (counts.get(key(place)) ?? 0) + 1);
  return rows.map(({ place, entry, athlete, team }) => ({
    id: place.id,
    sport: place.sport,
    event: place.event,
    number: place.number,
    of: counts.get(key(place))!,
    kind: place.kind === "named" ? "named" : "noc",
    state: isQuotaPlaceState(place.state) ? place.state : "provisional",
    reallocated: place.reallocated,
    earnedVia: place.earnedVia,
    entry: entry
      ? {
          id: entry.id,
          who: entry.teamId ? { kind: "team" as const, id: entry.teamId, name: team ?? "" } : { kind: "athlete" as const, id: entry.athleteId!, name: athlete ?? "" },
        }
      : null,
    source: place.source,
    checkedOn: place.checkedOn,
  }));
}

export type NewQuotaPlaces = {
  competitionId: string;
  sport: string;
  event: string;
  kind: QuotaPlaceKind;
  /** How they start: held on today's list (Provisional), allocated, or reallocated (both Allocated). */
  how: "hold" | "allocate" | "reallocate";
  count: number;
  earnedVia: string | null;
  /** A named place's Entry, linked when earned. */
  entryId: string | null;
  source: string;
  checkedOn: string;
};

/** Records `count` new places in the event, numbered after the ones already there. */
export async function recordQuotaPlaces(db: Db, places: NewQuotaPlaces): Promise<void> {
  const move = quotaPlaceTransition(null, places.how);
  if (!move.ok) throw new Error(move.reason);
  const q = schema.quotaPlace;
  const [last] = await db
    .select({ number: max(q.number) })
    .from(q)
    .where(and(eq(q.competitionId, places.competitionId), sameEvent(places.sport, places.event)));
  const first = (last?.number ?? 0) + 1;
  await db.insert(q).values(
    Array.from({ length: places.count }, (_, i) => ({
      competitionId: places.competitionId,
      sport: places.sport,
      event: places.event,
      number: first + i,
      kind: places.kind,
      state: move.state,
      reallocated: places.how === "reallocate",
      earnedVia: places.earnedVia,
      entryId: places.entryId,
      source: places.source,
      checkedOn: places.checkedOn,
    })),
  );
  if (places.kind === "noc") await linkAtSelection(db, places.competitionId, places.sport, places.event);
}

function sameEvent(sport: string, event: string) {
  const q = schema.quotaPlace;
  return and(sql`lower(${q.sport}) = lower(${sport})`, sql`lower(${q.event}) = lower(${event})`);
}

/**
 * NOC-owned places follow Selection in their event (stories 81, 85): a place
 * still in play leaves an Entry that is no longer Selected, and each Selected
 * Entry without a place takes the next free one. So a place passing to a new
 * partnership leaves the old Team (Not selected) for the new one (Selected).
 * Entered, Declined and Lost places keep their link.
 */
export async function linkAtSelection(db: Db, competitionId: string, sport: string, event: string): Promise<void> {
  const q = schema.quotaPlace;
  const e = schema.entry;
  const [places, entries] = await Promise.all([
    db
      .select()
      .from(q)
      .where(and(eq(q.competitionId, competitionId), eq(q.kind, "noc"), sameEvent(sport, event)))
      .orderBy(asc(q.number)),
    db
      .select({ id: e.id, status: e.qualificationStatus })
      .from(e)
      .where(and(eq(e.competitionId, competitionId), sql`lower(${e.sport}) = lower(${sport})`, sql`lower(${e.event}) = lower(${event})`)),
  ]);
  const selected = new Set(entries.filter((x) => x.status === "selected").map((x) => x.id));
  const inPlay = places.filter((p) => !(isQuotaPlaceState(p.state) && quotaPlaceEnded(p.state)));
  const leaving = inPlay.filter((p) => p.entryId !== null && !selected.has(p.entryId)).map((p) => p.id);
  if (leaving.length > 0) await db.update(q).set({ entryId: null }).where(inArray(q.id, leaving));

  const holding = new Set(places.flatMap((p) => (p.entryId !== null && !leaving.includes(p.id) ? [p.entryId] : [])));
  const free = inPlay.filter((p) => p.entryId === null || leaving.includes(p.id));
  const waiting = [...selected].filter((id) => !holding.has(id));
  for (const [i, entryId] of waiting.entries()) {
    const place = free[i];
    if (!place) break;
    await db.update(q).set({ entryId }).where(eq(q.id, place.id));
  }
}
