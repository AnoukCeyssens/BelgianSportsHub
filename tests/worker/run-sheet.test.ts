import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "~/db/client";
import { ISU_WORLD_CUP_1_RUN, isuWorldCup1Run } from "../fixtures/sources/isu-speed-skating";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedMergeQueueItem, seedSource, setSource } from "../support/seed";
import { get, getDeployed, OWNER_EMAIL, post, signedInAs } from "../support/worker";

// Spec #20, stories 98–103 and 106; ticket #24: the weekly Run sheet shell,
// with its Source health and Merge queue steps.
const NOW = "2026-11-14T12:00:00.000Z";
const SOURCE_HEALTH = "/curate/run/source-health";
const MERGE_QUEUE = "/curate/run/merge-queue";

const page = async (path: string) => (await get(path)).text();

/** The rail entry of one step, as text without tags. */
function railStep(html: string, label: string) {
  const rail = html.slice(html.indexOf('aria-label="Run sheet steps"'), html.indexOf("</nav>"));
  const li = rail.match(new RegExp(`<li[^>]*>(?:(?!</li>).)*?${label}(?:(?!</li>).)*</li>`, "s"))?.[0] ?? "";
  return { done: /class="[^"]*\bdone\b/.test(li), text: li.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
}

function sessionLog(html: string) {
  const log = html.slice(html.indexOf("Session log"));
  return [...log.matchAll(/<li>(.*?)<\/li>/gs)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/<!-- -->/g, ""));
}

function timeLeft(html: string) {
  return html.match(/Estimated time left.*?<b[^>]*>(.*?)<\/b>/s)?.[1].replace(/<!-- -->/g, "");
}

describe("Run sheet", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await db.delete(schema.source);
    await db.delete(schema.checklistItem);
    // Healthy: fetched at this morning's cron.
    await seedSource(env.DB, "isu-speed-skating", { name: "ISU speed skating", lastSuccessAt: "2026-11-14T04:00:10.000Z" });
  });

  async function addProblemSources() {
    await seedSource(env.DB, "uci", {
      name: "UCI",
      lastSuccessAt: "2026-11-08T04:00:00.000Z",
      lastFailureAt: "2026-11-09T04:00:00.000Z",
      lastError: "HTTP 403 from Workers",
      blockedAt: "2026-11-09T04:00:00.000Z",
      blockedReason: "HTTP 403 from Workers",
    });
    await seedSource(env.DB, "fie", {
      name: "FIE",
      lastSuccessAt: "2026-11-13T04:00:00.000Z",
      lastFailureAt: "2026-11-14T04:00:00.000Z",
      lastError: "HTTP 500",
    });
  }

  it("opens on the first step, Source health", async () => {
    const res = await get("/curate");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SOURCE_HEALTH);
  });

  it("shows eight numbered steps with estimates and open counts; empty steps are ticked", async () => {
    await addProblemSources();
    await seedMergeQueueItem(env.DB, { name: "Indra Medard", sport: "Speed skating", scheme: "isu", value: "2049" });

    const html = await page(SOURCE_HEALTH);

    expect(railStep(html, "Source health")).toEqual({ done: false, text: "1 Source health ~5 min · 2 open" });
    expect(railStep(html, "Paste imports")).toEqual({ done: true, text: "✓ Paste imports 0.5–1.25 h · 0 open" });
    expect(railStep(html, "Merge queue")).toEqual({ done: false, text: "4 Merge queue ~10 min · 1 open" });
    expect(railStep(html, "Monthly checklist")).toEqual({ done: true, text: "✓ Monthly checklist ~15 min · 0 open" });
    expect(html).toContain("6 of 8 steps done");
    // 2 sources × 2 min + 1 identity × 3 min.
    expect(timeLeft(html)).toBe("7 min");
    expect(sessionLog(html)).toEqual([]);
  });

  it("shows the step's purpose, its items, and offers to leave what remains for next week", async () => {
    await addProblemSources();

    const html = await page(SOURCE_HEALTH);

    expect(html).toContain("1. Source health");
    expect(html).toContain("Automatic sources first, so you know which data to distrust today.");
    expect(html).toContain("Leave 2 for next week, continue →");
  });

  it("offers a plain Next on an empty step, and Back to the step before", async () => {
    const html = await page("/curate/run/paste-imports");

    expect(html).toContain("2. Paste imports");
    expect(html).toContain("Nothing left in this step.");
    expect(html).toContain("Next step →");
    expect(html).toMatch(/href="\/curate\/run\/source-health"[^>]*>← Back/);
  });

  it("leaving items for next week moves on, ticks the step and logs it", async () => {
    await addProblemSources();

    const res = await post(SOURCE_HEALTH, { intent: "next" });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/curate/run/paste-imports");
    const html = await page("/curate/run/paste-imports");
    expect(railStep(html, "Source health").done).toBe(true);
    expect(html).toContain("8 of 8 steps done");
    // The items are still open, so they still count toward time left.
    expect(timeLeft(html)).toBe("4 min");
    expect(sessionLog(html)).toEqual(["13:00 · Source health: left 2 for next week"]);
  });

  it("finishes the session on the last step; the next session starts with an empty log", async () => {
    await addProblemSources();
    await post(SOURCE_HEALTH, { intent: "next" });

    const res = await post("/curate/run/monthly-checklist", { intent: "next" });

    expect(res.headers.get("location")).toBe(SOURCE_HEALTH);
    const html = await page(SOURCE_HEALTH);
    expect(railStep(html, "Source health").done).toBe(false);
    expect(sessionLog(html)).toEqual([]);
  });

  describe("Source health step", () => {
    it("shows every source in the table, with an action card per problem source", async () => {
      await addProblemSources();

      const html = await page(SOURCE_HEALTH);

      const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
      expect(table).toMatch(/ISU speed skating.*?Automatic.*?ok/s);
      expect(table).toMatch(/UCI.*?Assisted.*?blocked/s);
      expect(table).toMatch(/FIE.*?Automatic.*?failing/s);
      const cards = html.slice(html.indexOf("</table>"));
      expect(cards).toContain("UCI is blocked");
      expect(cards).toContain("FIE is failing");
      expect(cards).not.toContain("ISU speed skating is");
      expect(cards).toContain("Keep on Assisted until fixed");
      expect(cards).toContain("Acknowledge, keep watching");
    });

    it("acknowledging a failing source puts its card away until it fails again", async () => {
      await addProblemSources();

      await post(SOURCE_HEALTH, { intent: "acknowledge", source: "fie" });

      let html = await page(SOURCE_HEALTH);
      expect(html).not.toContain("FIE is failing");
      expect(railStep(html, "Source health").text).toContain("1 open");
      expect(sessionLog(html)).toEqual(["13:00 · FIE: acknowledged, keep watching"]);

      await setSource(env.DB, "fie", { lastFailureAt: "2026-11-15T04:00:00.000Z" });
      fixClock("2026-11-15T09:00:00.000Z");
      html = await page(SOURCE_HEALTH);
      expect(html).toContain("FIE is failing");
    });

    it("keeps a blocked source on Assisted: the card goes, the source stays blocked", async () => {
      await addProblemSources();

      await post(SOURCE_HEALTH, { intent: "keep-assisted", source: "uci" });

      const html = await page(SOURCE_HEALTH);
      expect(html).not.toContain("UCI is blocked");
      expect(html.slice(html.indexOf("<table"), html.indexOf("</table>"))).toMatch(/UCI.*?Assisted.*?blocked/s);
      expect(sessionLog(html)).toEqual(["13:00 · UCI: kept on Assisted until fixed"]);
    });

    it("retrying a blocked source clears the block and runs it again", async () => {
      await setSource(env.DB, "isu-speed-skating", {
        lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt,
        lastError: "HTTP 403",
        blockedAt: "2026-11-13T04:00:00.000Z",
        blockedReason: "HTTP 403",
      });
      fixClock(ISU_WORLD_CUP_1_RUN.now);
      stubOutboundFetch(isuWorldCup1Run);
      expect(await page(SOURCE_HEALTH)).toContain("ISU speed skating is blocked");

      const res = await post(SOURCE_HEALTH, { intent: "retry", source: "isu-speed-skating" });

      expect(res.status).toBe(303);
      const html = await page(SOURCE_HEALTH);
      expect(html).not.toContain("ISU speed skating is blocked");
      expect(sessionLog(html)).toEqual(["13:00 · ISU speed skating: retried"]);
      // Through the real local queue, so wait for the consumer to finish.
      await vi.waitFor(
        async () => {
          const row = (await page(SOURCE_HEALTH)).match(/<tr><td>ISU speed skating.*?<\/tr>/s)?.[0] ?? "";
          expect(row).toContain("<td>Automatic</td>");
          expect(row).toContain("14 Nov 2026, 12:00 UTC");
          expect(row).toContain("<td>ok</td>");
        },
        { timeout: 15_000, interval: 200 },
      );
    }, 20_000);
  });

  describe("Merge queue step", () => {
    it("shows each incoming identity beside its candidate Athletes", async () => {
      await seedAthlete(env.DB, { name: "Indra Médard", sport: "Speed skating", dateOfBirth: "1998-10-04" });
      await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating" });
      await seedMergeQueueItem(env.DB, { name: "Indra MEDARD", sport: "Speed skating", dateOfBirth: "1998-10-04", scheme: "isu", value: "2049" });

      const html = await page(MERGE_QUEUE);

      expect(html).toContain("4. Merge queue");
      const card = html.slice(html.indexOf("Indra MEDARD"));
      expect(card).toContain("ISU 2049");
      expect(card).toContain("born 4 Oct 1998");
      expect(card).toContain("Indra Médard");
      expect(card).toContain("Same person: link");
      expect(card).not.toContain("Fran Vanhoutte");
      expect(card).toContain("Create new Athlete");
      expect(card).toContain("Not an Athlete");
    });

    it("links an identity to an Athlete, who gets its IF ID; the step logs it and empties", async () => {
      const medard = await seedAthlete(env.DB, { name: "Indra Médard", sport: "Speed skating", dateOfBirth: "1998-10-04" });
      const item = await seedMergeQueueItem(env.DB, { name: "Indra MEDARD", sport: "Speed skating", dateOfBirth: "1998-10-04", scheme: "isu", value: "2049" });

      const res = await post(MERGE_QUEUE, { intent: "link", item, athlete: medard });

      expect(res.status).toBe(303);
      expect(await page(`/athletes/${medard}`)).toContain("ISU 2049");
      const html = await page(MERGE_QUEUE);
      expect(html).toContain("Nothing left in this step.");
      expect(railStep(html, "Merge queue").done).toBe(true);
      expect(sessionLog(html)).toEqual(["13:00 · Indra MEDARD: linked to Indra Médard"]);
    });

    it("creates a new Athlete from an identity", async () => {
      const item = await seedMergeQueueItem(env.DB, { name: "Arne Mertens", sport: "Alpine skiing", scheme: "fis", value: "6532871" });

      await post(MERGE_QUEUE, { intent: "create", item });

      expect(await page("/athletes")).toContain("Arne Mertens");
      expect(sessionLog(await page(MERGE_QUEUE))).toEqual(["13:00 · Arne Mertens: created a new Athlete"]);
    });

    it("marks an identity not an Athlete", async () => {
      const item = await seedMergeQueueItem(env.DB, { name: "Junior Skater", sport: "Speed skating", scheme: "isu", value: "9999" });

      await post(MERGE_QUEUE, { intent: "not-an-athlete", item });

      const html = await page(MERGE_QUEUE);
      expect(html).not.toContain("ISU 9999");
      expect(await page("/athletes")).not.toContain("Junior Skater");
      expect(sessionLog(html)).toEqual(["13:00 · Junior Skater: not an Athlete"]);
    });
  });
});

describe("Curation is owner-only", () => {
  it.each(["/curate", SOURCE_HEALTH, MERGE_QUEUE, "/curate/roster-seed", `${MERGE_QUEUE}.data`])(
    "refuses %s to a reader from the small circle",
    async (path) => {
      const res = await get(path, signedInAs("friend@example.com"));
      expect(res.status).toBe(403);
    },
  );

  it("refuses a reader's curation action", async () => {
    const res = await post("/curate/roster-seed", {}, signedInAs("friend@example.com"));
    expect(res.status).toBe(403);
  });

  it("lets the owner in", async () => {
    const res = await get(SOURCE_HEALTH, signedInAs(OWNER_EMAIL.toUpperCase()));
    expect(res.status).toBe(200);
  });

  it("leaves reader pages open to the small circle", async () => {
    const res = await get("/athletes", signedInAs("friend@example.com"));
    expect(res.status).toBe(200);
  });

  it("refuses curation on a deployed copy when no Access identity came with the request", async () => {
    expect((await getDeployed(SOURCE_HEALTH)).status).toBe(403);
    expect((await getDeployed(SOURCE_HEALTH, signedInAs("owner@example.com"))).status).toBe(200);
  });
});
