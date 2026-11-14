import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { VOLLEYBALL_EUROVOLLEY_RUN, volleyballEuroVolleyRun } from "../fixtures/sources/fivb-volleyball";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #42: volleyball through the FIVB VIS web service,
// against a recorded run on the eve of the 2026 men's EuroVolley. National
// team results wait for Teams (#27): this source brings competitions and entry lists.
const VOLLEYBALL = "fivb-volleyball";
const job = { kind: "fetch-source", source: VOLLEYBALL } as const;

async function euroVolleyRun() {
  fixClock(VOLLEYBALL_EUROVOLLEY_RUN.now);
  stubOutboundFetch(volleyballEuroVolleyRun);
  return deliverIngestJobs([job]);
}

async function sourceRow() {
  return (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, VOLLEYBALL) }))!;
}

describe("FIVB volleyball source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, VOLLEYBALL, { lastSuccessAt: VOLLEYBALL_EUROVOLLEY_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
  });

  it("is an Automatic source fetched daily", async () => {
    const source = await sourceRow();
    expect(source.tier).toBe("automatic");
    expect(source.cadenceDays).toBe(1);
  });

  it("lists the EuroVolley a registered Belgian is entered for under Upcoming, and remembers his FIVB ID", async () => {
    const baetens = await seedAthlete(env.DB, { name: "Seppe BAETENS", sport: "Volleyball", dateOfBirth: "1989-02-13" });

    const result = await euroVolleyRun();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await (await get(`/athletes/${baetens}`)).text();
    const upcoming = html.slice(html.indexOf("<h2>Upcoming</h2>"), html.indexOf("<h2>Results</h2>"));
    expect(upcoming).toContain("CEV EuroVolley 2026 | Men");
    expect(upcoming).toContain("9 Sept–26 Sept");
    expect(html).toContain("119454");
  });

  it("keeps the senior national-team tournaments where Belgians are registered, finished ones included", async () => {
    await euroVolleyRun();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind })
      .from(schema.competition);
    expect(competitions.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "CEV EuroVolley 2026 | Men", kind: "championship" },
      { name: "CEV EuroVolley 2026 | Women", kind: "championship" },
    ]);
    // Tournaments outside Europe, tests, club, age-group and later events are never asked for.
    const listed = await env.RAW.list({ prefix: `raw/${VOLLEYBALL}/`, include: ["customMetadata"] });
    expect(listed.objects.map((o) => o.customMetadata?.url).sort()).toEqual(volleyballEuroVolleyRun.map((r) => r.url).sort());
  });

  it("stamps the source's health", async () => {
    await euroVolleyRun();

    const source = await sourceRow();
    expect(source.lastSuccessAt).toBe(VOLLEYBALL_EUROVOLLEY_RUN.now);
    expect(source.lastChangeAt).toBe(VOLLEYBALL_EUROVOLLEY_RUN.now);
    expect(source.blockedAt).toBeNull();
  });

  it("writes Belgium's final place at an ended tournament to the national Team, with the registered Belgians as its roster", async () => {
    const debouck = await seedAthlete(env.DB, { name: "Noor Debouck", sport: "Volleyball", dateOfBirth: "2005-06-09" });

    await euroVolleyRun();

    const html = await (await get(`/athletes/${debouck}`)).text();
    const results = html.slice(html.indexOf("<h2>Results</h2>"));
    expect(results).toContain("CEV EuroVolley 2026 | Women");
    expect(results).toContain("9th");
    const team = results.match(/href="\/teams\/([^"]+)"[^>]*>Belgium · Women</)?.[1];
    expect(team).toBeDefined();
    const roster = await (await get(`/teams/${team}`)).text();
    for (const name of ["Saar Bertels", "Noor Debouck", "Janne Deleu", "Nel Demeyer"]) expect(roster).toContain(name);
    expect(roster).not.toContain("Marie Bruckner");
    // The men's EuroVolley has not started: no result, no Team.
    expect(await getDb(env.DB).$count(schema.result)).toBe(1);
  });
});
