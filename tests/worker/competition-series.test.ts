import { env } from "cloudflare:workers";
import { asc } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { FIE_BERNE_RUN, fieBerneRun } from "../fixtures/sources/fie";
import { FIS_ALPINE_RUN, fisAlpineRun } from "../fixtures/sources/fis-points-lists";
import { BEACH_EUROS_RUN, beachEurosRun } from "../fixtures/sources/fivb-beach-volleyball";
import { VOLLEYBALL_EUROVOLLEY_RUN, volleyballEuroVolleyRun } from "../fixtures/sources/fivb-volleyball";
import { IJF_ZAGREB_RUN, ijfZagrebRun } from "../fixtures/sources/ijf-judo";
import { UCI_RUN, uciRun } from "../fixtures/sources/uci";
import { ARCHERY_FIRST_RUN, archeryFirstRun } from "../fixtures/sources/world-archery";
import { WA_VAN_DAMME_RUN, waVanDammeRun } from "../fixtures/sources/world-athletics";
import { ROWING_CUP_1_RUN, rowingCup1Run } from "../fixtures/sources/world-rowing";
import { TRIATHLON_WORLD_CUP_RUN, triathlonWorldCupRun } from "../fixtures/sources/world-triathlon";
import type { RecordedResponse } from "../support/outbound-fetch";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20 review, finding C; GLOSSARY "Participation": every source that
// writes competitions sets their series (the recurring competition), so a
// Belgian at the previous edition makes the next one likely. Each run is a
// recorded run of the source; the expected keys are written out by hand.

type Run = { source: string; now: string; lastSuccessAt?: string | null; responses: RecordedResponse[]; secrets?: Record<string, string>; keep?: boolean };

async function seriesAfter(run: Run) {
  if (!run.keep) await clearIngestedData(env);
  await setSource(env.DB, run.source, { lastSuccessAt: run.lastSuccessAt ?? null, lastChangeAt: null, blockedAt: null, blockedReason: null });
  fixClock(run.now);
  stubOutboundFetch(run.responses);
  const result = await deliverIngestJobs([{ kind: "fetch-source", source: run.source }], run.secrets);
  expect(result.explicitAcks).toEqual(["msg-1"]);
  const rows = await getDb(env.DB)
    .select({ name: schema.competition.name, kind: schema.competition.kind, series: schema.competition.series })
    .from(schema.competition)
    .orderBy(asc(schema.competition.name));
  return rows;
}

describe("Competition series from every Automatic source", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
  });

  it.each<Run & { name: string; expected: Record<string, string> }>([
    {
      name: "World Archery: a World Cup stage by its host city, not its stage number",
      source: "world-archery",
      ...ARCHERY_FIRST_RUN,
      responses: archeryFirstRun,
      expected: {
        "Antalya 2026 Hyundai Archery World Cup stage 3": "world-archery:antalya-hyundai-archery-world-cup",
        "European Outdoor Championships 2026": "world-archery:european-outdoor-championships",
        "Madrid 2026 Hyundai Archery World Cup stage 4": "world-archery:madrid-hyundai-archery-world-cup",
        "Shanghai 2026 Hyundai Archery World Cup stage 2": "world-archery:shanghai-hyundai-archery-world-cup",
      },
    },
    {
      name: "World Triathlon: a World Cup by its venue, without the year",
      source: "world-triathlon",
      ...TRIATHLON_WORLD_CUP_RUN,
      responses: triathlonWorldCupRun,
      secrets: { WORLD_TRIATHLON_API_KEY: "test-key" },
      expected: { "2026 World Triathlon Cup Exampleton": "world-triathlon:world-triathlon-cup-exampleton" },
    },
    {
      name: "FIVB volleyball: the men's and women's EuroVolley apart",
      source: "fivb-volleyball",
      ...VOLLEYBALL_EUROVOLLEY_RUN,
      responses: volleyballEuroVolleyRun,
      expected: { "CEV EuroVolley 2026 | Men": "fivb-volleyball:cev-eurovolley-men", "CEV EuroVolley 2026 | Women": "fivb-volleyball:cev-eurovolley-women" },
    },
    {
      name: "FIVB beach volleyball: a Championship without its host",
      source: "fivb-beach-volleyball",
      ...BEACH_EUROS_RUN,
      responses: beachEurosRun,
      expected: { "CEV EuroBeachVolley 2026 - Stare Jablonki M": "fivb-beach-volleyball:cev-eurobeachvolley-m" },
    },
    {
      name: "IJF judo: each tour stop by its city",
      source: "ijf-judo",
      ...IJF_ZAGREB_RUN,
      responses: ijfZagrebRun,
      expected: {
        "Abidjan African Open 2026": "ijf:abidjan-african-open",
        "Dushanbe World Judo Masters 2026": "ijf:dushanbe-world-judo-masters",
        "Hong Kong Asian Open 2026": "ijf:hong-kong-asian-open",
        "Rome European Open 2026": "ijf:rome-european-open",
        "Sharm El Sheikh African Open 2026": "ijf:sharm-el-sheikh-african-open",
        "Si Hui Asian Open 2026": "ijf:si-hui-asian-open",
        "Tokyo Grand Slam 2026": "ijf:tokyo-grand-slam",
        "Zagreb Grand Prix 2026": "ijf:zagreb-grand-prix",
      },
    },
    {
      name: "World Athletics: a meeting by its name and city, a Championship by its name",
      source: "world-athletics",
      ...WA_VAN_DAMME_RUN,
      responses: waVanDammeRun,
      expected: {
        "Allianz Memorial van Damme": "world-athletics:allianz-memorial-van-damme:bruxelles",
        Décastar: "world-athletics:decastar:talence",
        "World Athletics Road Running Championships": "world-athletics:world-athletics-road-running-championships",
        "World Athletics Ultimate Championship": "world-athletics:world-athletics-ultimate-championship",
      },
    },
    {
      name: "FIE fencing: each World Cup and Grand Prix by its city",
      source: "fie-fencing",
      ...FIE_BERNE_RUN,
      responses: fieBerneRun,
      expected: { "Berne World Cup 2026": "fie:berne-world-cup", "Orleans Grand Prix 2026": "fie:orleans-grand-prix", "Wuxi World Cup 2026": "fie:wuxi-world-cup" },
    },
    {
      name: "World Rowing: a World Rowing Cup by its number and venue, a Championship by its name",
      source: "world-rowing",
      ...ROWING_CUP_1_RUN,
      responses: rowingCup1Run,
      expected: {
        "2026 Asian Rowing Beach Sprint Championships": "world-rowing:asian-rowing-beach-sprint-championships",
        "2026 World Rowing Cup I": "world-rowing:world-rowing-cup-i:seville",
        "2026 World Rowing Cup II": "world-rowing:world-rowing-cup-ii:plovdiv",
      },
    },
    {
      name: "UCI cycling: the Worlds per discipline whatever their sponsor, a World Cup leg by its host country",
      source: "uci-cycling",
      ...UCI_RUN,
      responses: uciRun,
      expected: {
        "CAC Road Cycling African Championships": "uci-cycling:10:cac-road-cycling-african-championships",
        "Tissot UCI Track World Championships": "uci-cycling:9:world-championships",
        "Tour of Guangxi": "uci-cycling:10:tour-of-guangxi",
        "UCI BMX Freestyle World Cup - Park & Flatland": "uci-cycling:13:uci-bmx-freestyle-world-cup-park-flatland:chn",
        "UCI BMX Racing World Cup - Round 10": "uci-cycling:1:uci-bmx-racing-world-cup:usa",
        "UCI BMX Racing World Cup - Round 9": "uci-cycling:1:uci-bmx-racing-world-cup:usa",
      },
    },
    {
      name: "FIS alpine: a cup leg by its category and venue, sponsor-free",
      source: "fis-alpine",
      ...FIS_ALPINE_RUN,
      responses: fisAlpineRun,
      expected: {
        "Alpine Skiing Australian New Zealand Cup – Australia New Zealand Cup": "fis:al:anc:*",
        "Alpine Skiing South American Cup – Cerro Castor": "fis:al:sac:cerro-castor-ushuaia",
        "Audi FIS Ski World Cup": "fis:al:wc:soelden",
      },
    },
  ])("$name", async (run) => {
    const rows = await seriesAfter(run);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const expected = run.expected[row.name];
      if (expected?.endsWith("*")) expect(row.series).toMatch(new RegExp(`^${expected.slice(0, -1)}`));
      else expect(row.series).toBe(expected);
    }
  });

  it("a Belgian at last year's Tokyo Grand Slam makes the fetched 2026 edition likely on the Calendar", async () => {
    const judoka = await seedAthlete(env.DB, { name: "Jorre Example", sport: "Judo" });
    const tokyo2025 = await seedCompetition(env.DB, {
      name: "Tokyo Grand Slam 2025",
      sport: "Judo",
      startDate: "2025-12-06",
      endDate: "2025-12-07",
      series: "ijf:tokyo-grand-slam",
    });
    await seedResult(env.DB, tokyo2025, judoka, { date: "2025-12-06", place: 5 });

    await seriesAfter({ source: "ijf-judo", ...IJF_ZAGREB_RUN, responses: ijfZagrebRun, keep: true });

    const html = await (await get("/calendar?month=2026-12")).text();
    const list = html.slice(html.indexOf("This month"));
    const row = [...list.matchAll(/<tr>(.*?)<\/tr>/gs)]
      .map((m) => m[1].replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .find((r) => r.includes("Tokyo Grand Slam 2026"));
    expect(row).toContain("Likely: Belgian Entry at the previous edition");
  });

  it("FIS: the two Australia New Zealand Cup legs stay apart by venue", async () => {
    const rows = await seriesAfter({ source: "fis-alpine", ...FIS_ALPINE_RUN, responses: fisAlpineRun });
    expect(rows.filter((r) => r.name.startsWith("Alpine Skiing Australian")).map((r) => r.series).sort()).toEqual(["fis:al:anc:coronet-peak", "fis:al:anc:mt-hutt"]);
  });
});
