import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, seedSource, seedTeamResult } from "../support/seed";
import { get, post } from "../support/worker";
import { labelled, region } from "../support/html";

// Spec #20, story 119 and "Reference backfill"; ticket #46. Readers open
// Paris 2024 and Milano-Cortina 2026 as read-only reference pages: Belgian
// results per sport, linked to their Athletes (inactive ones included). The
// owner loads them by hand (e.g. read on Olympedia, never crawled) or through
// the paste importer. They are history only: no Phases, so no qualification
// and no Expectations.
const NOW = "2026-11-14T12:00:00.000Z";
const PARIS = "/reference/paris-2024";
const ENTER_PARIS = "/curate/reference/paris-2024";
const PASTE = "/curate/run/paste-imports";

/** POST a form whose fields may repeat (ticked rows). */
const postForm = (path: string, fields: [string, string][]) => get(path, { method: "POST", body: new URLSearchParams(fields) });

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const page = async (path: string) => (await get(path)).text();

/** The reference page's sports, each with its result lines as text. */
function sports(html: string) {
  return labelled(region(html, "Results by sport") ?? "", /[^"]+/, "section").map((s) => ({
    sport: s.label!,
    results: [...s.inner.matchAll(/<tr>(.*?)<\/tr>/gs)].map((r) => text(r[1])),
  }));
}

type HandResult = { athlete: string; sport: string; event: string; place: string; status?: string; performance?: string; date: string };

const enterByHand = (r: HandResult, path = ENTER_PARIS) =>
  post(path, { status: "finished", performance: "", sourceUrl: "https://www.olympedia.org/results/9000001", ...r });

describe("Reference Games", () => {
  let thiam: string;
  let nys: string;

  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
    thiam = await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics" });
    // Last competed at Paris 2024, more than 12 months ago: inactive, but still linked.
    nys = await seedAthlete(env.DB, { name: "Lotte Nys", sport: "Rowing" });
  });

  it("shows a Games with no results yet as an empty reference page", async () => {
    const res = await get(PARIS);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(text(html)).toContain("Paris 2024");
    expect(text(html)).toContain("No Belgian results recorded yet.");
    expect(region(html, "Phases")).toBeNull();
  });

  it("shows the Belgian results entered by hand, per sport, linked to their Athletes", async () => {
    expect((await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "1", performance: "6880", date: "2024-08-09" })).status).toBe(303);
    await enterByHand({ athlete: nys, sport: "Rowing", event: "Single Sculls Women", place: "", status: "eliminated", date: "2024-07-31" });

    const html = await page(PARIS);

    expect(sports(html)).toEqual([
      { sport: "Athletics", results: ["9 Aug Heptathlon Women Nafissatou Thiam 1st 6880"] },
      { sport: "Rowing", results: ["31 Jul Single Sculls Women Lotte Nys eliminated"] },
    ]);
    expect(html).toContain(`href="/athletes/${thiam}"`);
    expect(html).toContain(`href="/athletes/${nys}"`);
    // History only: no Phase bar, so no qualification, Selection or Expectations.
    expect(region(html, "Phases")).toBeNull();
    expect(text(html)).not.toMatch(/Expectation|Qualification/);
  });

  it("keeps what the owner typed, with the page they read it on", async () => {
    await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "1", date: "2024-08-09" });

    const db = getDb(env.DB);
    const [row] = await db.select().from(schema.result).innerJoin(schema.rawCopy, eq(schema.result.rawCopyId, schema.rawCopy.id));
    expect(row.raw_copy.url).toBe("https://www.olympedia.org/results/9000001");
    const typed = JSON.parse((await (await env.RAW.get(row.raw_copy.r2Key))!.text()));
    expect(typed).toMatchObject({ games: "paris-2024", event: "Heptathlon Women", place: "1" });
  });

  it("corrects a result entered twice instead of duplicating it", async () => {
    await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "2", date: "2024-08-09" });
    await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "1", date: "2024-08-09" });

    expect(sports(await page(PARIS))[0].results).toEqual(["9 Aug Heptathlon Women Nafissatou Thiam 1st"]);
  });

  it("refuses a result outside the Games' days", async () => {
    const res = await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "1", date: "2024-09-01" });
    expect(res.status).toBe(400);
  });

  it("lists the reference result in the Athlete's history", async () => {
    await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "1", date: "2024-08-09" });

    const athlete = text(await page(`/athletes/${thiam}`));
    expect(athlete).toContain("Paris 2024 Heptathlon Women 1st");
    expect(athlete).toContain("Athlete since 2024 (Paris 2024)");
  });

  it("takes results through the paste importer, filed under the reference Games", async () => {
    await seedSource(env.DB, "ijf", { name: "IJF judo", tier: "assisted", cadenceDays: 7, sport: "Judo" });
    const casse = await seedAthlete(env.DB, { name: "Matthias Casse", sport: "Judo", externalIds: [{ scheme: "ijf", value: "8873" }] });
    const pasted = ["Rank\tName\tNation\tIJF ID", "1\tGRIGALASHVILI Tato\tGEO\t1234", "3\tCASSE Matthias\tBEL\t8873"].join("\n");
    const read = await postForm(PASTE, [["intent", "read"], ["source", "ijf"], ["url", ""], ["text", pasted]]);
    const raw = new URL(read.headers.get("location")!, "https://bsh.test").searchParams.get("raw")!;

    const res = await postForm(PASTE, [
      ["intent", "confirm"],
      ["source", "ijf"],
      ["raw", raw],
      ["reference", "paris-2024"],
      ["sport", "Judo"],
      ["event", "-81 kg Men"],
      ["date", "2024-07-30"],
      ...["place", "name", "nation", "if-id"].map((role, i): [string, string] => [`col.${i}`, role]),
      ["row", "0"],
      ["row", "1"],
    ]);
    expect(res.status).toBe(303);

    expect(sports(await page(PARIS))).toEqual([{ sport: "Judo", results: ["30 Jul -81 kg Men Matthias Casse 3rd"] }]);
    expect(await page(PARIS)).toContain(`href="/athletes/${casse}"`);
  });

  it("shows a Team's result linked to the Team and its roster's Athletes", async () => {
    const judo = await seedCompetition(env.DB, { name: "Olympic Games Paris", sport: "Judo", kind: "games", source: "ijf", startDate: "2024-07-27", endDate: "2024-08-03" });
    const casse = await seedAthlete(env.DB, { name: "Matthias Casse", sport: "Judo" });
    const team = await seedTeamResult(env.DB, { competitionId: judo, sport: "Judo", event: "Mixed Team", place: 5, roster: [casse] });

    const html = await page(PARIS);

    expect(sports(html)).toEqual([{ sport: "Judo", results: ["3 Aug Mixed Team Belgium · Mixed Team · Matthias Casse 5th"] }]);
    expect(html).toContain(`href="/teams/${team}"`);
    expect(html).toContain(`href="/athletes/${casse}"`);
  });

  it("takes a Team's result by hand, with the Athletes the result credits", async () => {
    // The Red Lions, as an earlier result left them.
    const earlier = await seedCompetition(env.DB, { name: "FIH Pro League", sport: "Hockey", startDate: "2024-06-01" });
    const boon = await seedAthlete(env.DB, { name: "Tom Boon", sport: "Hockey" });
    const team = await seedTeamResult(env.DB, { competitionId: earlier, sport: "Hockey", event: "Men", place: 2, roster: [boon] });

    const res = await postForm(ENTER_PARIS, [
      ["team", team],
      ["roster", boon],
      ["sport", "Hockey"],
      ["event", "Men"],
      ["place", "6"],
      ["status", "finished"],
      ["date", "2024-08-04"],
      ["sourceUrl", "https://www.olympedia.org/results/9000002"],
    ]);
    expect(res.status).toBe(303);

    expect(sports(await page(PARIS))).toEqual([{ sport: "Hockey", results: ["4 Aug Men Belgium · Men · Tom Boon 6th"] }]);
    expect(text(await page(`/athletes/${boon}`))).toContain("Paris 2024");
  });

  it("includes Olympic results a source published on the Games' days", async () => {
    const judo = await seedCompetition(env.DB, { name: "Olympic Games Paris", sport: "Judo", kind: "games", source: "ijf", startDate: "2024-07-27", endDate: "2024-08-03" });
    const casse = await seedAthlete(env.DB, { name: "Matthias Casse", sport: "Judo" });
    await seedResult(env.DB, judo, casse, { event: "-81 kg Men", date: "2024-07-30", place: 3 });
    // Another Games is not part of it.
    const tokyo = await seedCompetition(env.DB, { name: "Olympic Games Tokyo", sport: "Judo", kind: "games", source: "ijf", startDate: "2021-07-24", endDate: "2021-07-31" });
    await seedResult(env.DB, tokyo, casse, { event: "-81 kg Men", date: "2021-07-27", place: 3 });

    expect(sports(await page(PARIS))).toEqual([{ sport: "Judo", results: ["30 Jul -81 kg Men Matthias Casse 3rd"] }]);
  });

  it("is reached from the Games tab, and its Games id leads to the reference page", async () => {
    await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "1", date: "2024-08-09" });
    const games = await getDb(env.DB).query.competition.findFirst({ where: (c, { eq }) => eq(c.sourceRef, "paris-2024") });

    const tab = await page("/games");
    expect(tab).toContain(`href="${PARIS}"`);
    expect(tab).toContain('href="/reference/milano-cortina-2026"');

    const res = await get(`/games/${games!.id}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(PARIS);
  });

  it("counts Paris 2024 as LA 2028's previous edition", async () => {
    await enterByHand({ athlete: thiam, sport: "Athletics", event: "Heptathlon Women", place: "1", date: "2024-08-09" });
    // Only an Active Entry makes the next edition likely (#28): she competed this season.
    const recent = await seedCompetition(env.DB, { name: "Diamond League", sport: "Athletics", startDate: "2026-07-01" });
    await seedResult(env.DB, recent, thiam, { date: "2026-07-01" });
    await post("/curate/run/schedules", { intent: "save-games-dates", games: "la-2028", firstDay: "2028-07-12", lastDay: "2028-07-30", sourceUrl: "https://olympics.example/la-2028" });

    const calendar = text(await page("/calendar?month=2028-07"));
    expect(calendar).toMatch(/LA 2028 .*Likely: Belgian Entry at the previous edition/);
    // Paris 2024 itself sits on the Calendar on its own days.
    expect(text(await page("/calendar?month=2024-07"))).toContain("24 Jul–11 Aug Paris 2024");
  });

  it("answers 404 for a Games that is not a reference", async () => {
    expect((await get("/reference/tokyo-2020")).status).toBe(404);
    expect((await enterByHand({ athlete: thiam, sport: "Athletics", event: "x", place: "1", date: "2021-08-01" }, "/curate/reference/tokyo-2020")).status).toBe(404);
  });
});
