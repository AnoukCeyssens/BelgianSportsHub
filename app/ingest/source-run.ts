// One run of one Automatic source (spec #20, Ingest): the queue consumer calls
// runSource() for each `fetch-source` job, and the daily cron queues those
// jobs with queueDueSources(). The run hands the adapter a fetch that keeps
// raw copies and a row writer, then writes the source's health row.
import { eq } from "drizzle-orm";
import { now as clockNow } from "~/clock";
import { getDb, schema } from "~/db/client";
import { sourceHealth, type SourceTier } from "~/domain";
import { belgianRows } from "./belgian-rows";
import type { IngestJob } from "./queue";
import { fetchAndKeep, fetchStreamAndKeep } from "./raw-copy";
import { SourceBlocked } from "./source-adapter";
import { SOURCE_ADAPTERS } from "./sources";

export async function runSource(env: Pick<Env, "DB" | "RAW">, key: string): Promise<void> {
  const db = getDb(env.DB);
  const source = await db.query.source.findFirst({ where: eq(schema.source.key, key) });
  if (!source) throw new Error(`No Source row "${key}"`);
  const adapter = SOURCE_ADAPTERS[key];
  if (!adapter) throw new Error(`No adapter registered for Source "${key}"`);

  const startedAt = clockNow();
  const stamp = startedAt.toISOString();
  const health = (set: Partial<typeof schema.source.$inferInsert>) =>
    db.update(schema.source).set(set).where(eq(schema.source.key, key));
  await health({ lastAttemptAt: stamp });

  const rows = belgianRows(env, adapter.writesAs ?? key, startedAt);
  try {
    await adapter.run({
      now: startedAt,
      since: source.lastSuccessAt ? new Date(source.lastSuccessAt) : null,
      fetch: (url, init) => fetchAndKeep(env, key, url, init),
      fetchStream: (url) => fetchStreamAndKeep(env, key, url),
      secret: (name) => {
        const value = (env as unknown as Record<string, unknown>)[name];
        return typeof value === "string" && value !== "" ? value : undefined;
      },
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SourceBlocked) {
      // Not retried: asking again would not be polite. The owner retries or keeps it on Assisted.
      await health({ lastFailureAt: stamp, lastError: message, blockedAt: stamp, blockedReason: message });
      return;
    }
    await health({ lastFailureAt: stamp, lastError: message });
    throw error;
  }
  await health({
    lastSuccessAt: stamp,
    lastError: null,
    ...(rows.changes() > 0 ? { lastChangeAt: stamp } : {}),
  });
}

/** The daily cron: one `fetch-source` job per Automatic source whose cadence is due. Returns the queued keys. */
export async function queueDueSources(env: Pick<Env, "DB" | "INGEST">, now: Date): Promise<string[]> {
  const sources = await getDb(env.DB).select().from(schema.source);
  const due = sources
    .filter((s) => sourceHealth({ ...s, tier: s.tier as SourceTier }, now).due)
    .map((s) => s.key)
    .sort();
  if (due.length > 0) {
    await env.INGEST.sendBatch(due.map((source) => ({ body: { kind: "fetch-source", source } satisfies IngestJob })));
  }
  return due;
}
