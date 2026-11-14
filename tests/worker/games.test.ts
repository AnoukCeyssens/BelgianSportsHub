import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData } from "../support/seed";
import { get, OWNER_EMAIL, post, signedInAs } from "../support/worker";

// Spec #20, stories 41–43, 49, 50 and 60; ticket #35. The Games tab shows LA
// 2028 (and French Alps 2030) with the Championship phase mechanics. The
// owner curates the Games dates and each sport's first and last competition
// day in the Run sheet's Schedules step; the Calendar uses them. Each sport is
// in its own phase, the Games as a whole go Live at the first day in any
// sport, and combinable sport chips (All sports by default) filter every
// phase.
const NOW = "2026-11-14T12:00:00.000Z";
const SCHEDULES = "/curate/run/schedules";

const page = async (path: string, init?: RequestInit) => (await get(path, init)).text();
const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

/** The Phase bar's steps, as text ("Live ● now"). */
function phaseBar(html: string) {
  const nav = html.match(/<nav class="phases" aria-label="Phases">(.*?)<\/nav>/s)?.[1] ?? "";
  return [...nav.matchAll(/<(a|span)([^>]*)>(.*?)<\/\1>(?=<a|<span class|$)/gs)].map((m) => text(m[3]));
}

/** The shown phase's panel, as text. */
function panel(html: string) {
  const m = html.match(/<section class="phase" aria-label="([^"]+)">(.*?)<\/section>/s);
  return m ? { phase: m[1], text: text(m[2]) } : undefined;
}

/** The sport chips: each chip's text, whether it is on, and where it leads. */
function chips(html: string) {
  const nav = html.match(/<nav class="chips" aria-label="Sports">(.*?)<\/nav>/s)?.[1] ?? "";
  return [...nav.matchAll(/<a([^>]*)>(.*?)<\/a>/gs)].map((m) => ({
    chip: text(m[2]),
    on: /class="chip on"/.test(m[1]),
    href: m[1].match(/href="([^"]*)"/)?.[1].replace(/&amp;/g, "&"),
  }));
}

/** The per-sport table: one "sport · days · phase" line per sport. */
function sportRows(html: string) {
  const start = html.indexOf('aria-label="Sports by phase"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1]));
}

/** The Schedules step's Games forms, as text. */
function gamesForms(html: string) {
  return [...html.matchAll(/<form[^>]*class="card games-dates"[^>]*>(.*?)<\/form>/gs)].map((m) => text(m[1]));
}

const saveGamesDates = (games: string, firstDay: string, lastDay: string) =>
  post(SCHEDULES, { intent: "save-games-dates", games, firstDay, lastDay, sourceUrl: `https://olympics.example/${games}` });

const saveSportDays = (games: string, sport: string, firstDay: string, lastDay: string) =>
  post(SCHEDULES, { intent: "save-sport-days", games, sport, firstDay, lastDay, sourceUrl: `https://olympics.example/${games}/schedule` });

async function gamesId(key: string) {
  const row = await getDb(env.DB).query.competition.findFirst({
    where: (c, { and, eq }) => and(eq(c.source, "owner"), eq(c.sourceRef, key)),
  });
  return row!.id;
}

/** LA 2028 with three sports' days recorded. */
async function la28() {
  await saveGamesDates("la-2028", "2028-07-12", "2028-07-30");
  await saveSportDays("la-2028", "Athletics", "2028-07-15", "2028-07-24");
  await saveSportDays("la-2028", "Hockey", "2028-07-13", "2028-07-28");
  await saveSportDays("la-2028", "Cycling road", "2028-07-14", "2028-07-16");
  return gamesId("la-2028");
}

describe("Games", () => {
  beforeEach(async () => {
    fixClock(NOW);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await db.delete(schema.gamesSportWindow);
    await clearIngestedData(env);
  });

  it("asks the owner in the Schedules step for the dates of each Games not recorded yet", async () => {
    const html = await page(SCHEDULES);

    expect(text(html)).toContain("2 open");
    expect(gamesForms(html)).toEqual([
      expect.stringContaining("LA 2028 · Los Angeles · dates not recorded yet"),
      expect.stringContaining("French Alps 2030 · French Alps · dates not recorded yet"),
    ]);
    expect((await page("/games"))).toContain("No Games dates recorded yet.");
  });

  it("records the Games dates with their source; the Games tab and the Calendar use them", async () => {
    const saved = await saveGamesDates("la-2028", "2028-07-12", "2028-07-30");
    expect(saved.status).toBe(303);

    const step = await page(SCHEDULES);
    expect(text(step)).toContain("1 open");
    expect(gamesForms(step)[0]).toContain("LA 2028 · Los Angeles · 12–30 Jul 2028");
    expect(step).toMatch(/LA 2028: Games dates 12–30 Jul 2028/);

    const games = await page("/games");
    expect(text(games)).toContain("LA 2028");
    expect(text(games)).toContain("Los Angeles · 12–30 Jul 2028");
    expect(phaseBar(games)).toEqual(["Standards ● now", "Qualification", "Selection", "Live", "After"]);

    const july = await page("/calendar?month=2028-07");
    expect(text(july)).toContain("LA 2028");

    // Correcting the dates updates the same Games.
    await saveGamesDates("la-2028", "2028-07-14", "2028-07-30");
    expect(text(await page("/games"))).toContain("Los Angeles · 14–30 Jul 2028");
    expect(await getDb(env.DB).select().from(schema.competition)).toHaveLength(1);
  });

  it("refuses sport days outside the Games dates", async () => {
    await saveGamesDates("la-2028", "2028-07-12", "2028-07-30");

    const refused = await saveSportDays("la-2028", "Athletics", "2028-07-10", "2028-07-24");

    expect(refused.status).toBe(400);
  });

  it("stores a sport by its Olympic programme name, and refuses a name that is no sport", async () => {
    await saveGamesDates("la-2028", "2028-07-12", "2028-07-30");

    await saveSportDays("la-2028", "athletics (track & field)", "2028-07-15", "2028-07-24");
    await saveSportDays("la-2028", "Road cycling", "2028-07-14", "2028-07-16");
    const refused = await saveSportDays("la-2028", "Aquatics", "2028-07-13", "2028-07-20");

    expect(refused.status).toBe(400);
    expect(sportRows(await page(`/games/${await gamesId("la-2028")}`))).toEqual(["Athletics 15–24 Jul Standards", "Cycling road 14–16 Jul Standards"]);
  });

  it("shows French Alps 2030 in Standards with only the expected publication date", async () => {
    await saveGamesDates("la-2028", "2028-07-12", "2028-07-30");
    await saveGamesDates("french-alps-2030", "2030-02-01", "2030-02-17");
    const alps = await gamesId("french-alps-2030");

    const tab = await page("/games");
    expect(tab).toContain(`href="/games/${alps}"`);

    expect(await page(`/games/${alps}`, signedInAs(OWNER_EMAIL))).toContain(`href="/curate/games/${alps}/standards"`);
    const recorded = await post(`/curate/games/${alps}/standards`, { expectedOn: "2027-12-01", expectedSource: "https://example.org/calendar", publishedOn: "", url: "", standards: "" });
    expect(recorded.headers.get("Location")).toBe(`/games/${alps}`);

    const html = await page(`/games/${alps}`);
    expect(text(html)).toContain("French Alps 2030");
    expect(phaseBar(html)[0]).toBe("Standards ● now");
    expect(panel(html)).toEqual({ phase: "Standards", text: "Standards expected 1 Dec 2027 · source · checked 14 Nov 2026." });
  });

  it("offers combinable sport chips, All sports by default", async () => {
    const la = await la28();

    expect(chips(await page(`/games/${la}`))).toEqual([
      { chip: "All sports", on: true, href: `/games/${la}` },
      { chip: "Athletics", on: false, href: `/games/${la}?sport=Athletics` },
      { chip: "Cycling road", on: false, href: `/games/${la}?sport=Cycling+road` },
      { chip: "Hockey", on: false, href: `/games/${la}?sport=Hockey` },
    ]);
    expect(chips(await page(`/games/${la}?sport=Athletics`))).toEqual([
      { chip: "All sports", on: false, href: `/games/${la}` },
      { chip: "Athletics", on: true, href: `/games/${la}` },
      { chip: "Cycling road", on: false, href: `/games/${la}?sport=Athletics%2CCycling+road` },
      { chip: "Hockey", on: false, href: `/games/${la}?sport=Athletics%2CHockey` },
    ]);
  });

  it("puts each sport in its own phase; the per-sport view opens on that sport's phase", async () => {
    const la = await la28();
    fixClock("2028-07-26T19:00:00.000Z"); // 12:00 in LA on 26 Jul: athletics is over, hockey goes on

    let html = await page(`/games/${la}`);
    expect(phaseBar(html)).toEqual(["Standards", "Qualification", "Selection", "Live ● now", "After"]);
    expect(sportRows(html)).toEqual(["Athletics 15–24 Jul After", "Cycling road 14–16 Jul After", "Hockey 13–28 Jul Live"]);

    html = await page(`/games/${la}?sport=Athletics`);
    expect(phaseBar(html)).toEqual(["Standards", "Qualification", "Selection", "Live", "After ● now"]);
    expect(panel(html)?.phase).toBe("After");
    expect(sportRows(html)).toEqual(["Athletics 15–24 Jul After"]);

    html = await page(`/games/${la}?sport=Athletics,Hockey`);
    expect(phaseBar(html)).toEqual(["Standards", "Qualification", "Selection", "Live ● now", "After"]);
    expect(sportRows(html)).toEqual(["Athletics 15–24 Jul After", "Hockey 13–28 Jul Live"]);
  });

  it("goes Live as a whole at the first day in any sport", async () => {
    const la = await la28();
    fixClock("2028-07-13T07:00:00.000Z"); // 00:00 in LA on 13 Jul: hockey starts, the Games' own day one was the 12th

    expect(phaseBar(await page(`/games/${la}`))[3]).toBe("Live ● now");
    expect(phaseBar(await page(`/games/${la}?sport=Athletics`))[3]).toBe("Live");
    expect(panel(await page(`/games/${la}?sport=Hockey`))?.phase).toBe("Live");
  });

  it("filters the standards by the chosen sports, keeping Games-wide lines", async () => {
    const la = await la28();
    await post(`/curate/games/${la}/standards`, {
      expectedOn: "",
      publishedOn: "2026-10-01",
      url: "https://olympics.example/la28-qualification",
      standards: "Universality places for every NOC\nAthletics: entry standard or World Ranking\nHockey: continental champions plus qualifiers",
    });

    expect(panel(await page(`/games/${la}`))?.text).toContain("Athletics: entry standard or World Ranking Hockey:");
    const hockey = panel(await page(`/games/${la}?sport=Hockey`))!.text;
    expect(hockey).toContain("Universality places for every NOC");
    expect(hockey).toContain("Hockey: continental champions plus qualifiers");
    expect(hockey).not.toContain("Athletics:");
  });

  it("removes a sport's days", async () => {
    const la = await la28();

    await post(SCHEDULES, { intent: "remove-sport-days", games: "la-2028", sport: "Cycling road" });

    expect(chips(await page(`/games/${la}`)).map((c) => c.chip)).toEqual(["All sports", "Athletics", "Hockey"]);
  });

  it("has no Games page for a competition that is not the Games", async () => {
    await saveGamesDates("la-2028", "2028-07-12", "2028-07-30");
    expect((await get(`/games/no-such-games`)).status).toBe(404);
  });
});
