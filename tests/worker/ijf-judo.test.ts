import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { IJF_ZAGREB_RUN, ijfZagrebRun } from "../fixtures/sources/ijf-judo";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, Ingest; ticket #43: IJF judo through Judobase's undocumented JSON,
// against a recorded run on day 2 of the Zagreb Grand Prix (14 Nov 2026).
const IJF = "ijf-judo";
const job = { kind: "fetch-source", source: IJF } as const;

async function runZagreb() {
  fixClock(IJF_ZAGREB_RUN.now);
  stubOutboundFetch(ijfZagrebRun);
  return deliverIngestJobs([job]);
}

async function athletePage(id: string) {
  return (await get(`/athletes/${id}`)).text();
}

const section = (html: string, from: string, to?: string) => html.slice(html.indexOf(from), to ? html.indexOf(to) : undefined);

describe("IJF judo source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, IJF, {
      lastSuccessAt: IJF_ZAGREB_RUN.lastSuccessAt,
      lastChangeAt: null,
      lastError: null,
      blockedAt: null,
      blockedReason: null,
    });
  });

  it("puts a Belgian's result in a decided weight category on her Athlete page", async () => {
    const petit = await seedAthlete(env.DB, { name: "Lois Petit", sport: "Judo", externalIds: [{ scheme: "ijf", value: "19939" }] });

    const result = await runZagreb();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const results = section(await athletePage(petit), "<h2>Results</h2>");
    expect(results).toContain("Zagreb Grand Prix 2026");
    expect(results).toContain("Women -48 kg");
    expect(results).toContain("eliminated");
    expect(results).toContain("0 won · 1 lost");
    expect(results).toContain("13 Nov");
  });

  it("waits for a weight category to be decided before writing its results", async () => {
    const marinx = await seedAthlete(env.DB, { name: "Ray Marinx", sport: "Judo", externalIds: [{ scheme: "ijf", value: "51352" }] });

    await runZagreb();

    const html = await athletePage(marinx);
    expect(section(html, "<h2>Results</h2>")).toContain("No results yet.");
    // Still competing, so Zagreb is upcoming for him.
    expect(section(html, "<h2>Upcoming</h2>", "<h2>Results</h2>")).toContain("Zagreb Grand Prix 2026");
  });

  it("lists the competitions a Belgian is entered for within two weeks under Upcoming", async () => {
    const meeuwssen = await seedAthlete(env.DB, { name: "Lien Meeuwssen", sport: "Judo", externalIds: [{ scheme: "ijf", value: "29755" }] });

    await runZagreb();

    const upcoming = section(await athletePage(meeuwssen), "<h2>Upcoming</h2>", "<h2>Results</h2>");
    expect(upcoming).toContain("Rome European Open 2026");
    expect(upcoming).toContain("28 Nov–29 Nov");
    expect(upcoming).not.toContain("Hong Kong");
  });

  it("sends a Belgian it cannot match to the merge queue", async () => {
    await runZagreb();

    const queue = await (await get("/curate/merge-queue")).text();
    expect(queue).toContain("Olivier NAERT");
    expect(queue).toContain("58321");
  });

  it("keeps only competitions that earn World Ranking List points, and no team events", async () => {
    await runZagreb();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind, zone: schema.competition.venueZone })
      .from(schema.competition)
      .orderBy(schema.competition.startDate, schema.competition.name);
    expect(competitions.map((c) => c.name)).toEqual([
      "Zagreb Grand Prix 2026",
      "Abidjan African Open 2026",
      "Hong Kong Asian Open 2026",
      "Rome European Open 2026",
      "Si Hui Asian Open 2026",
      "Tokyo Grand Slam 2026",
      "Sharm El Sheikh African Open 2026",
      "Dushanbe World Judo Masters 2026",
    ]);
    expect(competitions[0]).toEqual({ name: "Zagreb Grand Prix 2026", kind: "circuit", zone: "Europe/Zagreb" });
  });

  it("writes Belgian rows only, each linked to the raw copy it came from", async () => {
    await runZagreb();

    const db = getDb(env.DB);
    const rows = await db
      .select({ event: schema.result.event, url: schema.rawCopy.url })
      .from(schema.result)
      .innerJoin(schema.rawCopy, eq(schema.result.rawCopyId, schema.rawCopy.id));
    // Naert (-60 kg), Petit and Sibille (-48 kg); the -73 kg is still going.
    expect(rows.map((r) => r.event).sort()).toEqual(["Men -60 kg", "Women -48 kg", "Women -48 kg"]);
    for (const r of rows) expect(r.url).toBe(ijfZagrebRun[1].url);
  });

  it("flags the source as blocked (Assisted) when Judobase refuses the Worker", async () => {
    fixClock(IJF_ZAGREB_RUN.now);
    stubOutboundFetch([{ url: ijfZagrebRun[0].url, status: 403, body: "Forbidden" }]);

    const result = await deliverIngestJobs([job]);

    expect(result.retryMessages).toEqual([]);
    const source = await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, IJF) });
    expect(source?.blockedAt).toBe(IJF_ZAGREB_RUN.now);
  });
});
