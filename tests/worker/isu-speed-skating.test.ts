import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import {
  ISU_JANUARY_2026_RUN,
  ISU_WORLD_CUP_1_RUN,
  isuJanuary2026Run,
  isuWorldCup1Run,
} from "../fixtures/sources/isu-speed-skating";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get, post } from "../support/worker";

// Spec #20, Ingest; ticket #23: the first Automatic source end to end, against
// a recorded run of the ISU Results API during World Cup #1 (14 Nov 2026).
const ISU = "isu-speed-skating";
const job = { kind: "fetch-source", source: ISU } as const;

async function runWorldCup1() {
  fixClock(ISU_WORLD_CUP_1_RUN.now);
  stubOutboundFetch(isuWorldCup1Run);
  return deliverIngestJobs([job]);
}

async function athletePage(id: string) {
  return (await get(`/athletes/${id}`)).text();
}

async function sourceRow() {
  return (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, ISU) }))!;
}

async function queuedItem(isuId: string) {
  return (await getDb(env.DB).query.mergeQueueItem.findFirst({ where: eq(schema.mergeQueueItem.value, isuId) }))!;
}

describe("ISU speed skating source", () => {
  // Storage is shared by the tests in a file: start each from the state after yesterday's run.
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, ISU, {
      lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt,
      lastChangeAt: null,
      lastFailureAt: null,
      lastError: null,
      blockedAt: null,
      blockedReason: null,
    });
  });

  it("puts a Belgian's official result on her Athlete page as place and performance", async () => {
    const vanhoutte = await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating", dateOfBirth: "2003-05-24" });

    const result = await runWorldCup1();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await athletePage(vanhoutte);
    const results = html.slice(html.indexOf("<h2>Results</h2>"));
    expect(results).toContain("ISU CNSG Speed Skating World Cup #1");
    expect(results).toContain("1000m Women");
    expect(results).toContain("17th");
    expect(results).toContain("1:18.060");
    expect(results).toContain("13 Nov");
  });

  it("lists the competitions a Belgian is entered for under Upcoming, above the results", async () => {
    const swings = await seedAthlete(env.DB, {
      name: "Bart Swings",
      sport: "Speed skating",
      externalIds: [{ scheme: "isu", value: "692" }],
    });

    await runWorldCup1();

    const html = await athletePage(swings);
    const upcoming = html.slice(html.indexOf("<h2>Upcoming</h2>"), html.indexOf("<h2>Results</h2>"));
    expect(upcoming).toContain("ISU CNSG Speed Skating World Cup #1");
    expect(upcoming).toContain("13 Nov–15 Nov");
    expect(upcoming).toContain("Beijing");
    // World Cup #2 has no competitors list yet, so nobody is entered.
    expect(upcoming).not.toContain("World Cup #2");
    // His 1500m was still live: no official result yet.
    expect(html.slice(html.indexOf("<h2>Results</h2>"))).toContain("No results yet.");
  });

  it("remembers the ISU ID of an Athlete matched on name and date of birth", async () => {
    const vanhoutte = await seedAthlete(env.DB, { name: "Fran VANHOUTTE", sport: "Speed skating", dateOfBirth: "2003-05-24" });

    await runWorldCup1();

    expect(await athletePage(vanhoutte)).toContain("ISU 1575");
  });

  it("sends a Belgian it cannot match to the merge queue instead of creating an Athlete", async () => {
    await runWorldCup1();

    const queue = await (await get("/curate/run/merge-queue")).text();
    expect(queue).toContain("Indra Medard");
    expect(queue).toContain("4 Oct 1998");
    expect(queue).toContain("ISU 2049");
    expect(await (await get("/athletes")).text()).not.toContain("Indra Medard");
  });

  it("makes a queued Belgian an Athlete, with his results, once the owner resolves the identity", async () => {
    await runWorldCup1();

    const res = await post("/curate/run/merge-queue", { item: (await queuedItem("2049")).id, intent: "create" });

    expect(res.status).toBe(303);
    const list = await (await get("/athletes")).text();
    const id = list.match(/href="\/athletes\/([^"]+)"[^>]*>Indra Medard/)?.[1];
    expect(id).toBeDefined();
    const html = await athletePage(id!);
    expect(html).toContain("Speed skating");
    expect(html).toContain("Athlete since 2026 (ISU CNSG Speed Skating World Cup #1)");
    expect(html).toContain("ISU 2049");
    expect(html).toContain("1500m Men Division B");
    expect(html).toContain("18th");
    expect(html).toContain("1:49.423");
    expect(await (await get("/curate/run/merge-queue")).text()).not.toContain("ISU 2049");
  });

  it("links a queued identity to an existing Athlete, who then gets the results", async () => {
    await runWorldCup1();
    const medard = await seedAthlete(env.DB, { name: "Indra Médard", sport: "Speed skating" });

    await post("/curate/run/merge-queue", { item: (await queuedItem("2049")).id, intent: "link", athlete: medard });

    const html = await athletePage(medard);
    expect(html).toContain("ISU 2049");
    expect(html).toContain("1500m Men Division B");
  });

  it("leaves an identity marked not an Athlete off the roster, also on later runs", async () => {
    await runWorldCup1();
    await post("/curate/run/merge-queue", { item: (await queuedItem("2049")).id, intent: "not-an-athlete" });

    await setSource(env.DB, ISU, { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt });
    await runWorldCup1();

    expect(await (await get("/curate/run/merge-queue")).text()).not.toContain("ISU 2049");
    expect(await (await get("/athletes")).text()).not.toContain("Indra Medard");
  });

  it("keeps every fetch as received in R2 and links each written row to the raw copy it came from", async () => {
    await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating", dateOfBirth: "2003-05-24" });

    await runWorldCup1();

    const listed = await env.RAW.list({ prefix: `raw/${ISU}/`, include: ["customMetadata"] });
    expect(listed.objects.map((o) => o.customMetadata?.url).sort()).toEqual(isuWorldCup1Run.map((r) => r.url).sort());
    for (const o of listed.objects) expect(o.customMetadata?.fetchedAt).toBe(ISU_WORLD_CUP_1_RUN.now);

    const db = getDb(env.DB);
    const [row] = await db
      .select({ url: schema.rawCopy.url, r2Key: schema.rawCopy.r2Key })
      .from(schema.result)
      .innerJoin(schema.rawCopy, eq(schema.result.rawCopyId, schema.rawCopy.id))
      .where(eq(schema.result.event, "1000m Women"));
    expect(row.url).toBe("https://api.isuresults.eu/events/2027_CHN_0001/competitions/7/results/");
    expect(await (await env.RAW.get(row.r2Key))!.text()).toContain('"lastName":"Vanhoutte"');
    const [competition] = await db
      .select({ url: schema.rawCopy.url })
      .from(schema.competition)
      .innerJoin(schema.rawCopy, eq(schema.competition.rawCopyId, schema.rawCopy.id))
      .where(eq(schema.competition.sourceRef, "2027_CHN_0001"));
    expect(competition.url).toBe("https://api.isuresults.eu/events/?category=senior&endGte=2026-11-12&pageSize=200");
  });

  it("files each competition under its series, so the next edition can find the previous one", async () => {
    await runWorldCup1();

    const rows = await getDb(env.DB).select({ ref: schema.competition.sourceRef, series: schema.competition.series }).from(schema.competition);
    const series = Object.fromEntries(rows.map((r) => [r.ref, r.series]));
    // World Cup legs recur by venue city; sponsor names and leg numbers change every season.
    expect(series["2027_CHN_0001"]).toBe("isu:world-cup:beijing");
    expect(series["2027_CAN_0003"]).toBe("isu:world-cup:calgary");
    // Europeans and Worlds are separate Championships.
    expect(series["2027_NED_0002"]).toBe("isu:european-championships");
    expect(series["2027_CHN_0002"]).toBe("isu:world-championships");
  });

  it("writes Belgian rows only", async () => {
    await runWorldCup1();

    const results = await getDb(env.DB).select().from(schema.result);
    // Vanhoutte (1000m Women) and Medard (1500m Men B); the 1000m Men had no Belgian.
    expect(results.map((r) => r.event).sort()).toEqual(["1000m Women", "1500m Men Division B"]);
  });

  it("stamps the source's health: last successful fetch, and last data change only when something changed", async () => {
    await runWorldCup1();
    let source = await sourceRow();
    expect(source.lastSuccessAt).toBe(ISU_WORLD_CUP_1_RUN.now);
    expect(source.lastChangeAt).toBe(ISU_WORLD_CUP_1_RUN.now);

    // An hour later the same payloads come back: fetched fine, nothing changed.
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt });
    fixClock("2026-11-14T13:00:00.000Z");
    await deliverIngestJobs([job]);

    source = await sourceRow();
    expect(source.lastSuccessAt).toBe("2026-11-14T13:00:00.000Z");
    expect(source.lastChangeAt).toBe(ISU_WORLD_CUP_1_RUN.now);
    expect(source.blockedAt).toBeNull();
  });

  it("leaves out national events such as Olympic trials, and records the Games as the Games", async () => {
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_JANUARY_2026_RUN.lastSuccessAt });
    fixClock(ISU_JANUARY_2026_RUN.now);
    stubOutboundFetch(isuJanuary2026Run);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, zone: schema.competition.venueZone, series: schema.competition.series })
      .from(schema.competition);
    expect(competitions).toEqual([{ name: "Olympic Games Milano Cortina", kind: "games", zone: "Europe/Rome", series: "olympic-games" }]);
  });

  it("flags a source that refuses the Worker as blocked (dropped to Assisted), without retrying it", async () => {
    fixClock(ISU_WORLD_CUP_1_RUN.now);
    stubOutboundFetch([{ url: isuWorldCup1Run[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect(result.retryMessages).toEqual([]);
    const source = await sourceRow();
    expect(source.blockedAt).toBe(ISU_WORLD_CUP_1_RUN.now);
    expect(source.blockedReason).toContain("403");
    expect(source.lastSuccessAt).toBe(ISU_WORLD_CUP_1_RUN.lastSuccessAt);
    const page = await (await get("/curate/run/source-health")).text();
    expect(page).toMatch(/ISU speed skating.*?Assisted.*?blocked/s);
  });

  it("retries a source that is temporarily down, noting the failure", async () => {
    fixClock(ISU_WORLD_CUP_1_RUN.now);
    stubOutboundFetch([{ url: isuWorldCup1Run[0].url, status: 503, body: "" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.retryMessages.map((m) => m.msgId)).toEqual(["msg-1"]);
    const source = await sourceRow();
    expect(source.lastFailureAt).toBe(ISU_WORLD_CUP_1_RUN.now);
    expect(source.lastError).toContain("503");
    expect(source.blockedAt).toBeNull();
    expect(source.lastSuccessAt).toBe(ISU_WORLD_CUP_1_RUN.lastSuccessAt);
    expect((await env.RAW.list({ prefix: `raw/${ISU}/` })).objects).toHaveLength(0);
  });
});
