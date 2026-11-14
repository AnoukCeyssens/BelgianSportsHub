import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntry, seedTimetable } from "../support/seed";
import { get, post } from "../support/worker";

// Spec #20, stories 47, 49, 56, 58, 112 and 113; ticket #38. While any
// competition with Belgian Entries is Live, the owner runs a four-step Live
// day pass (Today & tomorrow, Today's results, Merge queue, Source health
// with problems only). What it records moves rounds on or drops them, adds
// optional heat or match detail to the day view, and feeds the medal table,
// Belgium highlighted (narrowed by the Games' sport chips).

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const page = async (path: string) => (await get(path)).text();

/** The shown day's Sessions: one line per Belgian Entry in a round. */
function dayRows(html: string) {
  const start = html.indexOf('aria-label="Sessions"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr([^>]*)>(.*?)<\/tr>/gs)].map((m) => `${text(m[2])}${/if-through/.test(m[1]) ? " [greyed]" : ""}`);
}

/** The medal table's rows, Belgium's marked. */
function medalRows(html: string) {
  const start = html.indexOf('aria-label="Medal table"');
  if (start < 0) return null;
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr([^>]*)>(.*?)<\/tr>/gs)].filter((m) => !/<th/.test(m[2])).map((m) => `${text(m[2])}${/\bbel\b/.test(m[1]) ? " [Belgium]" : ""}`);
}

const TODAY = "/curate/live/today-tomorrow";
const RESULTS = "/curate/live/todays-results";
const URL_ = "https://isu.example/results/500m.pdf";

describe("Live day pass and medal table", () => {
  let europeans: string;
  let desmet: string;
  let w500: string;
  let w1000: string;

  beforeEach(async () => {
    fixClock("2027-01-15T18:00:00.000Z");
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await clearIngestedData(env);
    europeans = await seedCompetition(env.DB, {
      name: "European Short Track Championships 2027",
      sport: "Short track",
      kind: "championship",
      startDate: "2027-01-15",
      endDate: "2027-01-17",
      city: "Gdańsk",
      venueZone: "Europe/Warsaw",
    });
    desmet = await seedAthlete(env.DB, { name: "Hanne Desmet", sport: "Short track" });
    w500 = await seedEntry(env.DB, { competitionId: europeans, sport: "Short track", event: "Women's 500 m", athleteId: desmet });
    w1000 = await seedEntry(env.DB, { competitionId: europeans, sport: "Short track", event: "Women's 1000 m", athleteId: desmet });
    await seedTimetable(env.DB, europeans, "Europe/Warsaw", [
      { sport: "Short track", date: "2027-01-15", start: "13:00", rounds: [["Women's 500 m", "Heats"]] },
      { sport: "Short track", date: "2027-01-15", start: "15:30", rounds: [["Women's 1000 m", "Heats"]] },
      { sport: "Short track", date: "2027-01-16", start: "12:00", rounds: [["Women's 500 m", "Quarter-finals"]] },
      { sport: "Short track", date: "2027-01-17", start: "13:00", rounds: [["Women's 1000 m", "Quarter-finals"]] },
      { sport: "Short track", date: "2027-01-17", start: "15:00", rounds: [["Women's 500 m", "Final"]] },
    ]);
  });

  it("is offered from the weekly Run sheet only while a competition with Belgian Entries is Live", async () => {
    expect(await page("/curate/run/source-health")).toContain(`href="${TODAY}"`);

    fixClock("2027-01-10T12:00:00.000Z");
    expect(await page("/curate/run/source-health")).not.toContain(`href="${TODAY}"`);
    expect(text(await page(TODAY))).toContain("No competition with Belgian Entries is Live today.");
  });

  it("has four steps: Today & tomorrow, Today's results, Merge queue and Source health", async () => {
    const rail = text((await page(TODAY)).match(/<nav class="rail"[^>]*>(.*?)<\/nav>/s)![1]);
    expect(rail).toMatch(/^Live day pass (1|✓) Today & tomorrow .* (2|✓) Today's results .* (3|✓) Merge queue .* (4|✓) Source health /);
  });

  it("lists today's and tomorrow's rounds for heat detail; the detail shows on the day view, Belgian time first", async () => {
    const step = text(await page(TODAY));
    expect(step).toContain("Hanne Desmet · Women's 500 m · Heats");
    expect(step).toContain("Hanne Desmet · Women's 1000 m · Heats");
    expect(step).toContain("Hanne Desmet · Women's 500 m · Quarter-finals");
    expect(step).not.toContain("Final");
    expect(step).toContain("Today & tomorrow ~10 min · 3 open");

    const saved = await post(TODAY, { intent: "save-detail", entry: w500, round: "Heats", heat: "2", lane: "4", opponent: "", start: "13:24" });
    expect(saved.status).toBe(303);
    expect(text(await page(TODAY))).toContain("Today & tomorrow ~10 min · 2 open");
    expect(text(await page(TODAY))).toContain("Hanne Desmet · Women's 500 m · Heats: heat 2 · lane 4 · 13:24");

    // A round without detail (the 1000 m heats) shows as before.
    expect(dayRows(await page(`/championship/${europeans}?day=2027-01-15`))).toEqual([
      "13:24 Hanne Desmet Women's 500 m · Heats · Heat 2 · lane 4",
      "15:30 Hanne Desmet Women's 1000 m · Heats",
    ]);
  });

  it("moves a later round on once the Entry is through, and drops the rounds after it is out", async () => {
    expect(dayRows(await page(`/championship/${europeans}?day=2027-01-16`))).toEqual([
      "12:00 Hanne Desmet Women's 500 m · Quarter-finals if through [greyed]",
    ]);
    const due = text(await page(RESULTS));
    expect(due).toContain("Hanne Desmet · Women's 500 m · Heats");
    expect(due).toContain("Hanne Desmet · Women's 1000 m · Heats");

    expect((await post(RESULTS, { intent: "through", entry: w500, round: "Heats" })).status).toBe(303);
    expect(dayRows(await page(`/championship/${europeans}?day=2027-01-15`))[0]).toBe("13:00 Hanne Desmet Women's 500 m · Heats through");
    expect(dayRows(await page(`/championship/${europeans}?day=2027-01-16`))).toEqual(["12:00 Hanne Desmet Women's 500 m · Quarter-finals"]);

    await post(RESULTS, { intent: "out", entry: w1000, round: "Heats", place: "", performance: "", sourceUrl: "" });
    expect(dayRows(await page(`/championship/${europeans}?day=2027-01-17`))).toEqual(["15:00 Hanne Desmet Women's 500 m · Final if through [greyed]"]);
    expect(text(await page(RESULTS))).not.toContain("Hanne Desmet · Women's");
    expect(text(await page(RESULTS))).toContain("Hanne Desmet: Women's 1000 m · Heats out");
  });

  it("shows a final result on its round and counts it in the medal table, Belgium highlighted", async () => {
    await post(RESULTS, { intent: "through", entry: w500, round: "Heats" });
    fixClock("2027-01-16T18:00:00.000Z");
    await post(RESULTS, { intent: "through", entry: w500, round: "Quarter-finals" });
    fixClock("2027-01-17T17:00:00.000Z");
    expect(text(await page(RESULTS))).toContain("Hanne Desmet · Women's 500 m · Final");
    const final = await post(RESULTS, { intent: "final", entry: w500, round: "Final", place: "2", performance: "43.10", sourceUrl: URL_ });
    expect(final.status).toBe(303);

    const html = await page(`/championship/${europeans}?day=2027-01-17`);
    expect(dayRows(html)).toContain("15:00 Hanne Desmet Women's 500 m · Final S Silver · 43.10");
    expect(medalRows(html)).toEqual(["1 Belgium 0 1 0 [Belgium]"]);

    const pasted = await post(RESULTS, {
      intent: "medal-table",
      competition: europeans,
      sourceUrl: "https://isu.example/medals",
      text: "Rank\tNation\tGold\tSilver\tBronze\tTotal\n1\tNetherlands\t4\t2\t1\t7\n2\tItaly\t1\t0\t2\t3\n3\tBelgium\t0\t0\t1\t1",
    });
    expect(pasted.status).toBe(303);
    expect(medalRows(await page(`/championship/${europeans}`))).toEqual(["1 Netherlands 4 2 1", "2 Italy 1 0 2", "3 Belgium 0 1 0 [Belgium]"]);
    expect(text(await page(RESULTS))).toContain("European Short Track Championships 2027: medal table stored, 2 other nations");
  });

  it("narrows the Games' medal table to Belgium's medals in the chosen sports", async () => {
    fixClock("2026-11-14T12:00:00.000Z");
    const owner = { sourceUrl: "https://la28.example/schedule" };
    await post("/curate/run/schedules", { intent: "save-games-dates", games: "la-2028", firstDay: "2028-07-12", lastDay: "2028-07-30", ...owner });
    for (const sport of ["Athletics", "Cycling Road"]) {
      await post("/curate/run/schedules", { intent: "save-sport-days", games: "la-2028", sport, firstDay: "2028-07-14", lastDay: "2028-07-30", ...owner });
    }
    const la = (await getDb(env.DB).query.competition.findFirst({ where: (c, { eq }) => eq(c.kind, "games") }))!.id;
    const thiam = await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics" });
    const evenepoel = await seedAthlete(env.DB, { name: "Remco Evenepoel", sport: "Cycling Road" });
    const hept = await seedEntry(env.DB, { competitionId: la, sport: "Athletics", event: "Women's Heptathlon", athleteId: thiam });
    const road = await seedEntry(env.DB, { competitionId: la, sport: "Cycling Road", event: "Men's Road Race", athleteId: evenepoel });
    await seedTimetable(env.DB, la, "America/Los_Angeles", [
      { sport: "Athletics", date: "2028-07-16", start: "18:30", rounds: [["Women's Heptathlon", "Final"]] },
      { sport: "Cycling Road", date: "2028-07-15", start: "09:00", rounds: [["Men's Road Race", "Final"]] },
    ]);

    fixClock("2028-07-17T12:00:00.000Z");
    await post(RESULTS, { intent: "final", entry: hept, round: "Final", place: "1", performance: "6 880", sourceUrl: "https://wa.example/hept" });
    await post(RESULTS, { intent: "final", entry: road, round: "Final", place: "3", performance: "+0:12", sourceUrl: "https://uci.example/rr" });
    await post(RESULTS, { intent: "medal-table", competition: la, sourceUrl: "https://la28.example/medals", text: "1 United States 12 9 10\n2 China 11 8 4" });

    expect(medalRows(await page(`/games/${la}`))).toEqual(["1 United States 12 9 10", "2 China 11 8 4", "3 Belgium 1 0 1 [Belgium]"]);
    const athletics = await page(`/games/${la}?sport=Athletics`);
    expect(medalRows(athletics)).toEqual(["Belgium 1 0 0 [Belgium]"]);
    expect(text(athletics)).toContain("Gold Nafissatou Thiam Women's Heptathlon");
    expect(text(athletics)).not.toContain("Remco Evenepoel");
  });
});
