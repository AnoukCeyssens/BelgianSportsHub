import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { AQUATICS_LA28_RUN, aquaticsLa28Run } from "../fixtures/sources/world-aquatics";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedEntry, setSource } from "../support/seed";
import { deliverIngestJobs, get, post } from "../support/worker";

// Spec #20, stories 47–52 (Live and After at the Games); #20 review, finding F.
// A source's own Olympic Games competition is the Games the app follows: its
// results land on the owner's Games row (each with its sport), so the Live
// medal table and After count them. Run: World Aquatics during LA 2028
// (hand-built fixtures, made-up names).
const AQUATICS = "world-aquatics";
const SCHEDULES = "/curate/run/schedules";

const page = async (path: string) => (await get(path)).text();
const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

/** A table's rows (header left out), as text. */
function rows(html: string, label: string) {
  const start = html.indexOf(`aria-label="${label}"`);
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => text(m[1])).slice(1);
}

async function laGames() {
  const owner = { sourceUrl: "https://la28.example/schedule" };
  await post(SCHEDULES, { intent: "save-games-dates", games: "la-2028", firstDay: "2028-07-12", lastDay: "2028-07-30", ...owner });
  await post(SCHEDULES, { intent: "save-sport-days", games: "la-2028", sport: "Swimming", firstDay: "2028-07-15", lastDay: "2028-07-23", ...owner });
  await post(SCHEDULES, { intent: "save-sport-days", games: "la-2028", sport: "Artistic swimming", firstDay: "2028-07-16", lastDay: "2028-07-22", ...owner });
  return (await getDb(env.DB).query.competition.findFirst({ where: (c, { and, eq }) => and(eq(c.source, "owner"), eq(c.sourceRef, "la-2028")) }))!.id;
}

describe("Games results from automatic sources", () => {
  let la: string;
  let ana: string;

  beforeEach(async () => {
    fixClock("2026-11-14T12:00:00.000Z");
    await clearIngestedData(env);
    la = await laGames();
    ana = await seedAthlete(env.DB, { name: "Ana Example", sport: "Swimming", externalIds: [{ scheme: "world-aquatics", value: "la28-p-ana" }] });
    await seedEntry(env.DB, { competitionId: la, sport: "Swimming", event: "Women's 50m Freestyle", athleteId: ana });
    // Selected (her outcome is compared in After).
    await getDb(env.DB).update(schema.entry).set({ qualificationStatus: "selected", qualificationSource: "BOIC selection", qualificationCheckedOn: "2028-06-30" });
    await setSource(env.DB, AQUATICS, { lastSuccessAt: AQUATICS_LA28_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null });
    fixClock(AQUATICS_LA28_RUN.now);
    stubOutboundFetch(aquaticsLa28Run);
    const run = await deliverIngestJobs([{ kind: "fetch-source", source: AQUATICS }]);
    expect(run.explicitAcks).toEqual(["msg-1"]);
  });

  it("writes the source's Olympic results to the Games the app follows, each with its sport, and no second Games", async () => {
    const db = getDb(env.DB);
    const games = await db.select({ id: schema.competition.id, name: schema.competition.name }).from(schema.competition).where(eq(schema.competition.kind, "games"));
    expect(games).toEqual([{ id: la, name: "LA 2028" }]);
    const results = await db
      .select({ competitionId: schema.result.competitionId, event: schema.result.event, sport: schema.result.sport, place: schema.result.place })
      .from(schema.result)
      .orderBy(schema.result.event);
    expect(results).toEqual([
      { competitionId: la, event: "Women's 50m Freestyle", sport: "Swimming", place: 3 },
      { competitionId: la, event: "Women's Duet Free", sport: "Artistic swimming", place: 5 },
    ]);
    const [duet] = await db.select({ sport: schema.team.sport, name: schema.team.name }).from(schema.team);
    expect(duet).toEqual({ sport: "Artistic swimming", name: "Bea EXAMPLE / Cleo EXAMPLE" });
  });

  it("counts them in the Live medal table, narrowed by the sport chips", async () => {
    expect(rows(await page(`/games/${la}`), "Medal table")).toEqual(["1 Belgium 0 0 1"]);
    expect(rows(await page(`/games/${la}?sport=Swimming`), "Medal table")).toEqual(["Belgium 0 0 1"]);
    expect(rows(await page(`/games/${la}?sport=Artistic%20swimming`), "Medal table")).toEqual(["Belgium 0 0 0"]);
  });

  it("compares the Selected Entry's outcome in After", async () => {
    fixClock("2028-08-01T12:00:00.000Z");
    const after = await page(`/games/${la}`);
    expect(rows(after, "Best results")).toEqual(["B Ana Example Women's 50m Freestyle 23.44"]);
    // Belgium's own counts take every Belgian result there: the bronze, and the duet's 5th (no Entry recorded).
    expect(rows(after, "Medals and top 8")[0]).toBe("Belgium 1 2");
  });
});
