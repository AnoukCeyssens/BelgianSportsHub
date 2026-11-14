import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { ROWING_BEACH_SPRINT_RUN, rowingBeachSprintRun } from "../fixtures/sources/world-rowing";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #43: World Rowing through its site's undocumented
// JSON:API, against a recorded run after the Beach Sprint Finals (Oct 2026).
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

  it("writes one row per Belgian sculler and event, and none for crews", async () => {
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
});
