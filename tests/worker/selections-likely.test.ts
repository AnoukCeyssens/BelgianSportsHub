import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntrant, seedParticipationCuration, seedResult } from "../support/seed";
import { get, post } from "../support/worker";

// Spec #20, stories 96 and 109; ticket #29: the Run sheet's Selections &
// likely step lists the likely Participations of the coming weeks; the owner
// confirms, keeps, drops or adds them.
const NOW = "2026-11-14T12:00:00.000Z";
const STEP = "/curate/run/selections-likely";

const page = async (path: string) => (await get(path)).text();
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** The likely table's rows, as text. */
function likelyRows(html: string) {
  const start = html.indexOf('aria-label="Likely Participations"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).filter((r) => !r.startsWith("Competition"));
}

function railOpen(html: string) {
  const rail = html.slice(html.indexOf('aria-label="Run sheet steps"'), html.indexOf("</nav>"));
  return text(rail.match(/<li[^>]*>(?:(?!<\/li>).)*?Selections &amp; likely(?:(?!<\/li>).)*<\/li>/s)?.[0] ?? "");
}

const calendarRow = async (name: string, month = "2026-11") => {
  const html = await page(`/calendar?month=${month}`);
  const list = html.slice(html.indexOf("This month"));
  return [...list.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).find((r) => r.includes(name));
};

describe("Selections & likely step", () => {
  let montreal: string;

  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);

    const desmet = await seedAthlete(env.DB, { name: "Hanne Desmet", sport: "Short track" });
    const last = await seedCompetition(env.DB, { name: "Short Track World Tour, Montréal", sport: "Short track", startDate: "2025-11-21", endDate: "2025-11-23", series: "st:montreal" });
    await seedResult(env.DB, last, desmet, { date: "2025-11-22" });
    montreal = await seedCompetition(env.DB, { name: "Short Track World Tour, Montréal", sport: "Short track", startDate: "2026-11-27", endDate: "2026-11-29", series: "st:montreal" });
  });

  it("lists the likely Participations of the next six weeks with why each is likely", async () => {
    const wuxi = await seedCompetition(env.DB, { name: "WT Grand Slam, Wuxi", sport: "Taekwondo", startDate: "2026-12-17", endDate: "2026-12-19" });
    await seedParticipationCuration(env.DB, wuxi, { addedAt: "2026-10-02T10:00:00.000Z", checkedAt: "2026-10-02T10:00:00.000Z" });
    // Too far ahead for this week.
    const later = await seedCompetition(env.DB, { name: "Judo Grand Slam, Paris", sport: "Judo", startDate: "2027-02-12", endDate: "2027-02-14" });
    await seedParticipationCuration(env.DB, later, { addedAt: "2026-10-02T10:00:00.000Z", checkedAt: "2026-10-02T10:00:00.000Z" });
    // Already confirmed by an entry list.
    const athlete = await seedAthlete(env.DB, { name: "Sandrine Tas", sport: "Speed skating" });
    const calgary = await seedCompetition(env.DB, { name: "Speed Skating World Cup, Calgary", sport: "Speed skating", startDate: "2026-11-20", endDate: "2026-11-22" });
    await seedEntrant(env.DB, calgary, athlete);

    const html = await page(STEP);

    expect(likelyRows(html)).toEqual([
      "Short Track World Tour, Montréal 27–29 Nov · Short track Belgian Entry at the previous edition Confirm Keep Drop",
      "WT Grand Slam, Wuxi 17–19 Dec · Taekwondo added by hand Confirm Keep Drop",
    ]);
    expect(railOpen(html)).toBe("6 Selections & likely ~15 min · 2 open");
  });

  it("confirms a likely Participation, logging it", async () => {
    const res = await post(STEP, { intent: "confirm", competition: montreal });
    expect(res.status).toBe(303);

    const html = await page(STEP);
    expect(likelyRows(html)).toEqual([]);
    expect(html).toContain("Short Track World Tour, Montréal: confirmed");
    expect(await calendarRow("Montréal")).toBe("27–29 Nov Short Track World Tour, Montréal Short track · Confirmed");
  });

  it("keeps a likely Participation: off this week's list, still likely, back next week", async () => {
    await post(STEP, { intent: "keep", competition: montreal });

    expect(likelyRows(await page(STEP))).toEqual([]);
    expect(await calendarRow("Montréal")).toContain("Likely: Belgian Entry at the previous edition");

    fixClock("2026-11-21T12:00:00.000Z");
    expect(likelyRows(await page(STEP))).toHaveLength(1);
  });

  it("drops a likely Participation from the calendar", async () => {
    await post(STEP, { intent: "drop", competition: montreal });

    expect(likelyRows(await page(STEP))).toEqual([]);
    expect(await calendarRow("Montréal")).toBeUndefined();
    expect(await page(STEP)).toContain("Short Track World Tour, Montréal: dropped");
  });

  it("adds a likely Participation by hand for an upcoming competition", async () => {
    const tour = await seedCompetition(env.DB, { name: "BWF World Tour Finals", sport: "Badminton", startDate: "2026-12-09", endDate: "2026-12-13" });

    const form = await page(STEP);
    expect(form).toMatch(/<option value="[^"]+">BWF World Tour Finals · 9 Dec 2026<\/option>/);

    await post(STEP, { intent: "add", competition: tour });

    expect(await calendarRow("BWF", "2026-12")).toBe("9–13 Dec BWF World Tour Finals Badminton · Likely: added by hand");
    expect(await page(STEP)).toContain("BWF World Tour Finals: added as a likely Participation");
  });
});
