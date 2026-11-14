import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { BEACH_EUROS_RUN, beachEurosRun } from "../fixtures/sources/fivb-beach-volleyball";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #42: beach volleyball through the FIVB VIS web
// service, against a recorded run during the 2026 European Championships.
// Pair results wait for Teams (#27): this source brings competitions and entry lists.
const BEACH = "fivb-beach-volleyball";
const job = { kind: "fetch-source", source: BEACH } as const;

async function eurosRun() {
  fixClock(BEACH_EUROS_RUN.now);
  stubOutboundFetch(beachEurosRun);
  return deliverIngestJobs([job]);
}

async function sourceRow() {
  return (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, BEACH) }))!;
}

describe("FIVB beach volleyball source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, BEACH, { lastSuccessAt: BEACH_EUROS_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
  });

  it("is an Automatic source fetched daily", async () => {
    const source = await sourceRow();
    expect(source.tier).toBe("automatic");
    expect(source.cadenceDays).toBe(1);
  });

  it("lists the Championship a Belgian pair is playing under Upcoming, matched on name and date of birth", async () => {
    const vercauteren = await seedAthlete(env.DB, { name: "Kyan Vercauteren", sport: "Beach volleyball", dateOfBirth: "2004-04-08" });

    const result = await eurosRun();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await (await get(`/athletes/${vercauteren}`)).text();
    const upcoming = html.slice(html.indexOf("<h2>Upcoming</h2>"), html.indexOf("<h2>Results</h2>"));
    expect(upcoming).toContain("CEV EuroBeachVolley 2026 - Stare Jablonki M");
    expect(upcoming).toContain("12 Aug–16 Aug");
  });

  it("keeps only qualification-relevant tournaments where Belgians play", async () => {
    await eurosRun();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, sport: schema.competition.sport })
      .from(schema.competition);
    // Not the women's Euros or Busan (no Belgian pair), nor CAVB, U18 or national tour events.
    expect(competitions).toEqual([{ name: "CEV EuroBeachVolley 2026 - Stare Jablonki M", kind: "championship", sport: "Beach volleyball" }]);
    expect(await getDb(env.DB).$count(schema.result)).toBe(0);
  });

  it("keeps every fetch as received in R2, never asking for irrelevant tournaments, and stamps health", async () => {
    await eurosRun();

    const listed = await env.RAW.list({ prefix: `raw/${BEACH}/`, include: ["customMetadata"] });
    expect(listed.objects.map((o) => o.customMetadata?.url).sort()).toEqual(beachEurosRun.map((r) => r.url).sort());
    const source = await sourceRow();
    expect(source.lastSuccessAt).toBe(BEACH_EUROS_RUN.now);
    expect(source.lastChangeAt).toBe(BEACH_EUROS_RUN.now);
  });

  it("flags the source blocked (Assisted) when VIS refuses the Worker", async () => {
    fixClock(BEACH_EUROS_RUN.now);
    stubOutboundFetch([{ url: beachEurosRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect((await sourceRow()).blockedAt).toBe(BEACH_EUROS_RUN.now);
  });
});
