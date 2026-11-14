import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntrant, seedParticipationCuration, seedResult } from "../support/seed";
import { get } from "../support/worker";

// Spec #20, stories 35–38, 40 and 53; ticket #29: the Calendar tab.
const NOW = "2026-11-14T12:00:00.000Z";

const page = async (path: string) => (await get(path)).text();
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** The month list's row for one competition, as text; undefined when it is not listed. */
function listed(html: string, name: string) {
  const list = html.slice(html.indexOf("This month"));
  const row = [...list.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).find((r) => r.includes(name));
  return row;
}

/** The grid's week starting on `monday` ("23 Nov"), as its bars' labels. */
function week(html: string, monday: string) {
  const m = html.match(new RegExp(`<div class="week" aria-label="Week of ${monday}">(.*?)(?=<div class="week"|<div class="legend")`, "s"));
  if (!m) return undefined;
  return [...m[1].matchAll(/<div class="ev[^"]*"[^>]*>(.*?)<\/div>/gs)].map((b) => text(b[1]));
}

describe("Calendar", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
  });

  it("lists this month's competitions with a Belgian Participation, saying whether it is confirmed or likely", async () => {
    const tas = await seedAthlete(env.DB, { name: "Sandrine Tas", sport: "Speed skating" });
    const desmet = await seedAthlete(env.DB, { name: "Hanne Desmet", sport: "Short track" });

    const calgary = await seedCompetition(env.DB, {
      name: "Speed Skating World Cup, Calgary",
      sport: "Speed skating",
      startDate: "2026-11-20",
      endDate: "2026-11-22",
      series: "isu:world-cup:calgary",
    });
    await seedEntrant(env.DB, calgary, tas);

    // Hanne Desmet skated last year's Montréal leg: this year's is likely.
    const montreal2025 = await seedCompetition(env.DB, {
      name: "Short Track World Tour, Montréal",
      sport: "Short track",
      startDate: "2025-11-14",
      endDate: "2025-11-16",
      series: "isu-st:world-tour:montreal",
    });
    await seedResult(env.DB, montreal2025, desmet, { date: "2025-11-15" });
    await seedCompetition(env.DB, {
      name: "Short Track World Tour, Montréal",
      sport: "Short track",
      startDate: "2026-11-13",
      endDate: "2026-11-15",
      series: "isu-st:world-tour:montreal",
    });

    const wuxi = await seedCompetition(env.DB, { name: "WT Grand Slam, Wuxi", sport: "Taekwondo", startDate: "2026-11-27", endDate: "2026-11-29" });
    await seedParticipationCuration(env.DB, wuxi, { addedAt: "2026-10-02T10:00:00.000Z", checkedAt: "2026-10-02T10:00:00.000Z" });

    // No Belgian anywhere near it.
    await seedCompetition(env.DB, { name: "Alpine World Cup, Gurgl", sport: "Alpine skiing", startDate: "2026-11-22" });

    const html = await page("/calendar");

    expect(html).toContain("November 2026");
    expect(listed(html, "Calgary")).toBe("20–22 Nov Speed Skating World Cup, Calgary Speed skating · Confirmed · Sandrine Tas");
    expect(listed(html, "Montréal")).toBe("13–15 Nov Short Track World Tour, Montréal Short track · Likely: Belgian Entry at the previous edition");
    expect(listed(html, "Wuxi")).toBe("27–29 Nov WT Grand Slam, Wuxi Taekwondo · Likely: added by hand");
    expect(listed(html, "Gurgl")).toBeUndefined();
  });

  it("always shows Championships and the Games, in bold, even before any Belgian Participation", async () => {
    await seedCompetition(env.DB, {
      name: "European Short Course Swimming Championships",
      sport: "Swimming",
      kind: "championship",
      startDate: "2026-12-01",
      endDate: "2026-12-06",
    });

    const html = await page("/calendar?month=2026-12");

    expect(html).toContain("December 2026");
    expect(listed(html, "European Short Course")).toBe("1–6 Dec European Short Course Swimming Championships Swimming · No Belgian Participation known yet");
    expect(html).toMatch(/<b>European Short Course Swimming Championships<\/b>/);
    expect(html).toMatch(/class="ev champ[^"]*"[^>]*>European Short Course Swimming Championships/);
  });

  it("treats Europeans and Worlds, indoor and outdoor, short and long course as separate Championships", async () => {
    const swimmer = await seedAthlete(env.DB, { name: "Lucas Henveaux", sport: "Swimming" });
    // A Belgian swam last year's short-course Europeans, but not the long-course ones.
    const sc2025 = await seedCompetition(env.DB, {
      name: "European Short Course Swimming Championships",
      sport: "Swimming",
      kind: "championship",
      startDate: "2025-12-02",
      endDate: "2025-12-07",
      series: "len:european-championships-25m",
    });
    await seedResult(env.DB, sc2025, swimmer, { date: "2025-12-03" });
    await seedCompetition(env.DB, {
      name: "European Short Course Swimming Championships",
      sport: "Swimming",
      kind: "championship",
      startDate: "2026-12-01",
      endDate: "2026-12-06",
      series: "len:european-championships-25m",
    });
    await seedCompetition(env.DB, {
      name: "World Swimming Championships (25 m)",
      sport: "Swimming",
      kind: "championship",
      startDate: "2026-12-10",
      endDate: "2026-12-14",
      series: "world-aquatics:world-championships-25m",
    });

    const html = await page("/calendar?month=2026-12");

    expect(listed(html, "European Short Course")).toContain("Likely: Belgian Entry at the previous edition");
    expect(listed(html, "World Swimming")).toContain("No Belgian Participation known yet");
  });

  it("leaves out a likely Participation the owner dropped, and shows one confirmed by hand as confirmed", async () => {
    const dropped = await seedCompetition(env.DB, { name: "BWF World Tour Finals", sport: "Badminton", startDate: "2026-11-25", endDate: "2026-11-29" });
    await seedParticipationCuration(env.DB, dropped, { addedAt: "2026-10-01T10:00:00.000Z", decision: "dropped", checkedAt: "2026-11-07T10:00:00.000Z" });
    const confirmed = await seedCompetition(env.DB, { name: "Judo Grand Slam, Tokyo", sport: "Judo", startDate: "2026-11-28", endDate: "2026-11-29" });
    await seedParticipationCuration(env.DB, confirmed, { addedAt: "2026-10-01T10:00:00.000Z", decision: "confirmed", checkedAt: "2026-11-07T10:00:00.000Z" });

    const html = await page("/calendar");

    expect(listed(html, "BWF")).toBeUndefined();
    expect(listed(html, "Judo Grand Slam")).toBe("28–29 Nov Judo Grand Slam, Tokyo Judo · Confirmed");
  });

  it("draws a multi-day competition as a bar that continues across weeks and into the next month", async () => {
    const athlete = await seedAthlete(env.DB, { name: "Florent Claude", sport: "Biathlon" });
    const ostersund = await seedCompetition(env.DB, { name: "Biathlon World Cup, Östersund", sport: "Biathlon", startDate: "2026-11-28", endDate: "2026-12-06" });
    await seedEntrant(env.DB, ostersund, athlete);

    const november = await page("/calendar?month=2026-11");
    expect(week(november, "23 Nov")).toEqual(["Biathlon World Cup, Östersund"]);
    expect(week(november, "30 Nov")).toEqual(["← Biathlon World Cup, Östersund"]);
    expect(week(november, "16 Nov")).toEqual([]);

    const december = await page("/calendar?month=2026-12");
    expect(week(december, "30 Nov")).toEqual(["← Biathlon World Cup, Östersund"]);
    expect(listed(december, "Östersund")).toContain("28 Nov–6 Dec");
  });

  it("gives every sport one colour, shown in a legend", async () => {
    const athlete = await seedAthlete(env.DB, { name: "Sandrine Tas", sport: "Speed skating" });
    for (const [name, sport, day] of [
      ["Speed Skating World Cup, Obihiro", "Speed skating", "2026-11-20"],
      ["Speed Skating World Cup, Stavanger", "Speed skating", "2026-11-27"],
      ["Short Track World Tour, Seoul", "Short track", "2026-11-27"],
    ]) {
      const id = await seedCompetition(env.DB, { name, sport, startDate: day });
      await seedEntrant(env.DB, id, athlete);
    }

    const html = await page("/calendar");

    const colour = (name: string) => html.match(new RegExp(`class="ev[^"]*" title="${name}" style="background:([^;"]+)`))?.[1];
    expect(colour("Speed Skating World Cup, Obihiro")).toBeDefined();
    expect(colour("Speed Skating World Cup, Obihiro")).toBe(colour("Speed Skating World Cup, Stavanger"));
    expect(colour("Short Track World Tour, Seoul")).not.toBe(colour("Speed Skating World Cup, Obihiro"));
    const legend = html.slice(html.indexOf('aria-label="Legend"'));
    expect(legend).toMatch(new RegExp(`background:${colour("Speed Skating World Cup, Obihiro")}[^>]*></span>Speed skating`));
    expect(legend).toMatch(new RegExp(`background:${colour("Short Track World Tour, Seoul")}[^>]*></span>Short track`));
  });

  it("moves between months with the arrows", async () => {
    const html = await page("/calendar?month=2027-01");

    expect(html).toContain("January 2027");
    expect(html).toContain('href="/calendar?month=2026-12"');
    expect(html).toContain('href="/calendar?month=2027-02"');
  });
});
