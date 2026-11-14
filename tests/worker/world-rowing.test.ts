import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { ROWING_BEACH_SPRINT_RUN, ROWING_CUP_1_RUN, rowingBeachSprintRun, rowingCup1Run } from "../fixtures/sources/world-rowing";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #43: World Rowing through its site's undocumented
// JSON:API, against recorded runs after the Beach Sprint Finals (Oct 2026)
// and World Rowing Cup I (May 2026; crews are Teams, ticket #27).
const ROWING = "world-rowing";
const job = { kind: "fetch-source", source: ROWING } as const;

async function runAfterBeachSprints() {
  fixClock(ROWING_BEACH_SPRINT_RUN.now);
  stubOutboundFetch(rowingBeachSprintRun);
  return deliverIngestJobs([job]);
}

describe("World Rowing source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, ROWING, { lastSuccessAt: ROWING_BEACH_SPRINT_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
  });

  it("puts a sculler knocked out before the finals on his Athlete page, matched on name and date of birth", async () => {
    const rodenburg = await seedAthlete(env.DB, { name: "Savin Rodenburg", sport: "Rowing", dateOfBirth: "2003-05-10" });

    const result = await runAfterBeachSprints();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await (await get(`/athletes/${rodenburg}`)).text();
    const results = html.slice(html.indexOf("<h2>Results</h2>"));
    expect(results).toContain("2026 World Rowing Beach Sprint Finals");
    expect(results).toContain("Coastal Men&#x27;s Solo");
    expect(results).toContain("eliminated");
    // His last race: the second time trial.
    expect(results).toContain("03:49.64");
    expect(results).toContain("19 Oct");
    expect(html).toContain("world-rowing");
  });

  it("writes one row per Belgian sculler and event", async () => {
    await runAfterBeachSprints();

    const rows = await getDb(env.DB).select({ event: schema.result.event, place: schema.result.place }).from(schema.result);
    expect(rows).toEqual([{ event: "Coastal Men's Solo", place: null }]);
  });

  it("keeps senior Championships, World Cups and the Games, not youth, masters or indoor events", async () => {
    await runAfterBeachSprints();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, city: schema.competition.city, country: schema.competition.country })
      .from(schema.competition);
    expect(competitions).toEqual([
      { name: "2026 World Rowing Beach Sprint Finals", kind: "championship", city: expect.any(String), country: expect.any(String) },
    ]);
  });

  it("flags the source as blocked (Assisted) when World Rowing refuses the Worker", async () => {
    fixClock(ROWING_BEACH_SPRINT_RUN.now);
    stubOutboundFetch([{ url: rowingBeachSprintRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.retryMessages).toEqual([]);
    const source = await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, ROWING) });
    expect(source?.blockedAt).toBe(ROWING_BEACH_SPRINT_RUN.now);
  });

  describe("crews", () => {
    beforeEach(async () => {
      await setSource(env.DB, ROWING, { lastSuccessAt: ROWING_CUP_1_RUN.lastSuccessAt });
    });

    async function runAfterCup1() {
      fixClock(ROWING_CUP_1_RUN.now);
      stubOutboundFetch(rowingCup1Run);
      return deliverIngestJobs([job]);
    }

    it("writes a Belgian crew's place to its Team, on every rower's Athlete page", async () => {
      const vyvey = await seedAthlete(env.DB, { name: "Tibo Vyvey", sport: "Rowing", dateOfBirth: "2000-12-16" });

      const result = await runAfterCup1();

      expect(result.explicitAcks).toEqual(["msg-1"]);
      const html = await (await get(`/athletes/${vyvey}`)).text();
      const results = html.slice(html.indexOf("<h2>Results</h2>"));
      expect(results).toContain("2026 World Rowing Cup I");
      expect(results).toContain("Men&#x27;s Double Sculls");
      expect(results).toContain("2nd");
      expect(results).toContain("06:18.82");
      const team = results.match(/href="\/teams\/([^"]+)"[^>]*>/)?.[1];
      expect(team).toBeDefined();
      const roster = await (await get(`/teams/${team}`)).text();
      expect(roster).toContain("Aaron ANDRIES");
    });

    it("gives each crew one result, its place from the final it reached, and each boat its own partnership Team", async () => {
      await runAfterCup1();

      const rows = await getDb(env.DB)
        .select({ event: schema.result.event, place: schema.result.place, status: schema.result.status, team: schema.team.name, kind: schema.team.kind })
        .from(schema.result)
        .innerJoin(schema.team, eq(schema.result.teamId, schema.team.id))
        .orderBy(schema.result.event);
      expect(rows).toEqual([
        { event: "Men's Double Sculls", place: 2, status: "finished", team: "Tibo VYVEY / Aaron ANDRIES", kind: "partnership" },
        {
          event: "Men's Quadruple Sculls",
          place: 11,
          status: "finished",
          team: "Boris TAELDEMAN / Lukas DEPLA / Marlon COLPAERT / Dean LAUREYNS",
          kind: "partnership",
        },
      ]);
      expect(await getDb(env.DB).$count(schema.rosterMember)).toBe(6);
    });
  });
});
