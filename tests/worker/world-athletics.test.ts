import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { WA_TOKYO_DAY_1_RUN, WA_VAN_DAMME_RUN, waTokyoDay1Run, waVanDammeRun } from "../fixtures/sources/world-athletics";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #43: World Athletics through the JSON its pages
// carry, against a recorded run after the Memorial Van Damme (6 Sep 2026).
const WA = "world-athletics";
const job = { kind: "fetch-source", source: WA } as const;

async function runAfterVanDamme() {
  fixClock(WA_VAN_DAMME_RUN.now);
  stubOutboundFetch(waVanDammeRun);
  return deliverIngestJobs([job]);
}

async function athletePage(id: string) {
  return (await get(`/athletes/${id}`)).text();
}

const results = (html: string) => html.slice(html.indexOf("<h2>Results</h2>"));

describe("World Athletics source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, WA, { lastSuccessAt: WA_VAN_DAMME_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
  });

  it("puts a Belgian's Diamond League result on her Athlete page, matched on name and date of birth", async () => {
    const thiam = await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics", dateOfBirth: "1994-08-19" });

    const result = await runAfterVanDamme();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await athletePage(thiam);
    expect(results(html)).toContain("Allianz Memorial van Damme");
    expect(results(html)).toContain("Women&#x27;s High Jump");
    expect(results(html)).toContain("8th");
    expect(results(html)).toContain("1.84");
    expect(results(html)).toContain("5 Sep");
    expect(html).toContain("World Athletics");
    expect(html).toContain("14428253");
  });

  it("records a did-not-finish without a place", async () => {
    await runAfterVanDamme();

    const [row] = await getDb(env.DB).select().from(schema.result).where(eq(schema.result.event, "Women's 5000 Metres"));
    expect(row).toMatchObject({ status: "DNF", place: null, performance: null });
  });

  it("leaves out the promotional and youth races a meeting stages next to the Diamond League", async () => {
    await runAfterVanDamme();

    const rows = await getDb(env.DB).select({ event: schema.result.event }).from(schema.result);
    const queue = await (await get("/curate/run/merge-queue")).text();
    // Jonathan Sacoor ran only the promotional 400 m; the U18 winners are youths.
    expect(queue).not.toContain("Jonathan SACOOR");
    expect(queue).not.toContain("Maya WINTQUIN");
    expect(queue).toContain("Paulien COUCKUYT");
    // 10 Belgians in day 1's Diamond events, 11 in day 2's.
    expect(rows).toHaveLength(21);
  });

  it("keeps the Championships and the named top series, not label road races", async () => {
    await runAfterVanDamme();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, city: schema.competition.city, country: schema.competition.country })
      .from(schema.competition)
      .orderBy(schema.competition.startDate);
    expect(competitions).toEqual([
      { name: "Allianz Memorial van Damme", kind: "circuit", city: "Bruxelles", country: "BEL" },
      { name: "World Athletics Ultimate Championship", kind: "championship", city: "Budapest", country: "HUN" },
      { name: "Décastar", kind: "circuit", city: "Talence", country: "FRA" },
      { name: "World Athletics Road Running Championships", kind: "championship", city: "København", country: "DEN" },
    ]);
  });

  it("writes a relay's final place to Belgium's relay Team, crediting the heats-only runner too", async () => {
    fixClock(WA_TOKYO_DAY_1_RUN.now);
    await setSource(env.DB, WA, { lastSuccessAt: WA_TOKYO_DAY_1_RUN.lastSuccessAt });
    const sacoor = await seedAthlete(env.DB, { name: "Jonathan Sacoor", sport: "Athletics", externalIds: [{ scheme: "world-athletics", value: "14676801" }] });
    const doom = await seedAthlete(env.DB, { name: "Alexander Doom", sport: "Athletics", externalIds: [{ scheme: "world-athletics", value: "14548983" }] });
    stubOutboundFetch(waTokyoDay1Run);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    for (const athlete of [doom, sacoor]) {
      const html = await athletePage(athlete);
      expect(results(html)).toContain("World Athletics Championships, Tokyo 2025");
      expect(results(html)).toContain("Mixed 4x400 Metres Relay");
      expect(results(html)).toContain("3rd");
      expect(results(html)).toContain("3:10.61");
      expect(results(html)).toMatch(/href="\/teams\/[^"]+"[^>]*>Belgium · Mixed 4x400 Metres Relay</);
      expect(html).toContain("Medals: 1 bronze");
    }
    const relays = await getDb(env.DB)
      .select({ event: schema.result.event, place: schema.result.place, status: schema.result.status })
      .from(schema.result)
      .where(eq(schema.result.event, "Mixed 4x400 Metres Relay"));
    expect(relays).toEqual([{ event: "Mixed 4x400 Metres Relay", place: 3, status: "finished" }]);
    // Sacoor ran the heat, Doom the final: five Belgians on the roster.
    expect(await getDb(env.DB).$count(schema.rosterMember)).toBe(5);
  });

  it("flags the source as blocked (Assisted) when the site refuses the Worker", async () => {
    fixClock(WA_VAN_DAMME_RUN.now);
    stubOutboundFetch([{ url: waVanDammeRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.retryMessages).toEqual([]);
    const source = await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, WA) });
    expect(source?.blockedAt).toBe(WA_VAN_DAMME_RUN.now);
  });
});
