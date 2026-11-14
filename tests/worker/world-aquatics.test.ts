import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { AQUATICS_ASTANA_RUN, aquaticsAstanaRun } from "../fixtures/sources/world-aquatics";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #43: World Aquatics through its site's undocumented
// JSON, against a recorded run after the Astana Swimming World Cup (Oct 2026).
const AQUATICS = "world-aquatics";
const job = { kind: "fetch-source", source: AQUATICS } as const;
const GASPARD = "22b36785-7817-486f-8ce3-dafa3030b42a";

async function runAfterAstana() {
  fixClock(AQUATICS_ASTANA_RUN.now);
  stubOutboundFetch(aquaticsAstanaRun);
  return deliverIngestJobs([job]);
}

describe("World Aquatics source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, AQUATICS, { lastSuccessAt: AQUATICS_ASTANA_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
  });

  it("puts a Belgian's place from her last swim on her Athlete page, with the course", async () => {
    const gaspard = await seedAthlete(env.DB, {
      name: "Florine Gaspard",
      sport: "Aquatics",
      externalIds: [{ scheme: "world-aquatics", value: GASPARD }],
    });

    const result = await runAfterAstana();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await (await get(`/athletes/${gaspard}`)).text();
    const results = html.slice(html.indexOf("<h2>Results</h2>"));
    expect(results).toContain("World Aquatics Swimming World Cup 2026, Astana");
    expect(results).toContain("Women&#x27;s 50m Freestyle (25m)");
    expect(results).toContain("10th");
    // The final's time, not the heat's 24.66.
    expect(results).toContain("24.52");
    expect(results).toContain("16 Oct");
  });

  it("writes one row per Belgian and discipline, linked to its raw copy", async () => {
    await runAfterAstana();

    const rows = await getDb(env.DB)
      .select({ event: schema.result.event, place: schema.result.place, url: schema.rawCopy.url })
      .from(schema.result)
      .innerJoin(schema.rawCopy, eq(schema.result.rawCopyId, schema.rawCopy.id));
    expect(rows).toEqual([
      { event: "Women's 50m Freestyle (25m)", place: 10, url: "https://api.worldaquatics.com/fina/events/91e75cea-cb84-46e4-8eb6-e570aacf2625" },
    ]);
    expect(await (await get("/curate/merge-queue")).text()).toContain("Florine GASPARD");
  });

  it("keeps the World Cups and Championships, not Grand Prix or youth events", async () => {
    await runAfterAstana();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind })
      .from(schema.competition);
    expect(competitions).toEqual([{ name: "World Aquatics Swimming World Cup 2026, Astana", kind: "circuit" }]);
  });

  it("flags the source as blocked (Assisted) when World Aquatics refuses the Worker", async () => {
    fixClock(AQUATICS_ASTANA_RUN.now);
    stubOutboundFetch([{ url: aquaticsAstanaRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.retryMessages).toEqual([]);
    const source = await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, AQUATICS) });
    expect(source?.blockedAt).toBe(AQUATICS_ASTANA_RUN.now);
  });
});
