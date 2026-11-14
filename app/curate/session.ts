// The Run sheet's session and its log (spec #20, story 102). A session opens
// with the owner's first action and stays open until they finish it on the
// last step. Every action is logged; a "pass" entry marks a step the owner
// moved on from with items left (✓ in the rail).
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { type Db, schema } from "~/db/client";

export type Sheet = "weekly" | "live";

export type SessionView = {
  passed: Set<string>;
  /** Newest first. */
  log: { at: string; step: string; message: string }[];
};

async function openSession(db: Db, sheet: Sheet) {
  return db.query.runSheetSession.findFirst({
    where: and(eq(schema.runSheetSession.sheet, sheet), isNull(schema.runSheetSession.finishedAt)),
    orderBy: desc(schema.runSheetSession.startedAt),
  });
}

/** The open session's passed steps and log; empty when no session is open. */
export async function currentSession(db: Db, sheet: Sheet): Promise<SessionView> {
  const session = await openSession(db, sheet);
  if (!session) return { passed: new Set(), log: [] };
  const entries = await db
    .select()
    .from(schema.runSheetLog)
    .where(eq(schema.runSheetLog.sessionId, session.id))
    .orderBy(desc(schema.runSheetLog.at), desc(sql`rowid`));
  return {
    passed: new Set(entries.filter((e) => e.action === "pass").map((e) => e.step)),
    log: entries.map(({ at, step, message }) => ({ at, step, message })),
  };
}

/** Adds an entry to the open session's log, opening a session if there is none. */
export async function logAction(db: Db, sheet: Sheet, entry: { step: string; action: string; message: string }, at: Date) {
  const sessionId = (await openSession(db, sheet))?.id ?? (await startSession(db, sheet, at));
  await db.insert(schema.runSheetLog).values({ sessionId, at: at.toISOString(), ...entry });
}

/** Closes the open session; the next visit starts a new one. */
export async function finishSession(db: Db, sheet: Sheet, at: Date) {
  await db
    .update(schema.runSheetSession)
    .set({ finishedAt: at.toISOString() })
    .where(and(eq(schema.runSheetSession.sheet, sheet), isNull(schema.runSheetSession.finishedAt)));
}

async function startSession(db: Db, sheet: Sheet, at: Date) {
  const [row] = await db
    .insert(schema.runSheetSession)
    .values({ sheet, startedAt: at.toISOString() })
    .returning({ id: schema.runSheetSession.id });
  return row.id;
}
