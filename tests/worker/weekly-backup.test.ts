import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { seedAthlete } from "../support/seed";
import { get, runScheduled } from "../support/worker";

// Spec #20, story 121 and Implementation Decision 7: a weekly full export of D1
// to R2, the last 12 kept. The cron string is the one in wrangler.jsonc (live).
const WEEKLY_BACKUP_CRON = "0 3 * * 1";

/** Empties the database completely, as a fresh D1 would be before a restore. */
async function dropAllTables() {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 4) <> '_cf_' ORDER BY rowid DESC",
  ).all<{ name: string }>();
  for (const { name } of results) await env.DB.prepare(`DROP TABLE "${name}"`).run();
}

async function backupKeys() {
  return (await env.RAW.list({ prefix: "backups/" })).objects.map((o) => o.key);
}

describe("weekly backup", () => {
  // Storage is shared by the tests in a file; start each one without backups.
  beforeEach(async () => {
    const keys = await backupKeys();
    if (keys.length > 0) await env.RAW.delete(keys);
  });

  it("exports the whole database to R2 as SQL that restores it into an empty database", async () => {
    const id = await seedAthlete(env.DB, {
      name: "Kimberley D'Hondt",
      sport: "Athletics",
      dateOfBirth: "1999-03-02",
      note: "First line.\nSecond line, with 'quotes'.",
      externalIds: [{ scheme: "world-athletics", value: "14512345" }],
    });

    await runScheduled(WEEKLY_BACKUP_CRON, "2026-11-16T03:00:00.000Z");

    expect(await backupKeys()).toEqual(["backups/2026-11-16T03:00:00.000Z.sql"]);
    const dump = await (await env.RAW.get("backups/2026-11-16T03:00:00.000Z.sql"))!.text();

    await dropAllTables();
    expect((await get(`/athletes/${id}`)).status).toBe(500);
    await env.DB.exec(dump);

    const html = await (await get(`/athletes/${id}`)).text();
    expect(html).toContain("<h1>Kimberley D&#x27;Hondt</h1>");
    expect(html).toContain("born 2 Mar 1999");
    expect(html).toContain("World Athletics 14512345");
    expect(html).toContain("First line.\nSecond line, with &#x27;quotes&#x27;.");
  });

  it("keeps the last 12 weekly exports", async () => {
    const mondays = Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(2026, 7, 31 + 7 * i, 3)).toISOString());
    // 13 consecutive Mondays from 31 Aug 2026 to 23 Nov 2026.
    expect(mondays.at(-1)).toBe("2026-11-23T03:00:00.000Z");

    for (const monday of mondays) await runScheduled(WEEKLY_BACKUP_CRON, monday);

    const keys = await backupKeys();
    expect(keys).toHaveLength(12);
    expect(keys).not.toContain("backups/2026-08-31T03:00:00.000Z.sql");
    expect(keys).toContain("backups/2026-09-07T03:00:00.000Z.sql");
    expect(keys).toContain("backups/2026-11-23T03:00:00.000Z.sql");
  });

  it("does not run on the daily ingest cron", async () => {
    await runScheduled("0 4 * * *", "2026-11-16T04:00:00.000Z");
    expect(await backupKeys()).toEqual([]);
  });
});
