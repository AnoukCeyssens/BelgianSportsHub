import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { UCI_RUN, uciRun } from "../fixtures/sources/uci";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #43: UCI cycling through DataRide's form-POST grids,
// against a recorded run after the Track Worlds and the Tour of Guangxi (Oct 2026).
const UCI = "uci-cycling";
const job = { kind: "fetch-source", source: UCI } as const;

async function runAfterTrackWorlds() {
  fixClock(UCI_RUN.now);
  stubOutboundFetch(uciRun);
  return deliverIngestJobs([job]);
}

async function athletePage(id: string) {
  return (await get(`/athletes/${id}`)).text();
}

const results = (html: string) => html.slice(html.indexOf("<h2>Results</h2>"));

describe("UCI cycling source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, UCI, { lastSuccessAt: UCI_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
  });

  it("puts a Belgian's Championship place on her Athlete page, matched on name and date of birth", async () => {
    const kopecky = await seedAthlete(env.DB, { name: "Lotte Kopecky", sport: "Cycling", dateOfBirth: "1995-11-10" });

    const result = await runAfterTrackWorlds();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = results(await athletePage(kopecky));
    expect(html).toContain("Tissot UCI Track World Championships");
    expect(html).toContain("Track: Women Elite - Omnium");
    expect(html).toContain("7th");
    expect(html).toContain("14 Oct");
  });

  it("takes a WorldTour stage race's general classification, not its stages", async () => {
    const widar = await seedAthlete(env.DB, { name: "Jarno Widar", sport: "Cycling", dateOfBirth: "2005-11-13" });

    await runAfterTrackWorlds();

    const html = results(await athletePage(widar));
    expect(html).toContain("Tour of Guangxi");
    expect(html).toContain("Road: Men Elite - General Classification");
    expect(html).toContain("1st");
    expect(html).toContain("22:22:45");
    expect(html).toContain("18 Oct");
  });

  it("writes Belgian rows only, from Olympic individual events of senior competitions", async () => {
    await runAfterTrackWorlds();

    const rows = await getDb(env.DB).select({ event: schema.result.event }).from(schema.result);
    const events = [...new Set(rows.map((r) => r.event))].sort();
    expect(events).toEqual([
      "Road: Men Elite - General Classification",
      "Track: Men Elite - Keirin",
      "Track: Men Elite - Omnium",
      "Track: Men Elite - Sprint",
      "Track: Women Elite - Keirin",
      "Track: Women Elite - Omnium",
      "Track: Women Elite - Sprint",
    ]);
    // 24 Belgians in Guangxi, 8 Belgian places at the Track Worlds.
    expect(rows).toHaveLength(32);
  });

  it("keeps the Championships, the WorldTour and the World Cups, not lesser road races", async () => {
    await runAfterTrackWorlds();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, country: schema.competition.country })
      .from(schema.competition)
      .orderBy(schema.competition.startDate, schema.competition.name);
    expect(competitions).toEqual([
      { name: "Tour of Guangxi", kind: "circuit", country: "CHN" },
      { name: "Tissot UCI Track World Championships", kind: "championship", country: "CHN" },
      { name: "UCI BMX Freestyle World Cup - Park & Flatland", kind: "circuit", country: "CHN" },
      { name: "CAC Road Cycling African Championships", kind: "championship", country: "KEN" },
      { name: "UCI BMX Racing World Cup - Round 9", kind: "circuit", country: "USA" },
      { name: "UCI BMX Racing World Cup - Round 10", kind: "circuit", country: "USA" },
    ]);
  });

  it("keeps the form it posted next to each raw copy, so the raw copy says what was asked", async () => {
    await runAfterTrackWorlds();

    const [row] = await getDb(env.DB)
      .select({ r2Key: schema.rawCopy.r2Key, url: schema.rawCopy.url })
      .from(schema.result)
      .innerJoin(schema.rawCopy, eq(schema.result.rawCopyId, schema.rawCopy.id))
      .where(eq(schema.result.event, "Track: Women Elite - Omnium"));
    expect(row.url).toBe("https://dataride.uci.ch/iframe/Results/");
    const kept = (await env.RAW.get(row.r2Key))!;
    expect(kept.customMetadata?.method).toBe("POST");
    const request = (await env.RAW.get(kept.customMetadata!.requestKey))!;
    expect(await request.text()).toBe("disciplineId=9&eventId=385099&take=1000&skip=0&page=1&pageSize=1000");
    expect(await kept.text()).toContain("KOPECKY Lotte");
  });

  it("flags the source as blocked (Assisted) when DataRide refuses the Worker", async () => {
    fixClock(UCI_RUN.now);
    stubOutboundFetch([{ url: uciRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.retryMessages).toEqual([]);
    const source = await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, UCI) });
    expect(source?.blockedAt).toBe(UCI_RUN.now);
  });
});
