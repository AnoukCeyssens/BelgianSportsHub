// Weekly full export of D1 to R2 (spec #20, Implementation Decision 7).
//
// D1 Time Travel (30 days, point-in-time) is the first way back; these
// exports reach further back, and the raw source copies are the last resort.
// Restore an export into an EMPTY database (see README, "Backups and restores").

/** Cron trigger of the weekly export (live copy only, see wrangler.jsonc). Monday 03:00 UTC. */
export const WEEKLY_BACKUP_CRON = "0 3 * * 1";

/** How many weekly exports are kept in R2; older ones are deleted. */
export const BACKUPS_KEPT = 12;

const PREFIX = "backups/";

/** Exports the database to `backups/<ISO instant>.sql` and keeps only the newest 12. */
export async function runWeeklyBackup(env: Pick<Env, "DB" | "RAW">, at: Date): Promise<string> {
  const key = `${PREFIX}${at.toISOString()}.sql`;
  await env.RAW.put(key, await exportDatabase(env.DB), {
    httpMetadata: { contentType: "application/sql; charset=utf-8" },
    customMetadata: { exportedAt: at.toISOString() },
  });
  await pruneBackups(env.RAW);
  return key;
}

async function pruneBackups(bucket: R2Bucket) {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: PREFIX, cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  // ISO instants sort chronologically as strings.
  const stale = keys.sort().slice(0, Math.max(0, keys.length - BACKUPS_KEPT));
  if (stale.length > 0) await bucket.delete(stale);
}

type SchemaObject = { type: string; name: string; sql: string };

/**
 * A full SQL dump of a D1 database: tables (with d1_migrations, so a restored
 * copy knows which migrations it has), their rows, then indexes, triggers and
 * views. One statement per line, so it runs with `wrangler d1 execute --file`
 * as well as with `D1Database.exec()`. All rows are read in one batch, which
 * D1 runs as a single transaction, so the export is consistent.
 */
export async function exportDatabase(db: D1Database): Promise<string> {
  const { results: objects } = await db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 4) <> '_cf_'
       ORDER BY rowid`,
    )
    .all<SchemaObject>();
  const tables = objects.filter((o) => o.type === "table");
  const others = objects.filter((o) => o.type !== "table");

  const reads = tables.map((t) => db.prepare(`SELECT * FROM ${quoteName(t.name)}`));
  const rowsPerTable = reads.length > 0 ? await db.batch<Record<string, unknown>>(reads) : [];

  const lines = ["PRAGMA defer_foreign_keys = TRUE;"];
  for (const t of tables) lines.push(`${oneLine(t.sql)};`);
  tables.forEach((t, i) => {
    for (const row of rowsPerTable[i].results) {
      const columns = Object.keys(row);
      lines.push(
        `INSERT INTO ${quoteName(t.name)} (${columns.map(quoteName).join(", ")}) VALUES (${columns.map((c) => sqlLiteral(row[c])).join(", ")});`,
      );
    }
  });
  for (const o of others) lines.push(`${oneLine(o.sql)};`);
  return `${lines.join("\n")}\n`;
}

function quoteName(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Schema SQL on one line (migrations write CREATE TABLE over several lines). */
function oneLine(sql: string) {
  return sql.replace(/\s*\r?\n\s*/g, " ");
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || Array.isArray(value)) {
    const bytes = Array.isArray(value)
      ? value
      : Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return `X'${bytes.map((b) => Number(b).toString(16).padStart(2, "0")).join("")}'`;
  }
  // Line breaks become char(10)/char(13) so every statement stays on one line.
  const parts = String(value).split(/(\r|\n)/);
  return parts
    .map((p) => (p === "\n" ? "char(10)" : p === "\r" ? "char(13)" : `'${p.replaceAll("'", "''")}'`))
    .filter((p, i, all) => !(p === "''" && all.length > 1))
    .join(" || ");
}
