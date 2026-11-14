// Storing a timetable version and its Sessions (spec #20, stories 61 and 63),
// shared by the Schedules step's paste (#37) and the automatic timetables of
// source runs (#39): a version row keeps the stamp, and the competition's
// Sessions are replaced by this version's rounds of events with a Belgian
// Entry. A coded Session (the Games) holds its rows' rounds; otherwise each
// row is its own Session.
import { desc, eq, inArray, sql } from "drizzle-orm";
import { type Db, schema } from "~/db/client";
import { belgianRounds, type TimetableRound } from "~/domain";

/** Latest stored version first (the insertion order breaks a tie within one instant). */
export const LATEST_FIRST = [desc(schema.timetableVersion.storedAt), desc(sql`timetable_version.rowid`)];

/** The competition's timetable versions, latest first. */
export function versionsOf(db: Db, competitionId: string) {
  return db.select().from(schema.timetableVersion).where(eq(schema.timetableVersion.competitionId, competitionId)).orderBy(...LATEST_FIRST);
}

/** SHA-256 (hex) of a timetable's text: the same timetable read twice has the same fingerprint. */
export async function fingerprintOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type VersionStamp = {
  competitionId: string;
  version: string;
  publishedOn: string | null;
  sourceUrl: string | null;
  columnMapping: Record<string, string> | null;
  rawCopyId: string;
  fingerprint: string;
  storedAt: Date;
};

/** Adds a version row; returns its id. */
export async function addVersion(db: Db, stamp: VersionStamp): Promise<string> {
  const [row] = await db
    .insert(schema.timetableVersion)
    .values({ ...stamp, storedAt: stamp.storedAt.toISOString() })
    .returning({ id: schema.timetableVersion.id });
  return row.id;
}

type SessionRows = { code: string | null; sport: string; date: string; startsAt: string | null; endsAt: string | null; rounds: { event: string; round: string }[] }[];

/** This timetable's Sessions with a round of an event with a Belgian Entry of the competition. */
async function belgianSessions(db: Db, competitionId: string, rounds: readonly TimetableRound[]): Promise<SessionRows> {
  const entries = await db.select({ sport: schema.entry.sport, event: schema.entry.event }).from(schema.entry).where(eq(schema.entry.competitionId, competitionId));
  const grouped = new Map<string, TimetableRound[]>();
  for (const r of belgianRounds(rounds, entries)) {
    const key = r.session ? `code:${r.sport}:${r.session}` : `row:${r.index}`;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  return [...grouped.values()].map((list) => {
    const first = list[0];
    return {
      code: first.session,
      sport: first.sport,
      date: first.date,
      startsAt: first.start ? `${first.date}T${first.start}` : null,
      endsAt: first.end ? `${first.date}T${first.end}` : null,
      rounds: list.map((r) => ({ event: r.event, round: r.round })),
    };
  });
}

/**
 * Replaces the competition's Sessions with this version's Belgian ones.
 * Returns how many there are, and whether anything differs from before.
 */
export async function replaceSessions(
  db: Db,
  competitionId: string,
  versionId: string,
  rounds: readonly TimetableRound[],
  venueZone: string,
): Promise<{ sessions: number; changed: boolean }> {
  const sessions = await belgianSessions(db, competitionId, rounds);
  const before = await storedSessions(db, competitionId);
  const after = sessions.map((s) => sessionKey({ ...s, versionId, venueZone }));
  const changed = before.length !== after.length || [...before].sort().join("\n") !== [...after].sort().join("\n");
  if (!changed) return { sessions: sessions.length, changed };

  await db.delete(schema.session).where(eq(schema.session.competitionId, competitionId));
  for (const s of sessions) {
    const [row] = await db
      .insert(schema.session)
      .values({ competitionId, timetableVersionId: versionId, code: s.code, sport: s.sport, date: s.date, startsAt: s.startsAt, endsAt: s.endsAt, venueZone })
      .returning({ id: schema.session.id });
    await db.insert(schema.sessionRound).values(s.rounds.map((r, position) => ({ sessionId: row.id, event: r.event, round: r.round, position })));
  }
  return { sessions: sessions.length, changed };
}

async function storedSessions(db: Db, competitionId: string): Promise<string[]> {
  const sessions = await db.select().from(schema.session).where(eq(schema.session.competitionId, competitionId));
  if (sessions.length === 0) return [];
  const rounds = await db
    .select()
    .from(schema.sessionRound)
    .where(inArray(schema.sessionRound.sessionId, sessions.map((s) => s.id)))
    .orderBy(schema.sessionRound.position);
  return sessions.map((s) =>
    sessionKey({ ...s, versionId: s.timetableVersionId, rounds: rounds.filter((r) => r.sessionId === s.id).map((r) => ({ event: r.event, round: r.round })) }),
  );
}

function sessionKey(s: SessionRows[number] & { versionId: string; venueZone: string }): string {
  return JSON.stringify([s.versionId, s.code, s.sport, s.date, s.startsAt, s.endsAt, s.venueZone, s.rounds.map((r) => [r.event, r.round])]);
}
