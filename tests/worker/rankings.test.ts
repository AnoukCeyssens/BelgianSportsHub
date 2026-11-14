import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { FIS_ALPINE_RUN, FIS_SNOWBOARD_RUN, fisAlpineRun, fisSnowboardRun } from "../fixtures/sources/fis-points-lists";
import { ARCHERY_FIRST_RUN, ARCHERY_JULY_2026_RUN, archeryFirstRun, archeryJuly2026Run } from "../fixtures/sources/world-archery";
import { OWGR_RUN, owgrRun } from "../fixtures/sources/owgr-golf";
import { UCI_RANKINGS_RUN, uciRankingsRun } from "../fixtures/sources/uci/rankings";
import { ISU_TEAM_PURSUIT_RUN, ISU_WORLD_CUP_1_RUN, isuTeamPursuitRun, isuWorldCup1Run } from "../fixtures/sources/isu-speed-skating";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, setSource } from "../support/seed";
import { deliverIngestJobs, get, post } from "../support/worker";

// Spec #20, stories 15, 87 and 107; ticket #33. Automatic sources store
// ranking snapshots per Entry (Athlete or Team) with date and source; a track
// that follows a ranking takes each new position; the Run sheet's
// Qualification review lists only Entries whose ranking or track changed
// since their status was last checked, with current → suggested status, and
// the owner applies, keeps or overrides. Nothing is applied without them.
const ISU = "isu-speed-skating";
const job = { kind: "fetch-source", source: ISU } as const;
const REVIEW = "/curate/run/qualification-review";

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

async function snapshots() {
  const db = getDb(env.DB);
  const rows = await db
    .select({ s: schema.rankingSnapshot, athlete: schema.athlete.name, team: schema.team.name, url: schema.rawCopy.url })
    .from(schema.rankingSnapshot)
    .leftJoin(schema.athlete, eq(schema.rankingSnapshot.athleteId, schema.athlete.id))
    .leftJoin(schema.team, eq(schema.rankingSnapshot.teamId, schema.team.id))
    .innerJoin(schema.rawCopy, eq(schema.rankingSnapshot.rawCopyId, schema.rawCopy.id));
  return rows
    .map((r) => ({
      who: r.athlete ?? r.team,
      source: r.s.source,
      ranking: r.s.ranking,
      position: r.s.position,
      points: r.s.points,
      asOf: r.s.asOf,
      rawCopy: r.url,
    }))
    .toSorted((a, b) => a.ranking.localeCompare(b.ranking));
}

/** The review's items: one line of text per Entry. */
async function reviewItems() {
  const html = await (await get(REVIEW)).text();
  const start = html.indexOf('aria-label="Entries to review"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].slice(1).map((m) => text(m[1]).replace(/ (Apply suggestion|Keep) .*$/, ""));
}

async function reviewEntryId() {
  const html = await (await get(REVIEW)).text();
  return html.match(/name="entryId" value="([^"]+)"/)![1];
}

async function speedSkatingEuros() {
  const id = await seedCompetition(env.DB, {
    name: "ISU European Speed Skating Championships",
    sport: "Speed skating",
    kind: "championship",
    startDate: "2027-01-08",
    endDate: "2027-01-10",
    venueZone: "Europe/Amsterdam",
  });
  await post(`/curate/championships/${id}/standards`, {
    expectedOn: "",
    publishedOn: "2026-07-01",
    url: "https://isu.org/euros-2027",
    standards: "1000m: World Cup top 20",
    closesOn: "2026-12-14",
    closesSource: "https://isu.org/euros-2027/qualification",
  });
  return id;
}

/** Fran Vanhoutte, Active (a result in September), with an Entry in the 1000m at the Euros: At risk, checked 1 Nov. */
async function vanhoutteAtTheEuros() {
  fixClock("2026-11-01T10:00:00.000Z");
  const vanhoutte = await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating", externalIds: [{ scheme: "isu", value: "1575" }] });
  const trials = await seedCompetition(env.DB, { name: "Speed skating meeting", sport: "Speed skating", startDate: "2026-09-20" });
  await seedResult(env.DB, trials, vanhoutte, { date: "2026-09-20" });
  const euros = await speedSkatingEuros();
  await post(`/curate/championships/${euros}/qualification`, {
    intent: "add-entry",
    who: `athlete:${vanhoutte}`,
    event: "1000m Women",
    status: "at-risk",
    source: "ISU Communication 2730",
  });
  const entryId = (await getDb(env.DB).query.entry.findFirst({ where: eq(schema.entry.athleteId, vanhoutte) }))!.id;
  return { vanhoutte, euros, entryId };
}

async function linkTrack(euros: string, entryId: string, fields: Record<string, string> = {}) {
  await post(`/curate/championships/${euros}/qualification`, {
    intent: "save-track",
    entryId,
    name: "World Cup ranking",
    needed: "Top 20",
    has: "–",
    state: "pending",
    better: "",
    source: "",
    ranking: `${ISU}|ISU World Cup 1000m Women`,
    ...fields,
  });
}

async function tracks() {
  return getDb(env.DB)
    .select({ name: schema.qualificationTrack.name, has: schema.qualificationTrack.has, state: schema.qualificationTrack.state, changedOn: schema.qualificationTrack.changedOn })
    .from(schema.qualificationTrack);
}

async function entryStatus(entryId: string) {
  const row = (await getDb(env.DB).query.entry.findFirst({ where: eq(schema.entry.id, entryId) }))!;
  return { status: row.qualificationStatus, source: row.qualificationSource, checkedOn: row.qualificationCheckedOn };
}

async function runWorldCup1() {
  fixClock(ISU_WORLD_CUP_1_RUN.now);
  stubOutboundFetch(isuWorldCup1Run);
  return deliverIngestJobs([job]);
}

describe("Rankings ingest (ISU World Cup standings)", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null, blockedReason: null });
  });

  it("stores each matched Belgian's World Cup standing as a dated snapshot with its source", async () => {
    await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating", dateOfBirth: "2003-05-24" });

    const result = await runWorldCup1();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    // Indra Medard (38th of the 1500m Men) is not an Athlete yet: rankings never create one.
    expect(await snapshots()).toEqual([
      {
        who: "Fran Vanhoutte",
        source: ISU,
        ranking: "ISU World Cup 1000m Women",
        position: 19,
        points: "36",
        asOf: "2026-11-14",
        rawCopy: "https://api.isuresults.eu/worldcups/WC_2027_F_1000/standings/?pageSize=200",
      },
    ]);
    // A re-fetch of the same standings on the same day changes nothing.
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt });
    await runWorldCup1();
    expect(await snapshots()).toHaveLength(1);
  });

  it("attaches a nation's standing to Belgium's default Team in the event", async () => {
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_TEAM_PURSUIT_RUN.lastSuccessAt });
    fixClock(ISU_TEAM_PURSUIT_RUN.now);
    stubOutboundFetch(isuTeamPursuitRun);
    await deliverIngestJobs([job]);

    expect((await snapshots()).map(({ who, ranking, position, points, asOf }) => ({ who, ranking, position, points, asOf }))).toEqual([
      { who: "Belgium · Team Pursuit Men", ranking: "ISU World Cup Team Pursuit Men", position: 16, points: "36", asOf: "2025-11-17" },
      { who: "Belgium · Team Pursuit Women", ranking: "ISU World Cup Team Pursuit Women", position: 9, points: "110", asOf: "2025-11-17" },
    ]);
    // The same Teams the team pursuit results went to.
    const db = getDb(env.DB);
    const women = await db.query.team.findFirst({ where: eq(schema.team.event, "Team Pursuit Women") });
    const ranked = await db.query.rankingSnapshot.findFirst({ where: eq(schema.rankingSnapshot.ranking, "ISU World Cup Team Pursuit Women") });
    expect(ranked!.teamId).toBe(women!.id);
    const results = await db.select().from(schema.result).where(eq(schema.result.teamId, women!.id));
    expect(results).toHaveLength(1);
  });

  it("holds the Quota places a nation ranking earns at the next Games, adjusting to the count rather than adding", async () => {
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_TEAM_PURSUIT_RUN.lastSuccessAt });
    fixClock(ISU_TEAM_PURSUIT_RUN.now);
    stubOutboundFetch(isuTeamPursuitRun);
    await deliverIngestJobs([job]);
    const db = getDb(env.DB);
    const alps = await seedCompetition(env.DB, {
      name: "French Alps 2030",
      sport: "Olympic Winter Games",
      kind: "games",
      source: "owner",
      sourceRef: "french-alps-2030",
      series: "olympic-winter-games",
      startDate: "2030-02-01",
      endDate: "2030-02-17",
      venueZone: "Europe/Paris",
    });
    const women = (await db.query.team.findFirst({ where: eq(schema.team.event, "Team Pursuit Women") }))!;
    const qualification = `/curate/games/${alps}/qualification`;
    await post(qualification, { intent: "add-entry", who: `team:${women.id}`, event: "Team Pursuit Women", status: "on-track", source: "ISU Communication 2711" });
    const entryId = (await db.query.entry.findFirst({ where: eq(schema.entry.teamId, women.id) }))!.id;
    const track = async (needed: string) => {
      const saved = await db.query.qualificationTrack.findFirst({ where: eq(schema.qualificationTrack.entryId, entryId) });
      return post(qualification, {
        intent: "save-track",
        entryId,
        trackId: saved?.id ?? "",
        name: "SOQC nation ranking",
        needed,
        has: "–",
        state: "pending",
        better: "",
        source: "",
        ranking: `${ISU}|ISU World Cup Team Pursuit Women`,
      });
    };
    const places = async () =>
      (await db.select().from(schema.quotaPlace)).map((p) => ({ event: p.event, kind: p.kind, state: p.state, earnedVia: p.earnedVia, source: p.source }));

    // 9th, inside the Top 12: one NOC-owned place, Provisional, from the ranking.
    await track("Top 12 nations");
    const held = { event: "Team Pursuit Women", kind: "noc", state: "provisional", earnedVia: "ISU World Cup Team Pursuit Women", source: "ISU World Cup Team Pursuit Women · 17 Nov 2025" };
    expect(await places()).toEqual([held]);

    // The same standings again: still one place.
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_TEAM_PURSUIT_RUN.lastSuccessAt });
    stubOutboundFetch(isuTeamPursuitRun);
    await deliverIngestJobs([job]);
    expect(await places()).toEqual([held]);

    // Outside the places the track now names: the Provisional place goes.
    await track("Top 8 nations");
    expect(await places()).toEqual([]);
  });

  it("moves a ranking-linked track to the new position, stamping a change only when there is one", async () => {
    await clearIngestedData(env);
    const { euros, entryId } = await vanhoutteAtTheEuros();
    await linkTrack(euros, entryId);
    await post(`/curate/championships/${euros}/qualification`, {
      intent: "save-track",
      entryId,
      name: "Entry standard",
      needed: "1:16.50",
      has: "1:17.90",
      state: "not-met",
      better: "",
      source: "",
    });

    await runWorldCup1();

    expect(await tracks()).toEqual([
      { name: "World Cup ranking", has: "#19 · 36 pts", state: "pending", changedOn: "2026-11-14" },
      { name: "Entry standard", has: "1:17.90", state: "not-met", changedOn: "2026-11-01" },
    ]);
    // The Championship's Qualification phase shows it.
    expect(text(await (await get(`/championship/${euros}`)).text())).toContain("World Cup ranking need Top 20 · has #19 · 36 pts");
    // The status is untouched: suggestions wait for the owner.
    expect(await entryStatus(entryId)).toEqual({ status: "at-risk", source: "ISU Communication 2730", checkedOn: "2026-11-01" });

    // The next day's run brings the same standing: no change stamped.
    fixClock("2026-11-15T04:00:00.000Z");
    stubOutboundFetch(isuWorldCup1Run);
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt });
    await deliverIngestJobs([job]);
    expect((await tracks())[0]).toEqual({ name: "World Cup ranking", has: "#19 · 36 pts", state: "pending", changedOn: "2026-11-14" });
  });

  it("fills a newly linked track from the latest snapshot", async () => {
    await clearIngestedData(env);
    const { euros, entryId } = await vanhoutteAtTheEuros();
    await runWorldCup1();

    await linkTrack(euros, entryId);

    expect(await tracks()).toEqual([{ name: "World Cup ranking", has: "#19 · 36 pts", state: "pending", changedOn: "2026-11-14" }]);
    // The owner chooses among the rankings the Athlete has snapshots on.
    const owner = await (await get(`/curate/championships/${euros}/qualification`)).text();
    expect(owner).toContain(`<option value="${ISU}|ISU World Cup 1000m Women">ISU World Cup 1000m Women (#19, 14 Nov 2026)</option>`);
  });
});

describe("Qualification review (Run sheet step 5)", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await setSource(env.DB, ISU, { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt, lastChangeAt: null, blockedAt: null, blockedReason: null });
  });

  it("lists only Entries whose ranking or track changed since their last check, with current → suggested status", async () => {
    const { euros, entryId } = await vanhoutteAtTheEuros();
    await linkTrack(euros, entryId);
    // Another Entry, checked after its track last changed: not listed.
    const swings = await seedAthlete(env.DB, { name: "Bart Swings", sport: "Speed skating", externalIds: [{ scheme: "isu", value: "692" }] });
    const meeting = await seedCompetition(env.DB, { name: "Meeting", sport: "Speed skating", startDate: "2026-10-10" });
    await seedResult(env.DB, meeting, swings, { date: "2026-10-10" });
    await post(`/curate/championships/${euros}/qualification`, { intent: "add-entry", who: `athlete:${swings}`, event: "Mass Start Men", status: "qualified", source: "ISU" });
    // Linking stamped Vanhoutte's track on 1 Nov, the day her status was checked: nothing to review yet.
    fixClock("2026-11-10T10:00:00.000Z");
    expect(await reviewItems()).toEqual([]);

    await runWorldCup1();

    expect(await reviewItems()).toEqual([
      "Fran Vanhoutte · 1000m Women ISU European Speed Skating Championships World Cup ranking: – → #19 · 36 pts (need Top 20) changed 14 Nov 2026 · ISU World Cup 1000m Women At risk → On track ISU Communication 2730 checked 1 Nov 2026",
    ]);
    const html = await (await get(REVIEW)).text();
    expect(text(html)).toContain("Qualification review 0.5–1 h · 1 open");
  });

  it("applies the suggestion only when the owner says so, stamped checked today", async () => {
    const { euros, entryId } = await vanhoutteAtTheEuros();
    await linkTrack(euros, entryId);
    await runWorldCup1();

    await post(REVIEW, { intent: "apply-suggestion", entryId });

    expect(await entryStatus(entryId)).toEqual({ status: "on-track", source: "ISU World Cup 1000m Women, 14 Nov 2026", checkedOn: "2026-11-14" });
    expect(await reviewItems()).toEqual([]);
    const log = text(await (await get(REVIEW)).text());
    expect(log).toContain("Fran Vanhoutte · 1000m Women: At risk → On track");
  });

  it("keeps the current status, stamped checked today", async () => {
    const { euros, entryId } = await vanhoutteAtTheEuros();
    await linkTrack(euros, entryId);
    await runWorldCup1();

    await post(REVIEW, { intent: "keep-status", entryId });

    expect(await entryStatus(entryId)).toEqual({ status: "at-risk", source: "ISU Communication 2730", checkedOn: "2026-11-14" });
    expect(await reviewItems()).toEqual([]);
  });

  it("sets another status with its source", async () => {
    const { euros, entryId } = await vanhoutteAtTheEuros();
    await linkTrack(euros, entryId);
    await runWorldCup1();

    const refused = await post(REVIEW, { intent: "set-status", entryId, status: "famous", source: "x" });
    expect(refused.status).toBe(400);

    await post(REVIEW, { intent: "set-status", entryId, status: "qualified", source: "https://isu.org/communication-2731" });

    expect(await entryStatus(entryId)).toEqual({ status: "qualified", source: "https://isu.org/communication-2731", checkedOn: "2026-11-14" });
    expect(await reviewItems()).toEqual([]);
  });

  it("suggests Eligible to three Belgians who meet the criteria for two NOC-owned places", async () => {
    fixClock("2026-11-01T10:00:00.000Z");
    const la = await seedCompetition(env.DB, { name: "LA 2028", sport: "Olympic Games", kind: "games", source: "owner", startDate: "2028-07-14", endDate: "2028-07-30" });
    await post(`/curate/games/${la}/standards`, { expectedOn: "", publishedOn: "2026-11-01", url: "https://example.org/standards", standards: "", closesOn: "2028-05-03", closesSource: "https://example.org/qualification-window" });
    const curateLa = `/curate/games/${la}/qualification`;
    const runners: string[] = [];
    for (const name of ["Hanne Verbruggen", "Chloé Herbiet", "Lotte Scheldeman"]) {
      const id = await seedAthlete(env.DB, { name, sport: "Athletics" });
      const race = await seedCompetition(env.DB, { name: `${name} marathon`, sport: "Athletics", startDate: "2026-10-18" });
      await seedResult(env.DB, race, id, { date: "2026-10-18" });
      await post(curateLa, { intent: "add-entry", who: `athlete:${id}`, event: "Women's marathon", status: "on-track", source: "Road to LA" });
      runners.push((await getDb(env.DB).query.entry.findFirst({ where: eq(schema.entry.athleteId, id) }))!.id);
    }
    await post(curateLa, {
      intent: "add-quota-places",
      sport: "Athletics",
      event: "Women's marathon",
      kind: "noc",
      how: "allocate",
      count: "2",
      earnedVia: "Entry standard",
      entryId: "",
      source: "World Athletics",
    });

    fixClock("2026-11-14T12:00:00.000Z");
    for (const entryId of runners) {
      await post(curateLa, { intent: "save-track", entryId, name: "Entry standard", needed: "2:26:50", has: "2:25:10", state: "met", better: "", source: "World Athletics" });
    }

    const items = await reviewItems();
    expect(items).toHaveLength(3);
    for (const item of items) expect(item).toMatch(/Women's marathon LA 2028 Entry standard: – → 2:25:10 \(need 2:26:50\) changed 14 Nov 2026 On track → Eligible /);
  });

  it("lists an Entry whose ranking moved even without a track following it", async () => {
    const { entryId } = await vanhoutteAtTheEuros();
    // An earlier snapshot, read on 31 Oct: 25th.
    fixClock(ISU_WORLD_CUP_1_RUN.now);
    await runWorldCup1();
    const db = getDb(env.DB);
    const latest = (await db.query.rankingSnapshot.findFirst())!;
    await db.insert(schema.rankingSnapshot).values({ ...latest, id: crypto.randomUUID(), position: 25, points: "10", asOf: "2026-10-31" });

    expect(await reviewItems()).toEqual([
      "Fran Vanhoutte · 1000m Women ISU European Speed Skating Championships ISU World Cup 1000m Women: #25 → #19 · 36 pts changed 14 Nov 2026 At risk ISU Communication 2730 checked 1 Nov 2026",
    ]);
    // No ranking places named, no track: nothing to suggest, so only keep or set.
    const html = await (await get(REVIEW)).text();
    expect(html).not.toContain('value="apply-suggestion"');
    await post(REVIEW, { intent: "keep-status", entryId });
    expect(await reviewItems()).toEqual([]);
    expect((await db.select().from(schema.rankingSnapshot).where(and(eq(schema.rankingSnapshot.asOf, "2026-11-14")))).length).toBe(1);
  });
});

describe("Rankings ingest (FIS points lists)", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
  });

  it("stores each Belgian's FIS points and position per discipline, as of the list's valid-from date", async () => {
    await seedAthlete(env.DB, { name: "Sam Maes", sport: "Alpine skiing", externalIds: [{ scheme: "fis", value: "60261" }] });
    await setSource(env.DB, "fis-alpine", { lastSuccessAt: FIS_ALPINE_RUN.lastSuccessAt, blockedAt: null, blockedReason: null });
    fixClock(FIS_ALPINE_RUN.now);
    stubOutboundFetch(fisAlpineRun);

    await deliverIngestJobs([{ kind: "fetch-source", source: "fis-alpine" }]);

    // His Super-G has no valid points (999.99): no snapshot.
    expect((await snapshots()).map(({ who, ranking, position, points, asOf, source }) => ({ who, ranking, position, points, asOf, source }))).toEqual([
      { who: "Sam Maes", ranking: "FIS points list · Giant slalom Men", position: 17, points: "8.37", asOf: "2026-11-12", source: "fis-alpine" },
      { who: "Sam Maes", ranking: "FIS points list · Slalom Men", position: 43, points: "13.88", asOf: "2026-11-12", source: "fis-alpine" },
    ]);
  });

  it("names snowboard rankings by discipline", async () => {
    await seedAthlete(env.DB, { name: "Joewen Frijns", sport: "Snowboard", dateOfBirth: "1998-05-07" });
    await setSource(env.DB, "fis-snowboard", { lastSuccessAt: null, blockedAt: null, blockedReason: null });
    fixClock(FIS_SNOWBOARD_RUN.now);
    stubOutboundFetch(fisSnowboardRun);

    await deliverIngestJobs([{ kind: "fetch-source", source: "fis-snowboard" }]);

    const rankings = (await snapshots()).map((s) => `${s.ranking} #${s.position} (${s.points}) ${s.asOf}`);
    expect(rankings.length).toBeGreaterThan(0);
    expect(rankings.every((r) => r.startsWith("FIS points list · ") && r.endsWith(" 2026-11-05"))).toBe(true);
  });
});

describe("Rankings ingest (World Archery world rankings)", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
  });

  it("stores the week's world ranking of each known Belgian archer and of Belgium's teams", async () => {
    await seedAthlete(env.DB, { name: "Jarno De Smedt", sport: "Archery", externalIds: [{ scheme: "world-archery", value: "20515" }] });
    await seedAthlete(env.DB, { name: "Julien Fraipont", sport: "Archery", externalIds: [{ scheme: "world-archery", value: "6827" }] });
    await setSource(env.DB, "world-archery", { lastSuccessAt: null, blockedAt: null, blockedReason: null });
    fixClock(ARCHERY_FIRST_RUN.now);
    stubOutboundFetch(archeryFirstRun);

    await deliverIngestJobs([{ kind: "fetch-source", source: "world-archery" }]);

    expect((await snapshots()).map(({ who, ranking, position, points, asOf }) => `${who}: ${ranking} #${position} (${points}) ${asOf}`)).toEqual([
      "Julien Fraipont: World Archery world ranking · Compound Men #64 (71) 2026-11-09",
      "Belgium · Compound Men Team: World Archery world ranking · Compound Men Team #43 (48) 2026-11-09",
      "Jarno De Smedt: World Archery world ranking · Recurve Men #53 (89.75) 2026-11-09",
      "Belgium · Recurve Men Team: World Archery world ranking · Recurve Men Team #22 (111.5) 2026-11-09",
      "Belgium · Recurve Mixed Team: World Archery world ranking · Recurve Mixed Team #65 (34) 2026-11-09",
    ]);
  });

  it("reads the rankings once a week: a Wednesday run after Tuesday's fetches none", async () => {
    await setSource(env.DB, "world-archery", { lastSuccessAt: ARCHERY_JULY_2026_RUN.lastSuccessAt, blockedAt: null, blockedReason: null });
    fixClock(ARCHERY_JULY_2026_RUN.now);
    stubOutboundFetch(archeryJuly2026Run);

    const result = await deliverIngestJobs([{ kind: "fetch-source", source: "world-archery" }]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect(await snapshots()).toEqual([]);
  });
});

describe("Rankings ingest (OWGR golf, a ranking-only source)", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
  });

  it("stores the Official World Golf Ranking of each Belgian known as an Athlete, remembering the OWGR ID", async () => {
    // Matched on name + date of birth; Pieters by his OWGR ID; amateurs and unknown golfers are left out.
    const detry = await seedAthlete(env.DB, { name: "Thomas Detry", sport: "Golf", dateOfBirth: "1993-01-13" });
    await seedAthlete(env.DB, { name: "Thomas Pieters", sport: "Golf", externalIds: [{ scheme: "owgr", value: "13944" }] });
    await seedAthlete(env.DB, { name: "Arthur Haghedooren", sport: "Golf", dateOfBirth: "2009-07-04" });
    await setSource(env.DB, "owgr-golf", { lastSuccessAt: null, blockedAt: null, blockedReason: null });
    fixClock(OWGR_RUN.now);
    stubOutboundFetch(owgrRun);

    const result = await deliverIngestJobs([{ kind: "fetch-source", source: "owgr-golf" }]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect((await snapshots()).map(({ who, ranking, position, points, asOf }) => `${who}: ${ranking} #${position} (${points}) ${asOf}`).toSorted()).toEqual([
      "Thomas Detry: Official World Golf Ranking #93 (1.3645) 2026-11-14",
      "Thomas Pieters: Official World Golf Ranking #292 (0.5479) 2026-11-14",
    ]);
    const ids = await getDb(env.DB).select().from(schema.athleteExternalId).where(eq(schema.athleteExternalId.athleteId, detry));
    expect(ids.map((i) => `${i.scheme}:${i.value}`)).toEqual(["owgr:14181"]);
    const source = (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, "owgr-golf") }))!;
    expect({ tier: source.tier, cadenceDays: source.cadenceDays, lastChangeAt: source.lastChangeAt }).toEqual({
      tier: "automatic",
      cadenceDays: 7,
      lastChangeAt: OWGR_RUN.now,
    });
  });
});

describe("Rankings ingest (UCI road world ranking, DataRide)", () => {
  beforeEach(async () => {
    await clearIngestedData(env);
  });

  async function runAfterTuesday() {
    await setSource(env.DB, "uci-cycling", { lastSuccessAt: UCI_RANKINGS_RUN.lastSuccessAt, blockedAt: null, blockedReason: null });
    fixClock(UCI_RANKINGS_RUN.now);
    stubOutboundFetch(uciRankingsRun);
    return deliverIngestJobs([{ kind: "fetch-source", source: "uci-cycling" }]);
  }

  it("stores the week's road world ranking of each known Belgian rider and of Belgium, as of its computation", async () => {
    // Matched on name + date of birth; Philipsen and Bossuyt are not Athletes here, so they are left out.
    await seedAthlete(env.DB, { name: "Remco Evenepoel", sport: "Cycling road", dateOfBirth: "2000-01-25" });
    await seedAthlete(env.DB, { name: "Lotte Kopecky", sport: "Cycling road", dateOfBirth: "1995-11-10" });

    const result = await runAfterTuesday();

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect((await snapshots()).map(({ who, ranking, position, points, asOf }) => `${who}: ${ranking} #${position} (${points}) ${asOf}`)).toEqual([
      "Remco Evenepoel: UCI road world ranking · Men Elite #2 (7191.61) 2026-11-10",
      "Belgium · Road race Men Elite: UCI road world ranking · Nations Men Elite #1 (23246.56) 2026-11-10",
      "Belgium · Road race Women Elite: UCI road world ranking · Nations Women Elite #8 (7850) 2026-11-10",
      "Lotte Kopecky: UCI road world ranking · Women Elite #7 (3690) 2026-11-10",
    ]);
    expect(await getDb(env.DB).$count(schema.mergeQueueItem)).toBe(0);
  });

  it("remembers the rider's real UCI ID from the ranking and shows it on the Athlete page", async () => {
    const evenepoel = await seedAthlete(env.DB, { name: "Remco Evenepoel", sport: "Cycling road", dateOfBirth: "2000-01-25" });

    await runAfterTuesday();

    const page = await (await get(`/athletes/${evenepoel}`)).text();
    expect(page).toContain("UCI ID 10058736615");
  });

  it("reads the rankings once a week: a Thursday run after Wednesday's fetches none", async () => {
    await setSource(env.DB, "uci-cycling", { lastSuccessAt: "2026-11-11T04:00:00.000Z", blockedAt: null, blockedReason: null });
    fixClock("2026-11-12T04:00:00.000Z");
    stubOutboundFetch(uciRankingsRun.filter((r) => r.url.includes("GetRestrictedResultsDisciplineSeasons")));

    const result = await deliverIngestJobs([{ kind: "fetch-source", source: "uci-cycling" }]);

    expect(result.explicitAcks).toEqual(["msg-1"]);
    expect(await snapshots()).toEqual([]);
  });
});
