import { env } from "cloudflare:workers";
import { eq, like } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import {
  AQUATICS_ASTANA_RUN,
  AQUATICS_DOHA_RUN,
  AQUATICS_PARIS_DUETS_RUN,
  aquaticsAstanaRun,
  aquaticsDohaRun,
  aquaticsParisDuetsRun,
} from "../fixtures/sources/world-aquatics";
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
      sport: "Swimming",
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
    expect(await (await get("/curate/run/merge-queue")).text()).toContain("Florine GASPARD");
  });

  it("keeps the World Cups and Championships, not Grand Prix or youth events", async () => {
    await runAfterAstana();

    const competitions = await getDb(env.DB)
      .select({ name: schema.competition.name, kind: schema.competition.kind })
      .from(schema.competition);
    expect(competitions).toEqual([{ name: "World Aquatics Swimming World Cup 2026, Astana", kind: "circuit" }]);
  });

  it("writes a relay to Belgium's relay Team, with the swimmers the result credits as its roster", async () => {
    fixClock(AQUATICS_DOHA_RUN.now);
    await setSource(env.DB, AQUATICS, { lastSuccessAt: AQUATICS_DOHA_RUN.lastSuccessAt });
    const dumont = await seedAthlete(env.DB, {
      name: "Valentine Dumont",
      sport: "Swimming",
      externalIds: [{ scheme: "world-aquatics", value: "02ad0ca4-0e67-4bdd-a8a3-ff24ffc0fa77" }],
    });
    stubOutboundFetch(aquaticsDohaRun);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const html = await (await get(`/athletes/${dumont}`)).text();
    const results = html.slice(html.indexOf("<h2>Results</h2>"));
    expect(results).toContain("World Aquatics Championships - Doha 2024");
    expect(results).toContain("Women&#x27;s 4x200m Freestyle Relay");
    expect(results).toContain("15th");
    expect(results).toContain("8:06.56");
    const team = results.match(/href="\/teams\/([^"]+)"[^>]*>Belgium · Women&#x27;s 4x200m Freestyle Relay</)?.[1];
    expect(team).toBeDefined();
    const page = await (await get(`/teams/${team}`)).text();
    for (const name of ["Valentine Dumont", "Camille HENVEAUX", "Lucie HANQUET", "Lotte VANHAUWAERT"]) expect(page).toContain(name);
    expect(page).not.toContain("YANG");
    expect(await getDb(env.DB).$count(schema.result)).toBe(1);
  });

  it("gives each Olympic sport at the Worlds its own Championship, high diving left out, with the relay on the swimming one", async () => {
    fixClock(AQUATICS_DOHA_RUN.now);
    await setSource(env.DB, AQUATICS, { lastSuccessAt: AQUATICS_DOHA_RUN.lastSuccessAt });
    stubOutboundFetch(aquaticsDohaRun);

    await deliverIngestJobs([job]);

    const db = getDb(env.DB);
    const worlds = await db
      .select({ name: schema.competition.name, sport: schema.competition.sport, kind: schema.competition.kind, series: schema.competition.series })
      .from(schema.competition)
      .where(like(schema.competition.sourceRef, "2969/%"))
      .orderBy(schema.competition.sport);
    expect(worlds).toEqual(
      ["Artistic swimming", "Diving", "Marathon swimming", "Swimming", "Water polo"].map((sport) => ({
        name: "World Aquatics Championships - Doha 2024, Doha",
        sport,
        kind: "championship",
        series: `world-aquatics:world-championships:${sport.toLowerCase().replace(/ /g, "-")}`,
      })),
    );
    const [relay] = await db
      .select({ sport: schema.competition.sport, team: schema.team.sport })
      .from(schema.result)
      .innerJoin(schema.competition, eq(schema.result.competitionId, schema.competition.id))
      .innerJoin(schema.team, eq(schema.result.teamId, schema.team.id));
    expect(relay).toEqual({ sport: "Swimming", team: "Swimming" });
  });

  it("makes each Belgian duet its own Team, leaving reserves off the roster", async () => {
    fixClock(AQUATICS_PARIS_DUETS_RUN.now);
    await setSource(env.DB, AQUATICS, { lastSuccessAt: AQUATICS_PARIS_DUETS_RUN.lastSuccessAt });
    stubOutboundFetch(aquaticsParisDuetsRun);

    const result = await deliverIngestJobs([job]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    const teams = await getDb(env.DB)
      .select({ name: schema.team.name, event: schema.team.event, kind: schema.team.kind, place: schema.result.place, performance: schema.result.performance })
      .from(schema.team)
      .innerJoin(schema.result, eq(schema.result.teamId, schema.team.id))
      .orderBy(schema.team.name);
    expect(teams).toEqual([
      { name: "Julie COONINX / Lara DRIJKONINGEN", event: "Women's Duet", kind: "partnership", place: 28, performance: "128.8825" },
      { name: "Laura VERGNION / Melina WERT", event: "Women's Duet", kind: "partnership", place: 22, performance: "168.8530" },
    ]);
    expect(await getDb(env.DB).$count(schema.rosterMember)).toBe(4);
    expect(await (await get("/curate/run/merge-queue")).text()).toContain("Laura VERGNION");
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
