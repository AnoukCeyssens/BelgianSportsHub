import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import {
  FIS_ALPINE_RUN,
  FIS_SNOWBOARD_RUN,
  fisAlpineListsOnly,
  fisAlpineRun,
  fisSnowboardRun,
} from "../fixtures/sources/fis-points-lists";
import alpineZip from "../fixtures/sources/fis-points-lists/ALFP2027F.zip?bytes";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get, runScheduled } from "../support/worker";

// Spec #20, Ingest; ticket #44: alpine, cross-country, freestyle and snowboard
// from the public FIS points-list ZIPs, weekly, against recorded runs of
// 14 Nov 2026.
const ALPINE = "fis-alpine";
const SNOWBOARD = "fis-snowboard";
const FIS_SOURCES = ["fis-alpine", "fis-cross-country", "fis-freestyle", "fis-snowboard"];

async function runAlpine() {
  fixClock(FIS_ALPINE_RUN.now);
  stubOutboundFetch(fisAlpineRun);
  return deliverIngestJobs([{ kind: "fetch-source", source: ALPINE }]);
}

async function runSnowboard() {
  fixClock(FIS_SNOWBOARD_RUN.now);
  stubOutboundFetch(fisSnowboardRun);
  return deliverIngestJobs([{ kind: "fetch-source", source: SNOWBOARD }]);
}

async function athletePage(id: string) {
  const html = await (await get(`/athletes/${id}`)).text();
  return html.slice(html.indexOf("<h2>Results</h2>"));
}

async function sourceRow(key: string) {
  return (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, key) }))!;
}

async function results() {
  return getDb(env.DB)
    .select({ event: schema.result.event, date: schema.result.date, place: schema.result.place, status: schema.result.status })
    .from(schema.result)
    .orderBy(schema.result.date, schema.result.event, schema.result.place);
}

describe("FIS points-list sources", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    for (const key of FIS_SOURCES) {
      await setSource(env.DB, key, { lastSuccessAt: null, lastChangeAt: null, lastError: null, blockedAt: null });
    }
    await setSource(env.DB, ALPINE, { lastSuccessAt: FIS_ALPINE_RUN.lastSuccessAt });
  });

  it("are four Automatic sources fetched weekly, the cadence being data on their Source rows", async () => {
    const rows = await getDb(env.DB).select().from(schema.source);
    const fis = rows.filter((r) => r.key.startsWith("fis-") && r.tier === "automatic");
    expect(fis.map((r) => [r.key, r.tier, r.cadenceDays]).sort()).toEqual(FIS_SOURCES.map((key) => [key, "automatic", 7]));

    // Alpine last succeeded a week ago and is due; snowboard succeeded yesterday and waits.
    await setSource(env.DB, SNOWBOARD, { lastSuccessAt: "2026-11-13T04:00:00.000Z" });
    const queued = await runScheduled("0 4 * * *", FIS_ALPINE_RUN.now);
    expect(queued).toContainEqual({ kind: "fetch-source", source: ALPINE });
    expect(queued).not.toContainEqual({ kind: "fetch-source", source: SNOWBOARD });
  });

  it("puts a Belgian's World Cup result on his Athlete page as place and time", async () => {
    const maes = await seedAthlete(env.DB, { name: "Sam Maes", sport: "Alpine skiing", dateOfBirth: "1998-06-07" });

    const run = await runAlpine();

    expect(run.explicitAcks).toEqual(["msg-1"]);
    const html = await athletePage(maes);
    expect(html).toContain("Audi FIS Ski World Cup");
    expect(html).toContain("Men&#x27;s Giant Slalom");
    expect(html).toContain("20th");
    expect(html).toContain("1:46.44");
    expect(html).toContain("25 Oct");
  });

  it("keeps senior World Cup and continental cup races only, with DNFs but without DNS", async () => {
    await runAlpine();

    // Sölden (WC), Ushuaia (SAC) and the ANC; not the FIS races, NJRs, NZL Nationals or Entry League.
    expect(await results()).toEqual([
      { event: "Men's Slalom", date: "2026-08-19", place: null, status: "DNF" },
      { event: "Men's Slalom", date: "2026-08-20", place: null, status: "DNF" },
      { event: "Men's Slalom", date: "2026-08-20", place: 23, status: "finished" },
      { event: "Men's Slalom", date: "2026-08-21", place: 17, status: "finished" },
      { event: "Men's Slalom", date: "2026-09-06", place: 11, status: "finished" },
      { event: "Men's Giant Slalom", date: "2026-10-25", place: 20, status: "finished" },
    ]);
    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, city: schema.competition.city, zone: schema.competition.venueZone })
      .from(schema.competition)
      .orderBy(schema.competition.startDate, schema.competition.city);
    expect(competitions).toEqual([
      { name: "Alpine Skiing South American Cup – Cerro Castor", kind: "circuit", city: "Cerro Castor, Ushuaia", zone: "America/Argentina/Buenos_Aires" },
      { name: "Alpine Skiing Australian New Zealand Cup – Australia New Zealand Cup", kind: "circuit", city: "Mt Hutt", zone: "Pacific/Auckland" },
      { name: "Alpine Skiing Australian New Zealand Cup – Australia New Zealand Cup", kind: "circuit", city: "Coronet Peak", zone: "Pacific/Auckland" },
      { name: "Audi FIS Ski World Cup", kind: "circuit", city: "Soelden", zone: "Europe/Vienna" },
    ]);
  });

  it("remembers the FIS code of an Athlete matched on name and date of birth", async () => {
    const maes = await seedAthlete(env.DB, { name: "Sam MAES", sport: "Alpine skiing", dateOfBirth: "1998-06-07" });

    await runAlpine();

    expect(await (await get(`/athletes/${maes}`)).text()).toContain("FIS 60261");
  });

  it("sends a Belgian it cannot match to the merge queue", async () => {
    await runAlpine();

    const queue = await (await get("/curate/run/merge-queue")).text();
    expect(queue).toContain("Nicolas Hotermans");
    expect(queue).toContain("31 Jan 2002");
    expect(queue).toContain("FIS 60297");
    expect(await (await get("/athletes?q=nicolas")).text()).not.toContain("Nicolas Hotermans");
  });

  it("keeps the ZIP in R2 exactly as received and links each written row to it", async () => {
    await runAlpine();

    const listed = await env.RAW.list({ prefix: `raw/${ALPINE}/`, include: ["customMetadata"] });
    expect(listed.objects.map((o) => o.customMetadata?.url).sort()).toEqual(fisAlpineRun.map((r) => r.url).sort());
    const [row] = await getDb(env.DB)
      .select({ url: schema.rawCopy.url, r2Key: schema.rawCopy.r2Key })
      .from(schema.result)
      .innerJoin(schema.rawCopy, eq(schema.result.rawCopyId, schema.rawCopy.id))
      .where(eq(schema.result.date, "2026-10-25"));
    expect(row.url).toBe("https://www.fis-ski.com/DB/v2/download/fis-list/ALFP2027F.zip");
    const kept = new Uint8Array(await (await env.RAW.get(row.r2Key))!.arrayBuffer());
    expect(kept).toEqual(alpineZip);
  });

  it("does not download a list it already ingested", async () => {
    // The last run (13 Nov) came after the 20th list became valid (12 Nov): only the page is read.
    await setSource(env.DB, ALPINE, { lastSuccessAt: "2026-11-13T04:00:00.000Z" });
    fixClock(FIS_ALPINE_RUN.now);
    stubOutboundFetch(fisAlpineListsOnly);

    const run = await deliverIngestJobs([{ kind: "fetch-source", source: ALPINE }]);

    expect(run.explicitAcks).toEqual(["msg-1"]);
    expect(await results()).toEqual([]);
    expect((await sourceRow(ALPINE)).lastSuccessAt).toBe(FIS_ALPINE_RUN.now);
  });

  it("stamps a change only when a run wrote something new", async () => {
    await runAlpine();
    expect((await sourceRow(ALPINE)).lastChangeAt).toBe(FIS_ALPINE_RUN.now);

    await setSource(env.DB, ALPINE, { lastSuccessAt: FIS_ALPINE_RUN.lastSuccessAt });
    fixClock("2026-11-14T05:00:00.000Z");
    await deliverIngestJobs([{ kind: "fetch-source", source: ALPINE }]);

    const source = await sourceRow(ALPINE);
    expect(source.lastSuccessAt).toBe("2026-11-14T05:00:00.000Z");
    expect(source.lastChangeAt).toBe(FIS_ALPINE_RUN.now);
  });

  it("reads a snowboard list the same way, with the European Cup in Antwerp", async () => {
    const frijns = await seedAthlete(env.DB, { name: "Joewen Frijns", sport: "Snowboard", dateOfBirth: "1998-05-07" });

    const run = await runSnowboard();

    expect(run.explicitAcks).toEqual(["msg-1"]);
    const html = await athletePage(frijns);
    expect(html).toContain("Snowboard European Cup");
    expect(html).toContain("Men&#x27;s Street Style");
    expect(html).toContain("1st");
    expect(await results()).toHaveLength(4);
    const [competition] = await getDb(env.DB).select().from(schema.competition);
    expect(competition).toMatchObject({ sport: "Snowboard", city: "Antwerpen", country: "BEL", startDate: "2026-10-24" });
  });

  it("flags a list that refuses the Worker as blocked (dropped to Assisted), without retrying it", async () => {
    fixClock(FIS_ALPINE_RUN.now);
    stubOutboundFetch([{ url: fisAlpineRun[0].url, status: 403, body: "Forbidden" }]);

    const run = await deliverIngestJobs([{ kind: "fetch-source", source: ALPINE }]);

    expect(run.retryMessages).toEqual([]);
    expect((await sourceRow(ALPINE)).blockedReason).toContain("403");
  });
});
