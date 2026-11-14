import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import {
  TRIATHLON_WORLD_CUP_RUN,
  triathlonRefusedRun,
  triathlonWorldCupRun,
} from "../fixtures/sources/world-triathlon";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #42: World Triathlon's API (free key, sent as a
// header) as an Automatic source. No key was available, so the happy path runs
// against payloads built from the documented response shapes, and the refusal
// against what api.triathlon.org really answers without a key.
const TRIATHLON = "world-triathlon";
const job = { kind: "fetch-source", source: TRIATHLON } as const;
const KEY = { WORLD_TRIATHLON_API_KEY: "test-key" };

async function worldCupRun() {
  fixClock(TRIATHLON_WORLD_CUP_RUN.now);
  const fetch = stubOutboundFetch(triathlonWorldCupRun);
  return { result: await deliverIngestJobs([job], KEY), fetch };
}

async function sourceRow() {
  return (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, TRIATHLON) }))!;
}

describe("World Triathlon source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, TRIATHLON, {
      lastSuccessAt: TRIATHLON_WORLD_CUP_RUN.lastSuccessAt,
      lastChangeAt: null,
      lastFailureAt: null,
      lastError: null,
      blockedAt: null,
      blockedReason: null,
    });
  });

  it("is an Automatic source fetched daily", async () => {
    const source = await sourceRow();
    expect(source.tier).toBe("automatic");
    expect(source.cadenceDays).toBe(1);
  });

  it("stays blocked (Assisted) without an API key, without asking World Triathlon anything", async () => {
    fixClock(TRIATHLON_WORLD_CUP_RUN.now);
    const fetch = stubOutboundFetch([]);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect(fetch).not.toHaveBeenCalled();
    const source = await sourceRow();
    expect(source.blockedAt).toBe(TRIATHLON_WORLD_CUP_RUN.now);
    expect(source.blockedReason).toContain("WORLD_TRIATHLON_API_KEY");
    expect(await (await get("/curate/run/source-health")).text()).toMatch(/World Triathlon.*?Assisted.*?blocked/s);
  });

  it("is flagged blocked when api.triathlon.org refuses the key", async () => {
    fixClock(TRIATHLON_WORLD_CUP_RUN.now);
    stubOutboundFetch(triathlonRefusedRun);

    const result = await deliverIngestJobs([job], KEY);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect(result.retryMessages).toEqual([]);
    const source = await sourceRow();
    expect(source.blockedAt).toBe(TRIATHLON_WORLD_CUP_RUN.now);
    expect(source.blockedReason).toContain("401");
  });

  it("sends the key in a header, never in the URL kept with the raw copy", async () => {
    const { fetch } = await worldCupRun();

    for (const [url, init] of fetch.mock.calls) {
      expect(String(url)).not.toContain("test-key");
      expect(new Headers(init?.headers).get("apikey")).toBe("test-key");
    }
    const listed = await env.RAW.list({ prefix: `raw/${TRIATHLON}/`, include: ["customMetadata"] });
    expect(listed.objects.map((o) => o.customMetadata?.url).sort()).toEqual(triathlonWorldCupRun.map((r) => r.url).sort());
  });

  it("puts a Belgian's Elite race place and time on his Athlete page", async () => {
    const voorbeeld = await seedAthlete(env.DB, {
      name: "Jules Voorbeeld",
      sport: "Triathlon",
      externalIds: [{ scheme: "world-triathlon", value: "390002" }],
    });

    const { result } = await worldCupRun();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const results = (await (await get(`/athletes/${voorbeeld}`)).text()).split("<h2>Results</h2>")[1];
    expect(results).toContain("2026 World Triathlon Cup Exampleton");
    expect(results).toContain("Elite Men");
    expect(results).toContain("14th");
    expect(results).toContain("00:52:10");
  });

  it("writes Belgian performances only, DNF included and DNS left out, and the start list behind Upcoming", async () => {
    const lotte = await seedAthlete(env.DB, {
      name: "Lotte Voorbeeld",
      sport: "Triathlon",
      externalIds: [{ scheme: "world-triathlon", value: "390011" }],
    });

    await worldCupRun();

    const results = await getDb(env.DB)
      .select({ ref: schema.result.sourceRef, status: schema.result.status, place: schema.result.place })
      .from(schema.result);
    expect(results.sort((a, b) => a.ref.localeCompare(b.ref))).toEqual([
      { ref: "490002", status: "finished", place: 14 },
      { ref: "490003", status: "DNF", place: null },
      { ref: "490102", status: "finished", place: 6 },
    ]);
    const competitions = await getDb(env.DB).select({ name: schema.competition.name, kind: schema.competition.kind }).from(schema.competition);
    expect(competitions).toEqual([{ name: "2026 World Triathlon Cup Exampleton", kind: "circuit" }]);
    const html = await (await get(`/athletes/${lotte}`)).text();
    expect(html.slice(html.indexOf("<h2>Upcoming</h2>"), html.indexOf("<h2>Results</h2>"))).toContain(
      "2026 World Triathlon Cup Exampleton",
    );
    expect((await sourceRow()).lastSuccessAt).toBe(TRIATHLON_WORLD_CUP_RUN.now);
  });

  it("writes the mixed relay to Belgium's relay Team, on every member's Athlete page", async () => {
    const lotte = await seedAthlete(env.DB, { name: "Lotte Voorbeeld", sport: "Triathlon", externalIds: [{ scheme: "world-triathlon", value: "390011" }] });

    await worldCupRun();

    const html = await (await get(`/athletes/${lotte}`)).text();
    const results = html.slice(html.indexOf("<h2>Results</h2>"));
    expect(results).toContain("Mixed Relay");
    expect(results).toContain("6th");
    expect(results).toContain("01:22:05");
    const team = results.match(/href="\/teams\/([^"]+)"[^>]*>Belgium · Mixed Relay</)?.[1];
    expect(team).toBeDefined();
    const page = await (await get(`/teams/${team}`)).text();
    for (const name of ["Lotte Voorbeeld", "Jules Voorbeeld", "Mira Exemplaar", "Arno Specimen"]) expect(page).toContain(name);
    expect(page).not.toContain("Tom Exemplar");
  });
});
