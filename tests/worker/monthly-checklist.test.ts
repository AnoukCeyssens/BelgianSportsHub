import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { seedChecklistItem } from "../support/seed";
import { get, post } from "../support/worker";

// Spec #20, story 111; ticket #45: the Run sheet's last step shows only the
// checks due this week, ticked one by one or all at once, with a count of the
// ones not due yet. Ticking schedules the next due date; the owner can add checks.
const STEP = "/curate/run/monthly-checklist";
const SATURDAY = "2026-11-14T12:00:00.000Z";

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** The step's content between its heading and its Back / Next footer, as text. */
async function step() {
  const html = await (await get(STEP)).text();
  return text(html.slice(html.indexOf("8. Monthly checklist"), html.indexOf('class="foot"')));
}

async function railEntry() {
  const html = await (await get(STEP)).text();
  return text(html.slice(html.indexOf('aria-label="Run sheet steps"'), html.indexOf("</nav>"))).match(/Monthly checklist [^·]*· \d+ open/)?.[0];
}

async function sessionLog() {
  const html = await (await get(STEP)).text();
  return [...html.slice(html.indexOf("Session log")).matchAll(/<li>(.*?)<\/li>/gs)].map((m) => text(m[1]).trim());
}

async function clearChecklist() {
  const db = getDb(env.DB);
  await db.delete(schema.checklistItem);
  await db.delete(schema.runSheetLog);
  await db.delete(schema.runSheetSession);
}

describe("Monthly checklist step", () => {
  describe("seeded checks", () => {
    it("shows the checks due this week by topic, with a count of the rest", async () => {
      fixClock(SATURDAY);

      const content = await step();

      expect(content).toContain("2030 IF qualification systems");
      expect(content).toContain("FIS: freeride (new for 2030)");
      expect(content).toContain("ISMF: ski mountaineering");
      expect(content).toContain("BOIC general selection regulation for LA28");
      expect(content).toContain("Calendar refresh");
      expect(content).not.toContain("Belgian federation selection criteria");
      expect(content).not.toContain("Entry deadlines");
      expect(content).toContain("18 other checks are not due this week.");
      expect(await railEntry()).toBe("Monthly checklist ~15 min · 3 open");
    });

    it("brings the federations' selection criteria and the LA28 and 2030 entry deadlines due later", async () => {
      fixClock("2026-11-28T12:00:00.000Z");

      const content = await step();

      expect(content).toContain("Belgian federation selection criteria");
      expect(content).toContain("Athletics");
      expect(content).toContain("Alpine skiing, Cross-country skiing, Ski jumping, Freestyle skiing, Snowboard, Freeride");
      expect(content).toContain("Cycling road, Cycling track, Cycling mountain bike, Cycling BMX racing, Cycling BMX freestyle");
      expect(content).toContain("LA28 sport entries deadline");
      expect(content).toContain("French Alps 2030 sport entries deadline");
    });
  });

  describe("ticking", () => {
    it("ticking a check with no change puts it away until a month after the tick", async () => {
      await clearChecklist();
      fixClock(SATURDAY);
      const fis = await seedChecklistItem(env.DB, { topic: "2030 IF qualification systems", name: "FIS", dueOn: "2026-11-14" });
      await seedChecklistItem(env.DB, { topic: "2030 IF qualification systems", name: "ISU", dueOn: "2026-11-14" });

      const res = await post(STEP, { intent: "no-change", item: fis });

      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(STEP);
      expect(await step()).not.toMatch(/\bFIS\b/);
      expect(await step()).toContain("ISU");
      expect(await step()).toContain("1 other check is not due this week.");
      expect(await sessionLog()).toEqual(["13:00 · FIS: checked, no change"]);
      fixClock("2026-12-07T12:00:00.000Z");
      expect(await step()).not.toMatch(/\bFIS\b/);
      fixClock("2026-12-08T12:00:00.000Z");
      expect(await step()).toMatch(/\bFIS\b/);
      expect(await step()).toContain("Last checked 14 Nov");
    });

    it("ticking a check as changed logs what changed", async () => {
      await clearChecklist();
      fixClock(SATURDAY);
      const boic = await seedChecklistItem(env.DB, { topic: "BOIC selection regulation", name: "BOIC LA28 regulation", dueOn: "2026-11-10" });

      await post(STEP, { intent: "changed", item: boic, note: "Published on teambelgium.be" });

      expect(await step()).toContain("Nothing left in this step.");
      expect(await sessionLog()).toEqual(["13:00 · BOIC LA28 regulation: changed: Published on teambelgium.be"]);
      fixClock("2026-12-10T12:00:00.000Z");
      expect(await step()).toContain("Last checked 14 Nov: Published on teambelgium.be");
    });

    it("ticks every due check of a topic at once", async () => {
      await clearChecklist();
      fixClock(SATURDAY);
      for (const name of ["FIS", "ISU", "IBU"]) await seedChecklistItem(env.DB, { topic: "2030 IF qualification systems", name, dueOn: "2026-11-14" });
      await seedChecklistItem(env.DB, { topic: "2030 IF qualification systems", name: "WCF", dueOn: "2026-12-20" });
      await seedChecklistItem(env.DB, { topic: "Calendar refresh", name: "Next six months", dueOn: "2026-11-14" });

      await post(STEP, { intent: "all-no-change", topic: "2030 IF qualification systems" });

      const content = await step();
      expect(content).not.toContain("2030 IF qualification systems");
      expect(content).toContain("Calendar refresh");
      expect(content).toContain("4 other checks are not due this week.");
      expect(await sessionLog()).toEqual(["13:00 · 2030 IF qualification systems: all 3 checked, no change"]);
    });
  });

  it("the owner can add a check", async () => {
    await clearChecklist();
    fixClock(SATURDAY);

    await post(STEP, {
      intent: "add",
      topic: "Belgian federation selection criteria",
      name: "Breaking",
      url: "https://example.test/breaking",
      everyMonths: "2",
      dueOn: "2026-11-15",
    });

    const content = await step();
    expect(content).toContain("Belgian federation selection criteria");
    expect(content).toContain("Breaking");
    expect(await sessionLog()).toEqual(["13:00 · Added check Breaking (due 15 Nov)"]);

    const id = (await getDb(env.DB).select().from(schema.checklistItem))[0].id;
    await post(STEP, { intent: "no-change", item: id });
    // Every two months: due again on 14 Jan.
    fixClock("2027-01-07T12:00:00.000Z");
    expect(await step()).not.toContain("Breaking");
    fixClock("2027-01-08T12:00:00.000Z");
    expect(await step()).toContain("Breaking");
  });
});
