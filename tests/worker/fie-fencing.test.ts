import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { FIE_BERNE_RUN, fieBerneRun } from "../fixtures/sources/fie";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #43: FIE fencing through the page state of fie.org,
// against a recorded run during the Berne and Wuxi épée World Cups (Nov 2026).
const FIE = "fie-fencing";
const job = { kind: "fetch-source", source: FIE } as const;

async function runBerne() {
  fixClock(FIE_BERNE_RUN.now);
  stubOutboundFetch(fieBerneRun);
  return deliverIngestJobs([job]);
}

describe("FIE fencing source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, FIE, { lastSuccessAt: FIE_BERNE_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
  });

  it("puts the round a Belgian went out in on his Athlete page", async () => {
    const loyola = await seedAthlete(env.DB, { name: "Neisser Loyola", sport: "Fencing", externalIds: [{ scheme: "fie", value: "45133" }] });

    const result = await runBerne();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await (await get(`/athletes/${loyola}`)).text();
    const results = html.slice(html.indexOf("<h2>Results</h2>"));
    expect(results).toContain("Berne World Cup 2026");
    expect(results).toContain("Men&#x27;s Épée");
    expect(results).toContain("eliminated");
    expect(results).toContain("Table of 64");
    expect(results).toContain("13 Nov");
  });

  it("tells the pools, the preliminary table and the main table apart", async () => {
    await runBerne();

    const rows = await getDb(env.DB)
      .select({ ref: schema.result.sourceRef, place: schema.result.place, performance: schema.result.performance })
      .from(schema.result);
    const byFencer = Object.fromEntries(rows.map((r) => [r.ref.split("/")[2], r]));
    expect(byFencer["57062"]).toEqual({ ref: "124/385/57062", place: null, performance: "Pools (2/6)" });
    expect(byFencer["57927"].performance).toBe("Preliminary table of 128");
    expect(byFencer["45133"].performance).toBe("Table of 64");
    expect(byFencer["43732"]).toEqual({ ref: "125/92/43732", place: null, performance: "Table of 64" });
    // Nine Belgian men in Berne, two Belgian women in Wuxi.
    expect(rows).toHaveLength(11);
  });

  it("sends Belgians it cannot match to the merge queue under their FIE ID", async () => {
    await runBerne();

    const queue = await (await get("/curate/run/merge-queue")).text();
    expect(queue).toContain("VAN DE STEENE Adrian");
    expect(queue).toContain("59058");
  });

  it("keeps senior World Cups and Grand Prix, not junior ones", async () => {
    await runBerne();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, city: schema.competition.city })
      .from(schema.competition)
      .orderBy(schema.competition.startDate);
    expect(competitions).toEqual([
      { name: "Berne World Cup 2026", kind: "circuit", city: "Berne" },
      { name: "Wuxi World Cup 2026", kind: "circuit", city: "Wuxi" },
      { name: "Orleans Grand Prix 2026", kind: "circuit", city: "Orléans" },
    ]);
  });

  it("flags the source as blocked (Assisted) when fie.org refuses the Worker", async () => {
    fixClock(FIE_BERNE_RUN.now);
    stubOutboundFetch([{ url: fieBerneRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.retryMessages).toEqual([]);
    const source = await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, FIE) });
    expect(source?.blockedAt).toBe(FIE_BERNE_RUN.now);
  });
});
