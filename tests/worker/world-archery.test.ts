import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { ARCHERY_FIRST_RUN, ARCHERY_JULY_2026_RUN, archeryFirstRun, archeryJuly2026Run } from "../fixtures/sources/world-archery";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #42: World Archery's public API as an Automatic
// source, against recorded runs (first run on 14 Nov 2026; daily run on 1 Jul 2026).
const ARCHERY = "world-archery";
const job = { kind: "fetch-source", source: ARCHERY } as const;

async function firstRun() {
  fixClock(ARCHERY_FIRST_RUN.now);
  stubOutboundFetch(archeryFirstRun);
  return deliverIngestJobs([job]);
}

async function julyRun() {
  await setSource(env.DB, ARCHERY, { lastSuccessAt: ARCHERY_JULY_2026_RUN.lastSuccessAt });
  fixClock(ARCHERY_JULY_2026_RUN.now);
  stubOutboundFetch(archeryJuly2026Run);
  return deliverIngestJobs([job]);
}

async function athletePage(id: string) {
  return (await get(`/athletes/${id}`)).text();
}

async function sourceRow() {
  return (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, ARCHERY) }))!;
}

describe("World Archery source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, ARCHERY, {
      lastSuccessAt: null,
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

  it("puts a Belgian's World Cup and European Championships places on his Athlete page", async () => {
    const deSmedt = await seedAthlete(env.DB, {
      name: "Jarno De Smedt",
      sport: "Archery",
      externalIds: [{ scheme: "world-archery", value: "20515" }],
    });

    const result = await firstRun();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const results = (await athletePage(deSmedt)).split("<h2>Results</h2>")[1];
    expect(results).toContain("European Outdoor Championships 2026");
    expect(results).toContain("Recurve Men");
    expect(results).toContain("12th");
    expect(results).toContain("Madrid 2026 Hyundai Archery World Cup stage 4");
    expect(results).toContain("28th");
    // A European Grand Prix outside World Archery's world and continental levels is left out.
    expect(results).not.toContain("Spring Arrows");
  });

  it("keeps senior recurve and compound results from qualification-relevant competitions only", async () => {
    await firstRun();

    const db = getDb(env.DB);
    const events = await db.selectDistinct({ event: schema.result.event }).from(schema.result);
    expect(events.map((e) => e.event).sort()).toEqual(["Compound Men", "Recurve Men", "Recurve Women"]);
    const competitions = await db.select({ name: schema.competition.name, kind: schema.competition.kind }).from(schema.competition);
    expect(competitions.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "Antalya 2026 Hyundai Archery World Cup stage 3", kind: "circuit" },
      { name: "European Outdoor Championships 2026", kind: "championship" },
      { name: "Madrid 2026 Hyundai Archery World Cup stage 4", kind: "circuit" },
      { name: "Shanghai 2026 Hyundai Archery World Cup stage 2", kind: "circuit" },
    ]);
    // 20 senior performances: 3 in Shanghai, 7 at the Europeans, 4 in Antalya, 6 in Madrid.
    expect(await db.$count(schema.result)).toBe(20);
  });

  it("sends Belgians it cannot match to the merge queue with their World Archery ID", async () => {
    await firstRun();

    const queue = await (await get("/curate/merge-queue")).text();
    expect(queue).toContain("Feel Stinkens");
    expect(queue).toContain("45057");
    // Para and youth archers are not senior Olympic-category entrants.
    expect(queue).not.toContain("Ruben Vanhollebeke");
    expect(queue).not.toContain("Daan Smet");
  });

  it("lists a World Cup stage a Belgian is entered for under Upcoming", async () => {
    const fraipont = await seedAthlete(env.DB, {
      name: "Julien Fraipont",
      sport: "Archery",
      externalIds: [{ scheme: "world-archery", value: "6827" }],
    });

    const result = await julyRun();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await athletePage(fraipont);
    const upcoming = html.slice(html.indexOf("<h2>Upcoming</h2>"), html.indexOf("<h2>Results</h2>"));
    expect(upcoming).toContain("Madrid 2026 Hyundai Archery World Cup stage 4");
    expect(upcoming).toContain("7 Jul–12 Jul");
    expect(upcoming).toContain("Madrid");
    // Para series and para games in the same weeks are neither results nor entry lists.
    const competitions = await getDb(env.DB).select({ name: schema.competition.name }).from(schema.competition);
    expect(competitions).toEqual([{ name: "Madrid 2026 Hyundai Archery World Cup stage 4" }]);
  });

  it("keeps every fetch as received in R2, links rows to their raw copy and stamps the source's health", async () => {
    await julyRun();

    const listed = await env.RAW.list({ prefix: `raw/${ARCHERY}/`, include: ["customMetadata"] });
    expect(listed.objects.map((o) => o.customMetadata?.url).sort()).toEqual(archeryJuly2026Run.map((r) => r.url).sort());
    const [competition] = await getDb(env.DB)
      .select({ url: schema.rawCopy.url, r2Key: schema.rawCopy.r2Key })
      .from(schema.competition)
      .innerJoin(schema.rawCopy, eq(schema.competition.rawCopyId, schema.rawCopy.id));
    expect(competition.url).toBe(archeryJuly2026Run[1].url);
    expect(await (await env.RAW.get(competition.r2Key))!.text()).toContain("Hyundai Archery World Cup stage 4");

    const source = await sourceRow();
    expect(source.lastSuccessAt).toBe(ARCHERY_JULY_2026_RUN.now);
    expect(source.lastChangeAt).toBe(ARCHERY_JULY_2026_RUN.now);
    expect(source.blockedAt).toBeNull();
  });

  it("flags the source blocked (Assisted) when it refuses the Worker", async () => {
    fixClock(ARCHERY_FIRST_RUN.now);
    stubOutboundFetch([{ url: archeryFirstRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const source = await sourceRow();
    expect(source.blockedAt).toBe(ARCHERY_FIRST_RUN.now);
    expect(await (await get("/curate/sources")).text()).toMatch(/World Archery.*?Assisted.*?blocked/s);
  });
});
