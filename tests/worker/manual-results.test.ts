import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntrant, seedSource } from "../support/seed";
import { get, post } from "../support/worker";
import { labelled, stepRegion } from "../support/html";

// Spec #20, story 105; ticket #26: the Run sheet's Manual results step. One
// form per due manual result: a Belgian Athlete entered at a competition of a
// Manual source (PDF-only or login-only results) that has ended, with no
// result yet.
const NOW = "2026-11-14T12:00:00.000Z";
const MANUAL_RESULTS = "/curate/run/manual-results";

const page = async (path: string) => (await get(path)).text();
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function sessionLog(html: string) {
  const log = html.slice(html.indexOf("Session log"));
  return [...log.matchAll(/<li>(.*?)<\/li>/gs)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/<!-- -->/g, ""));
}

/** The forms of the step, one per due manual result, as text. */
function forms(html: string) {
  return labelled(stepRegion(html), /Manual result · [^"]+/, "form").map((f) => text(f.inner));
}

describe("Manual results step", () => {
  let lenaerts: string;
  let idre: string;

  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await db.delete(schema.source);
    await seedSource(env.DB, "ibu", { name: "IBU (data needs a login)", tier: "manual", cadenceDays: 7 });
    await seedSource(env.DB, "isu-speed-skating", { name: "ISU speed skating", lastSuccessAt: "2026-11-14T04:00:10.000Z" });
    lenaerts = await seedAthlete(env.DB, { name: "Thomas Lenaerts", sport: "Biathlon" });
    idre = await seedCompetition(env.DB, { name: "IBU Cup 1, Idre", sport: "Biathlon", source: "ibu", startDate: "2026-11-12", endDate: "2026-11-13", city: "Idre" });
    await seedEntrant(env.DB, idre, lenaerts);
  });

  it("shows one form per Belgian entered at an ended Manual-source competition", async () => {
    const vanhoutte = await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating" });
    // Not due: an Automatic source's competition, and a Manual one still to come.
    const heerenveen = await seedCompetition(env.DB, { name: "World Cup 2, Heerenveen", sport: "Speed skating", source: "isu-speed-skating", startDate: "2026-11-06", endDate: "2026-11-08" });
    await seedEntrant(env.DB, heerenveen, vanhoutte);
    const later = await seedCompetition(env.DB, { name: "IBU Cup 2, Sjusjoen", sport: "Biathlon", source: "ibu", startDate: "2026-11-27", endDate: "2026-11-29" });
    await seedEntrant(env.DB, later, lenaerts);

    const html = await page(MANUAL_RESULTS);

    expect(forms(html)).toHaveLength(1);
    const [form] = forms(html);
    expect(form).toContain("Thomas Lenaerts");
    expect(form).toContain("IBU Cup 1, Idre");
    expect(form).toContain("12 Nov–13 Nov 2026");
    expect(form).toContain("IBU (data needs a login)");
    expect(form).toContain("Save result");
    expect(form).toContain("Did not compete");
    expect(html).toContain("1 open");
  });

  it("saves a result with its source URL; it shows on the Athlete page and the form goes", async () => {
    const res = await post(MANUAL_RESULTS, {
      intent: "save-result",
      competition: idre,
      athlete: lenaerts,
      event: "Men 10 km sprint",
      place: "17",
      performance: "25:41.3",
      status: "finished",
      sourceUrl: "https://www.ibu.example/results/idre-sprint.pdf",
    });

    expect(res.status).toBe(303);
    const athletePage = text(await page(`/athletes/${lenaerts}`));
    expect(athletePage).toMatch(/13 Nov 2026 IBU Cup 1, Idre Men 10 km sprint 17th 25:41.3/);
    expect(athletePage).toContain("Athlete since 2026 (IBU Cup 1, Idre)");
    const html = await page(MANUAL_RESULTS);
    expect(forms(html)).toEqual([]);
    expect(html).toContain("Nothing left in this step.");
    expect(sessionLog(html)).toEqual(["13:00 · Thomas Lenaerts: result saved for IBU Cup 1, Idre"]);

    // The source URL is kept with the raw copy of what was typed, which the result points at.
    const db = getDb(env.DB);
    const [row] = await db.select().from(schema.result).where(eq(schema.result.athleteId, lenaerts));
    const raw = await db.query.rawCopy.findFirst({ where: eq(schema.rawCopy.id, row.rawCopyId) });
    expect(raw?.url).toBe("https://www.ibu.example/results/idre-sprint.pdf");
    const kept = await env.RAW.get(raw!.r2Key);
    expect(await kept?.json()).toMatchObject({ event: "Men 10 km sprint", place: "17", performance: "25:41.3", status: "finished" });
  });

  it("saving again corrects the same result instead of adding one", async () => {
    const form = { intent: "save-result", competition: idre, athlete: lenaerts, event: "Men 10 km sprint", place: "17", performance: "25:41.3", status: "finished", sourceUrl: "https://www.ibu.example/r.pdf" };
    await post(MANUAL_RESULTS, form);
    await post(MANUAL_RESULTS, { ...form, place: "16" });

    const rows = await getDb(env.DB).select().from(schema.result).where(eq(schema.result.athleteId, lenaerts));
    expect(rows.map((r) => r.place)).toEqual([16]);
  });

  it.each([
    { status: "DNF", shown: "DNF" },
    { status: "DSQ", shown: "DSQ" },
    { status: "DNS", shown: "DNS" },
  ])("records $status without a place or performance", async ({ status, shown }) => {
    await post(MANUAL_RESULTS, { intent: "save-result", competition: idre, athlete: lenaerts, event: "Men 10 km sprint", place: "", performance: "", status, sourceUrl: "https://www.ibu.example/r.pdf" });

    const athletePage = text(await page(`/athletes/${lenaerts}`));
    expect(athletePage).toMatch(new RegExp(`IBU Cup 1, Idre Men 10 km sprint ${shown}`));
    expect(forms(await page(MANUAL_RESULTS))).toEqual([]);
  });

  it("a DNS is not a performance: it does not make anyone an Athlete since then", async () => {
    await post(MANUAL_RESULTS, { intent: "save-result", competition: idre, athlete: lenaerts, event: "Men 10 km sprint", status: "DNS", sourceUrl: "https://www.ibu.example/r.pdf" });

    expect(await page(`/athletes/${lenaerts}`)).not.toContain("Athlete since");
  });

  it("'did not compete' records no result and takes the Athlete off the entry list", async () => {
    const res = await post(MANUAL_RESULTS, { intent: "did-not-compete", competition: idre, athlete: lenaerts });

    expect(res.status).toBe(303);
    expect(await page(`/athletes/${lenaerts}`)).toContain("No results yet.");
    const html = await page(MANUAL_RESULTS);
    expect(forms(html)).toEqual([]);
    expect(sessionLog(html)).toEqual(["13:00 · Thomas Lenaerts: did not compete at IBU Cup 1, Idre"]);
  });

  it.each([
    { name: "no source URL", patch: { sourceUrl: "" } },
    { name: "a source URL that is not a web address", patch: { sourceUrl: "results.pdf" } },
    { name: "no event", patch: { event: "" } },
    { name: "a place that is not a whole number", patch: { place: "3rd" } },
    { name: "a finish with neither place nor performance", patch: { place: "", performance: "" } },
  ])("refuses $name and saves nothing", async ({ patch }) => {
    const res = await post(MANUAL_RESULTS, {
      intent: "save-result",
      competition: idre,
      athlete: lenaerts,
      event: "Men 10 km sprint",
      place: "17",
      performance: "25:41.3",
      status: "finished",
      sourceUrl: "https://www.ibu.example/r.pdf",
      ...patch,
    });

    expect(res.status).toBe(400);
    expect(forms(await page(MANUAL_RESULTS))).toHaveLength(1);
  });
});
