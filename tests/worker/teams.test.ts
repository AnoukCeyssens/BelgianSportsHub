import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { ISU_TEAM_PURSUIT_RUN, isuTeamPursuitRun } from "../fixtures/sources/isu-speed-skating";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedCompetition, seedTeamResult, setSource } from "../support/seed";
import { deliverIngestJobs, get, post } from "../support/worker";

// Ticket #27 (spec #20 stories 9–15, 33; ADR 0001): every multi-athlete entry
// is a Team with a roster per competition. Ingested end to end from a recorded
// ISU run with two team pursuits (World Cup #1, Salt Lake City, Nov 2025).
const ISU = "isu-speed-skating";
const job = { kind: "fetch-source", source: ISU } as const;

async function runTeamPursuits() {
  fixClock(ISU_TEAM_PURSUIT_RUN.now);
  stubOutboundFetch(isuTeamPursuitRun);
  return deliverIngestJobs([job]);
}

async function page(path: string) {
  return (await get(path)).text();
}

async function teamId(name: string) {
  return (await getDb(env.DB).query.team.findFirst({ where: eq(schema.team.name, name) }))?.id;
}

/** The Results section of a page. */
const resultsOf = (html: string) => html.slice(html.indexOf("<h2>Results</h2>"));

async function seedWomen() {
  return {
    vanhoutte: await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating", externalIds: [{ scheme: "isu", value: "1575" }] }),
    vanElst: await seedAthlete(env.DB, { name: "Isabelle Van Elst", sport: "Speed skating", externalIds: [{ scheme: "isu", value: "1142" }] }),
    // Matched on name + date of birth.
    tas: await seedAthlete(env.DB, { name: "Sandrine Tas", sport: "Speed skating", dateOfBirth: "1995-09-07" }),
  };
}

describe("Teams and rosters", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_TEAM_PURSUIT_RUN.lastSuccessAt, blockedAt: null, blockedReason: null });
  });

  it("writes a team pursuit result to Belgium's Team, with the roster the official result credits", async () => {
    await seedWomen();

    const { explicitAcks } = await runTeamPursuits();

    expect(explicitAcks).toEqual(["msg-1"]);
    const id = await teamId("Belgium · Team Pursuit Women");
    expect(id).toBeDefined();
    const html = await page(`/teams/${id}`);
    expect(html).toContain("<h1>Belgium · Team Pursuit Women</h1>");
    expect(html).toContain("Speed skating");
    const results = resultsOf(html);
    expect(results).toContain("ISU Speed Skating World Cup #1");
    expect(results).toContain("Team Pursuit Women Division B");
    expect(results).toContain("2nd");
    expect(results).toContain("2:58.389");
    for (const name of ["Fran Vanhoutte", "Isabelle Van Elst", "Sandrine Tas"]) expect(results).toMatch(new RegExp(`href="/athletes/[^"]+"[^>]*>${name}<`));
    expect(results).not.toContain("Kazakhstan");
  });

  it("shows the Team result on every roster member's Athlete page, linked to the Team", async () => {
    const { vanhoutte, tas } = await seedWomen();

    await runTeamPursuits();

    const id = await teamId("Belgium · Team Pursuit Women");
    for (const athlete of [vanhoutte, tas]) {
      const results = resultsOf(await page(`/athletes/${athlete}`));
      expect(results).toContain("Team Pursuit Women Division B");
      expect(results).toContain("2nd");
      expect(results).toMatch(new RegExp(`href="/teams/${id}"[^>]*>Belgium · Team Pursuit Women</a>`));
    }
  });

  it("counts a Team performance as each matched member's senior international performance", async () => {
    const { tas } = await seedWomen();

    await runTeamPursuits();

    expect(await page(`/athletes/${tas}`)).toContain("Athlete since 2025 (ISU Speed Skating World Cup #1)");
    // Tas was matched on name + date of birth: her ISU ID is remembered.
    expect(await page(`/athletes/${tas}`)).toContain("ISU 1750");
  });

  it("sends roster members it cannot match to the merge queue, and credits them once resolved", async () => {
    await runTeamPursuits();

    const queue = await page("/curate/run/merge-queue");
    for (const name of ["Bart Swings", "Indra Medard", "Mathias Vosté", "Daan Van Der Elst"]) expect(queue).toContain(name);
    const men = await teamId("Belgium · Team Pursuit Men");
    // Unresolved members are on the roster by name, not as Athletes.
    const roster = resultsOf(await page(`/teams/${men}`));
    expect(roster).toContain("Daan Van Der Elst");
    expect(roster).not.toMatch(/href="\/athletes\/[^"]+"[^>]*>Daan Van Der Elst/);

    const item = (await getDb(env.DB).query.mergeQueueItem.findFirst({ where: eq(schema.mergeQueueItem.value, "2124") }))!;
    await post("/curate/run/merge-queue", { item: item.id, intent: "create" });

    const list = await page("/athletes?q=daan");
    const athlete = list.match(/href="\/athletes\/([^"]+)"[^>]*>Daan Van Der Elst/)?.[1];
    expect(athlete).toBeDefined();
    const html = await page(`/athletes/${athlete}`);
    expect(html).toContain("Athlete since 2025 (ISU Speed Skating World Cup #1)");
    expect(resultsOf(html)).toMatch(new RegExp(`href="/teams/${men}"[^>]*>Belgium · Team Pursuit Men</a>`));
    expect(resultsOf(html)).toContain("7th");
    expect(resultsOf(await page(`/teams/${men}`))).toMatch(new RegExp(`href="/athletes/${athlete}"[^>]*>Daan Van Der Elst<`));
  });

  it("updates the same Team result on a re-fetch instead of duplicating it", async () => {
    await seedWomen();
    await runTeamPursuits();
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_TEAM_PURSUIT_RUN.lastSuccessAt });

    await runTeamPursuits();

    const teams = await getDb(env.DB).select().from(schema.team);
    expect(teams.map((t) => t.name).sort()).toEqual(["Belgium · Team Pursuit Men", "Belgium · Team Pursuit Women"]);
    const results = await getDb(env.DB).select().from(schema.result);
    expect(results).toHaveLength(2);
    expect(await getDb(env.DB).select().from(schema.rosterMember)).toHaveLength(7);
  });

  it("finds Teams in search next to Athletes", async () => {
    await runTeamPursuits();

    const html = await page("/athletes?q=pursuit");
    expect(html).toMatch(/href="\/teams\/[^"]+"[^>]*>Belgium · Team Pursuit Men</);
    expect(html).toMatch(/href="\/teams\/[^"]+"[^>]*>Belgium · Team Pursuit Women</);
  });

  it("confirms Belgium's Participation through a Team result, and makes the next edition likely", async () => {
    fixClock("2026-11-14T12:00:00.000Z");
    const a = await seedAthlete(env.DB, { name: "Relay Runner A", sport: "Athletics" });
    const thisYear = await seedCompetition(env.DB, {
      name: "Relay Meeting 2026",
      sport: "Athletics",
      source: "manual",
      startDate: "2026-11-07",
      endDate: "2026-11-08",
      series: "test:relay-meeting",
    });
    await seedTeamResult(env.DB, { competitionId: thisYear, sport: "Athletics", event: "4x100m Women", place: 5, roster: [a] });
    const lastYear = await seedCompetition(env.DB, {
      name: "Relay Meeting 2025",
      sport: "Athletics",
      source: "manual",
      startDate: "2025-11-21",
      endDate: "2025-11-22",
      series: "test:relay-meeting-late",
    });
    await seedTeamResult(env.DB, { competitionId: lastYear, sport: "Athletics", event: "4x400m Women", place: 5, roster: [a] });
    await seedCompetition(env.DB, {
      name: "Relay Meeting Late 2026",
      sport: "Athletics",
      source: "manual",
      startDate: "2026-11-21",
      endDate: "2026-11-22",
      series: "test:relay-meeting-late",
    });

    const text = (await page("/calendar")).replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(text).toContain("Relay Meeting 2026 Athletics · Confirmed · Belgium · 4x100m Women");
    expect(text).toContain("Relay Meeting Late 2026 Athletics · Likely: Belgian Entry at the previous edition");
  });

  it("counts a Team medal on each roster member's record, and once on the Team's", async () => {
    const a = await seedAthlete(env.DB, { name: "Relay Runner A", sport: "Athletics" });
    const b = await seedAthlete(env.DB, { name: "Relay Runner B", sport: "Athletics" });
    const euros = await seedCompetition(env.DB, {
      name: "European Athletics Championships",
      sport: "Athletics",
      source: "manual",
      startDate: "2026-08-10",
      endDate: "2026-08-16",
      kind: "championship",
    });
    const relay = await seedTeamResult(env.DB, {
      competitionId: euros,
      sport: "Athletics",
      event: "4x400m Mixed",
      place: 2,
      roster: [a, b],
    });

    for (const athlete of [a, b]) expect(await page(`/athletes/${athlete}`)).toContain("Medals: 1 silver");
    expect(await page(`/teams/${relay}`)).toContain("Medals: 1 silver");
  });
});
