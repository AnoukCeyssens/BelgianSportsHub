import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { getDb, schema } from "~/db/client";
import { ISU_WORLD_CUP_1_RUN, isuWorldCup1Run } from "../fixtures/sources/isu-speed-skating";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { setSource } from "../support/seed";
import { get, post, runScheduled } from "../support/worker";

// Spec #20, stories 89, 90 and 94: one daily cron queues one job per due
// Automatic source; cadence is data on the Source row. The cron string is the
// one in wrangler.jsonc (live copy).
const DAILY_INGEST_CRON = "0 4 * * *";

async function addSource(key: string, row: Partial<typeof schema.source.$inferInsert>) {
  await getDb(env.DB)
    .insert(schema.source)
    .values({ key, name: key, tier: "automatic", cadenceDays: 1, addedAt: "2026-11-01T00:00:00.000Z", ...row });
}

describe("daily ingest cron", () => {
  it("queues one job per Automatic source whose cadence is due, and none for blocked, Assisted or not-yet-due ones", async () => {
    await setSource(env.DB, "isu-speed-skating", { lastSuccessAt: "2026-11-13T04:01:00.000Z", blockedAt: null });
    await addSource("weekly-due", { cadenceDays: 7, lastSuccessAt: "2026-11-09T04:05:00.000Z" });
    await addSource("weekly-not-due", { cadenceDays: 7, lastSuccessAt: "2026-11-13T04:05:00.000Z" });
    await addSource("blocked", { blockedAt: "2026-11-12T04:00:00.000Z" });
    await addSource("pasted", { tier: "assisted" });

    const queued = await runScheduled(DAILY_INGEST_CRON, "2026-11-16T04:00:00.000Z");

    // Other Automatic sources from the migrations (never fetched here, so due) are queued too.
    const sources = queued.map((job) => job.kind === "fetch-source" && job.source);
    expect(sources).toContain("isu-speed-skating");
    expect(sources).toContain("weekly-due");
    expect(sources).not.toContain("weekly-not-due");
    expect(sources).not.toContain("blocked");
    expect(sources).not.toContain("pasted");
  });

  it("lets the owner fetch a source now, which clears a block and runs it", async () => {
    await setSource(env.DB, "isu-speed-skating", {
      lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt,
      blockedAt: "2026-11-13T04:00:00.000Z",
      blockedReason: "403",
    });
    fixClock(ISU_WORLD_CUP_1_RUN.now);
    stubOutboundFetch(isuWorldCup1Run);
    expect(await (await get("/curate/run/source-health")).text()).toContain("Fetch now");

    const res = await post("/curate/run/source-health", { intent: "retry", source: "isu-speed-skating" });

    expect(res.status).toBe(303);
    // Through the real local queue, so wait for the consumer to finish.
    await vi.waitFor(
      async () => {
        const page = await (await get("/curate/run/source-health")).text();
        // The ISU row: Automatic again, fetched just now, healthy.
        const row = page.match(/<tr><td>ISU speed skating.*?<\/tr>/s)?.[0] ?? "";
        expect(row).toContain("<td>Automatic</td>");
        expect(row).toContain("14 Nov 2026, 12:00 UTC");
        expect(row).toContain("<td>ok</td>");
      },
      { timeout: 15_000, interval: 200 },
    );
  }, 20_000);
});
