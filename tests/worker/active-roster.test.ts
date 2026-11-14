import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, seedTeamResult } from "../support/seed";
import { get, getDeployed, post } from "../support/worker";

// Ticket #28; GLOSSARY "Active" and "Hold"; spec #20, stories 17–24 and 114.
const listed = async (path: string) => {
  const html = await (await get(path)).text();
  return [...html.matchAll(/<a [^>]*href="\/(athletes|teams)\/[^"]+"[^>]*>([^<]+)<\/a>/g)].map((m) => m[2]);
};
const page = async (path: string) => (await get(path)).text();
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

async function athleteWithResultOn(name: string, date: string) {
  const id = await seedAthlete(env.DB, { name, sport: "Athletics" });
  const competition = await seedCompetition(env.DB, { name: `Meeting ${date}`, sport: "Athletics", startDate: date });
  await seedResult(env.DB, competition, id, { date });
  return id;
}

describe("Active roster", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    fixClock("2026-11-14T10:00:00.000Z");
  });

  it("lists only Active Athletes and Teams by default, and everyone in search", async () => {
    await athleteWithResultOn("Noor Vidts", "2026-09-01");
    await athleteWithResultOn("Kevin Borlée", "2025-06-01");
    await seedAthlete(env.DB, { name: "Never Raced", sport: "Athletics" });
    const relay = await seedCompetition(env.DB, { name: "World Relays", sport: "Athletics", startDate: "2026-05-02" });
    await seedTeamResult(env.DB, { competitionId: relay, sport: "Athletics", event: "4x400m Mixed", place: 3, roster: [] });
    const old = await seedCompetition(env.DB, { name: "Old Relays", sport: "Athletics", startDate: "2024-05-02" });
    await seedTeamResult(env.DB, { competitionId: old, sport: "Athletics", event: "4x100m Men", place: 6, roster: [] });

    expect(await listed("/athletes")).toEqual(["Noor Vidts", "Belgium · 4x400m Mixed"]);
    expect(await listed("/athletes?q=n")).toEqual(["Never Raced", "Noor Vidts"]);
    expect(await listed("/athletes?q=belgium")).toEqual(["Belgium · 4x100m Men", "Belgium · 4x400m Mixed"]);
    expect(text(await page("/athletes?q=borl"))).toContain("Kevin Borlée Athletics · inactive");
    expect(text(await page("/athletes"))).toContain("Active only; search to find inactive Athletes and Teams.");
  });

  it("counts a relay or team result towards each roster member's Active status", async () => {
    const id = await seedAthlete(env.DB, { name: "Dylan Borlée", sport: "Athletics" });
    const relay = await seedCompetition(env.DB, { name: "World Relays", sport: "Athletics", startDate: "2026-05-02" });
    await seedTeamResult(env.DB, { competitionId: relay, sport: "Athletics", event: "4x400m Men", place: 2, roster: [id] });

    expect(await listed("/athletes")).toContain("Dylan Borlée");
  });

  it("shows the status on the Athlete page", async () => {
    const id = await athleteWithResultOn("Noor Vidts", "2026-09-01");

    expect(text(await page(`/athletes/${id}`))).toContain("Active · latest senior international performance 1 Sept 2026");
  });

  it("a Hold keeps an Athlete without a recent performance Active until its date, with reason, source and last check shown", async () => {
    const id = await athleteWithResultOn("Elise Vanderelst", "2025-08-20");
    expect(await listed("/athletes")).toEqual([]);

    const saved = await post(`/curate/athletes/${id}/status`, {
      intent: "save",
      kind: "hold",
      date: "2027-03-31",
      note: "Pregnancy",
      source: "https://www.sporza.be/elise",
      checkedOn: "2026-11-14",
    });

    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe(`/athletes/${id}`);
    expect(await listed("/athletes")).toEqual(["Elise Vanderelst"]);
    const athlete = text(await page(`/athletes/${id}`));
    expect(athlete).toContain("Active · Hold until 31 Mar 2027: Pregnancy");
    expect(athlete).toContain("Source: https://www.sporza.be/elise · checked 14 Nov 2026");

    fixClock("2027-04-01T10:00:00.000Z");
    expect(await listed("/athletes")).toEqual([]);
  });

  it("a retirement makes an Athlete inactive at once, and a later performance clears it", async () => {
    const id = await athleteWithResultOn("Nafissatou Thiam", "2026-08-15");
    await post(`/curate/athletes/${id}/status`, { intent: "save", kind: "retirement", date: "2026-10-01", source: "Instagram post", checkedOn: "2026-10-02" });

    expect(await listed("/athletes")).toEqual([]);
    expect(text(await page(`/athletes/${id}`))).toContain("Inactive · retired 1 Oct 2026");
    expect(await listed("/athletes?q=thiam")).toEqual(["Nafissatou Thiam"]);

    const comeback = await seedCompetition(env.DB, { name: "Diamond League", sport: "Athletics", startDate: "2026-11-08" });
    await seedResult(env.DB, comeback, id, { date: "2026-11-08" });
    expect(await listed("/athletes")).toEqual(["Nafissatou Thiam"]);
  });

  it("a change of sporting nationality makes an Athlete inactive until the owner clears it, keeping the Belgian history", async () => {
    const id = await athleteWithResultOn("Jonathan Sacoor", "2026-08-15");
    await post(`/curate/athletes/${id}/status`, {
      intent: "save",
      kind: "nationality-change",
      date: "2026-09-01",
      note: "NED",
      source: "https://worldathletics.org/transfer",
      checkedOn: "2026-09-02",
    });
    const later = await seedCompetition(env.DB, { name: "Late Meeting", sport: "Athletics", startDate: "2026-10-20" });
    await seedResult(env.DB, later, id, { date: "2026-10-20" });

    expect(await listed("/athletes")).toEqual([]);
    const athlete = text(await page(`/athletes/${id}`));
    expect(athlete).toContain("Inactive · changed sporting nationality to NED on 1 Sept 2026");
    expect(athlete).toContain("Meeting 2026-08-15");

    await post(`/curate/athletes/${id}/status`, { intent: "clear", kind: "nationality-change" });
    expect(await listed("/athletes")).toEqual(["Jonathan Sacoor"]);
  });

  it("a Team's dissolution makes it inactive, independent of its members", async () => {
    const member = await athleteWithResultOn("Katja Verheyen", "2026-09-01");
    const comp = await seedCompetition(env.DB, { name: "Beach Pro Tour", sport: "Beach volleyball", startDate: "2026-07-01" });
    const teamId = await seedTeamResult(env.DB, { competitionId: comp, sport: "Beach volleyball", event: "Women", place: 5, roster: [member] });

    const saved = await post(`/curate/teams/${teamId}/status`, { intent: "save", kind: "dissolution", date: "2026-08-01", source: "FIVB", checkedOn: "2026-08-03" });

    expect(saved.headers.get("location")).toBe(`/teams/${teamId}`);
    expect(await listed("/athletes")).toEqual(["Katja Verheyen"]);
    expect(text(await page(`/teams/${teamId}`))).toContain("Inactive · dissolved 1 Aug 2026");
    expect(text(await page(`/teams/${teamId}`))).toContain("Source: FIVB · checked 3 Aug 2026");
  });

  it("offers the status form outside the Run sheet, for the owner only", async () => {
    const id = await athleteWithResultOn("Noor Vidts", "2026-09-01");

    const form = await page(`/curate/athletes/${id}/status`);
    expect(form).toContain("Hold");
    expect(form).toContain("Retirement");
    expect(form).toContain("Change of sporting nationality");
    expect(await page(`/athletes/${id}`)).toContain(`href="/curate/athletes/${id}/status"`);
    expect((await getDeployed(`/curate/athletes/${id}/status`)).status).toBe(403);
  });

  it("refuses a fact without a date or source", async () => {
    const id = await athleteWithResultOn("Noor Vidts", "2026-09-01");

    const res = await post(`/curate/athletes/${id}/status`, { intent: "save", kind: "retirement", date: "", source: "x", checkedOn: "2026-11-14" });
    expect(res.status).toBe(400);
    const noSource = await post(`/curate/athletes/${id}/status`, { intent: "save", kind: "retirement", date: "2026-11-01", source: "", checkedOn: "2026-11-14" });
    expect(noSource.status).toBe(400);
    expect(await listed("/athletes")).toEqual(["Noor Vidts"]);
  });

  it("an inactive Entry at the previous edition no longer makes a competition a likely Participation", async () => {
    const listedOnCalendar = async (name: string) => {
      const html = await page("/calendar");
      const row = [...html.slice(html.indexOf("This month")).matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).find((r) => r.includes(name));
      return row?.trim();
    };
    const tas = await seedAthlete(env.DB, { name: "Sandrine Tas", sport: "Speed skating" });
    const previous = await seedCompetition(env.DB, { name: "World Cup, Calgary", sport: "Speed skating", startDate: "2026-01-20", series: "isu:world-cup:calgary" });
    await seedResult(env.DB, previous, tas, { date: "2026-01-20" });
    await seedCompetition(env.DB, { name: "World Cup, Calgary", sport: "Speed skating", startDate: "2026-11-20", series: "isu:world-cup:calgary" });
    expect(await listedOnCalendar("Calgary")).toContain("Likely: Belgian Entry at the previous edition");

    await post(`/curate/athletes/${tas}/status`, { intent: "save", kind: "retirement", date: "2026-03-01", source: "Press release", checkedOn: "2026-03-02" });

    expect(await listedOnCalendar("Calgary")).toBeUndefined();
  });
});
