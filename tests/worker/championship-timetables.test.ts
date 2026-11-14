import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { ISU_WORLDS_2026_RUN, isuWorlds2026Run } from "../fixtures/sources/isu-speed-skating";
import { AQUATICS_TIMETABLE_RUN, aquaticsTimetableRun } from "../fixtures/sources/world-aquatics";
import { ARCHERY_TIMETABLE_RUN, archeryPublishedTimetableRun, archeryTimetableRun } from "../fixtures/sources/world-archery";
import { WA_TIMETABLE_RUN, waTimetableRun } from "../fixtures/sources/world-athletics";
import { fixClock } from "../support/clock";
import { stubOutboundFetch, type RecordedResponse } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntry, seedTeam, setSource } from "../support/seed";
import { deliverIngestJobs, get } from "../support/worker";

// Spec #20, stories 61–63; ticket #39. Championship timetables of ISU speed
// skating, World Athletics, World Aquatics and World Archery come in
// automatically, version-stamped like a pasted one: a changed timetable is a
// new version, an unchanged one is not, and only the rounds of events with a
// Belgian Entry become Sessions.
const SCHEDULES = "/curate/run/schedules";

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const page = async (path: string) => (await get(path)).text();

/** The shown day's Sessions: one line per Belgian Entry in a round. */
function dayRows(html: string) {
  const start = html.indexOf('aria-label="Sessions"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr([^>]*)>(.*?)<\/tr>/gs)].map((m) => `${text(m[2])}${/if-through/.test(m[1]) ? " [greyed]" : ""}`);
}

/** The Schedules step's list of stored timetables, one line per competition. */
async function storedTimetables() {
  const html = await page(SCHEDULES);
  const table = html.match(/<table aria-label="Stored timetables">(.*?)<\/table>/s)?.[1] ?? "";
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1]));
}

async function competitionBy(source: string, sourceRef: string) {
  return (await getDb(env.DB).query.competition.findFirst({ where: (c, { and, eq }) => and(eq(c.source, source), eq(c.sourceRef, sourceRef)) }))!;
}

async function sourceRow(key: string) {
  return (await getDb(env.DB).query.source.findFirst({ where: eq(schema.source.key, key) }))!;
}

/** One run of a source at `now`, after its last success, against these recorded responses. */
async function runSource(source: string, now: string, lastSuccessAt: string, responses: RecordedResponse[]) {
  await setSource(env.DB, source, { lastSuccessAt, lastChangeAt: null, lastFailureAt: null, lastError: null, blockedAt: null, blockedReason: null });
  fixClock(now);
  stubOutboundFetch(responses);
  const result = await deliverIngestJobs([{ kind: "fetch-source", source }]);
  expect(result.explicitAcks, `${source} run at ${now}`).toEqual(["msg-1"]);
  expect((await sourceRow(source)).lastError).toBeNull();
}

describe("ISU speed skating timetables (through the #23 adapter)", () => {
  const ISU = "isu-speed-skating";
  const runWorlds = (now: string, responses = isuWorlds2026Run) => runSource(ISU, now, ISU_WORLDS_2026_RUN.lastSuccessAt, responses);
  let swings: string;

  beforeEach(async () => {
    await clearIngestedData(env);
    swings = await seedAthlete(env.DB, { name: "Bart Swings", sport: "Speed skating", externalIds: [{ scheme: "isu", value: "692" }] });
  });

  it("stores a published Championship schedule as a version, and none for a schedule not published yet", async () => {
    await runWorlds(ISU_WORLDS_2026_RUN.now);

    expect(await storedTimetables()).toEqual(["ISU Speed Skating World Championships · fetched 2026-03-01 0 Sessions source Name Entries"]);
    const europeans = await competitionBy(ISU, "2027_NED_0002");
    expect(await getDb(env.DB).select().from(schema.timetableVersion).where(eq(schema.timetableVersion.competitionId, europeans.id))).toEqual([]);
  });

  it("keeps only the races of events with a Belgian Entry, in venue time", async () => {
    await runWorlds(ISU_WORLDS_2026_RUN.now);
    const worlds = await competitionBy(ISU, "2026_NED_0002");
    await seedEntry(env.DB, { competitionId: worlds.id, sport: "Speed skating", event: "5000m Men", athleteId: swings });

    await runWorlds("2026-03-02T04:00:00.000Z");

    expect(await storedTimetables()).toEqual(["ISU Speed Skating World Championships · fetched 2026-03-01 1 Sessions source Name Entries"]);
    fixClock("2026-03-07T17:00:00.000Z");
    expect(dayRows(await page(`/championship/${worlds.id}`))).toEqual(["15:46 Bart Swings 5000m Men · Final"]);
  });

  it("a changed schedule is a new version that replaces the Sessions; an unchanged one is not", async () => {
    await runWorlds(ISU_WORLDS_2026_RUN.now);
    const worlds = await competitionBy(ISU, "2026_NED_0002");
    await seedEntry(env.DB, { competitionId: worlds.id, sport: "Speed skating", event: "5000m Men", athleteId: swings });
    const [schedule] = isuWorlds2026Run.filter((r) => r.url.endsWith("/2026_NED_0002/schedule/"));
    const moved = { ...schedule, body: String(schedule.body).replace('"2026-03-07T14:46:00Z"', '"2026-03-07T15:00:00Z"') };

    await runWorlds("2026-03-02T04:00:00.000Z", [...isuWorlds2026Run, moved]);
    await runWorlds("2026-03-03T04:00:00.000Z", [...isuWorlds2026Run, moved]);

    expect(await storedTimetables()).toEqual(["ISU Speed Skating World Championships · fetched 2026-03-02 · replaces fetched 2026-03-01 1 Sessions source Name Entries"]);
    expect(await getDb(env.DB).select().from(schema.timetableVersion)).toHaveLength(2);
    expect((await sourceRow(ISU)).lastChangeAt).toBeNull();
    fixClock("2026-03-07T17:00:00.000Z");
    expect(dayRows(await page(`/championship/${worlds.id}`))).toEqual(["16:00 Bart Swings 5000m Men · Final"]);
  });

  it("the owner names the Belgian Entries on the fetched version, which stays the same version", async () => {
    await runWorlds(ISU_WORLDS_2026_RUN.now);
    const worlds = await competitionBy(ISU, "2026_NED_0002");

    const step = await page(SCHEDULES);
    const link = step.match(/<a href="([^"]+)">Name Entries<\/a>/)?.[1]?.replace(/&amp;/g, "&");
    expect(link, "a Name Entries link on the stored version").toBeDefined();
    const review = await page(link!);
    expect(text(review)).toContain("16 rounds read in 16 events");
    const form = review.match(/<form[^>]*class="card timetable-review"[^>]*>(.*?)<\/form>/s)![1];
    const hidden = [...form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/g)].map((m): [string, string] => [m[1], m[2].replace(/&#x27;/g, "'").replace(/&amp;/g, "&")]);
    const [eventField] = hidden.find(([, value]) => value === "5000m Men")!;
    const ticks: [string, string][] = [[`entry.${eventField.slice("event.".length)}`, `athlete:${swings}`]];
    const stored = await get(SCHEDULES, { method: "POST", body: new URLSearchParams([["intent", "store-timetable"], ...hidden, ...ticks]) });
    expect(stored.status).toBe(303);

    expect(await storedTimetables()).toEqual(["ISU Speed Skating World Championships · fetched 2026-03-01 1 Sessions source Name Entries"]);
    fixClock("2026-03-07T17:00:00.000Z");
    expect(dayRows(await page(`/championship/${worlds.id}`))).toEqual(["15:46 Bart Swings 5000m Men · Final"]);

    // The next fetch of the same schedule keeps it so.
    await runWorlds("2026-03-02T04:00:00.000Z");
    expect(await getDb(env.DB).select().from(schema.timetableVersion)).toHaveLength(1);
    expect(await getDb(env.DB).select().from(schema.session)).toHaveLength(1);
  });
});

describe("World Athletics timetables", () => {
  const SOURCE = "world-athletics-timetables";
  let beijing: string;

  beforeEach(async () => {
    await clearIngestedData(env);
    // The Worlds as the World Athletics results source knows them, with two Belgian Entries named the owner's way.
    beijing = await seedCompetition(env.DB, {
      name: "World Athletics Championships, Beijing 2027",
      sport: "Athletics",
      source: "world-athletics",
      sourceRef: "7216591",
      kind: "championship",
      startDate: "2027-09-10",
      endDate: "2027-09-19",
      city: "Beijing",
    });
    const thiam = await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics" });
    const relay = await seedTeam(env.DB, { name: "Belgium mixed relay", sport: "Athletics", event: "Mixed 4x400m Relay" });
    await seedEntry(env.DB, { competitionId: beijing, sport: "Athletics", event: "Women's Heptathlon", athleteId: thiam });
    await seedEntry(env.DB, { competitionId: beijing, sport: "Athletics", event: "Mixed 4x400m Relay", teamId: relay });
  });

  it("fetches the Worlds' timetable onto the results source's competition, keeping only the Belgian events", async () => {
    await runSource(SOURCE, WA_TIMETABLE_RUN.now, "2026-11-13T04:00:00.000Z", waTimetableRun);

    expect(await storedTimetables()).toEqual(["World Athletics Championships, Beijing 2027 · fetched 2026-11-14 9 Sessions source Name Entries"]);
    const competitions = await getDb(env.DB).select().from(schema.competition);
    expect(competitions.map((c) => [c.id, c.venueZone])).toEqual([[beijing, "Asia/Shanghai"]]);
  });

  it("shows the Belgian rounds in Belgian time, then Beijing time", async () => {
    await runSource(SOURCE, WA_TIMETABLE_RUN.now, "2026-11-13T04:00:00.000Z", waTimetableRun);

    fixClock("2027-09-10T14:00:00.000Z"); // 22:00 in Beijing on day 1
    expect(dayRows(await page(`/championship/${beijing}`))).toEqual(["13:02 · 19:02 Beijing Belgium mixed relay Mixed 4x400m Relay · Round 1"]);
    expect(dayRows(await page(`/championship/${beijing}?day=2027-09-18`))[0]).toBe("03:05 · 09:05 Beijing Nafissatou Thiam Women's Heptathlon · 100 Metres Hurdles");
  });
});

describe("World Aquatics timetables", () => {
  const SOURCE = "world-aquatics-timetables";
  let beijing: string;

  beforeEach(async () => {
    await clearIngestedData(env);
    beijing = await seedCompetition(env.DB, {
      name: "World Aquatics Swimming Championships (25m) 2026",
      sport: "Aquatics",
      source: "world-aquatics",
      sourceRef: "5052",
      kind: "championship",
      startDate: "2026-12-01",
      endDate: "2026-12-06",
      city: "Beijing",
    });
    const roos = await seedAthlete(env.DB, { name: "Roos Vanotterdijk", sport: "Aquatics" });
    // Named as the World Aquatics results source names short-course events.
    await seedEntry(env.DB, { competitionId: beijing, sport: "Aquatics", event: "Women's 50m Freestyle (25m)", athleteId: roos });
  });

  it("fetches the short-course Worlds' schedule, and none for Worlds without one yet", async () => {
    await runSource(SOURCE, AQUATICS_TIMETABLE_RUN.now, "2026-11-13T04:00:00.000Z", aquaticsTimetableRun);

    expect(await storedTimetables()).toEqual(["World Aquatics Swimming Championships (25m) 2026 · fetched 2026-11-14 3 Sessions source Name Entries"]);
    const budapest = await competitionBy("world-aquatics", "5546");
    expect(budapest.kind).toBe("championship");
    expect(await getDb(env.DB).select().from(schema.timetableVersion).where(eq(schema.timetableVersion.competitionId, budapest.id))).toEqual([]);
  });

  it("places the Belgian in her heats, then the later rounds if through", async () => {
    await runSource(SOURCE, AQUATICS_TIMETABLE_RUN.now, "2026-11-13T04:00:00.000Z", aquaticsTimetableRun);

    fixClock("2026-12-05T12:00:00.000Z"); // 20:00 in Beijing
    expect(dayRows(await page(`/championship/${beijing}`))).toEqual([
      "03:00 · 10:00 Beijing Roos Vanotterdijk Women's 50m Freestyle (25m) · Heats",
      "12:00 · 19:00 Beijing Roos Vanotterdijk Women's 50m Freestyle (25m) · Semifinal if through [greyed]",
    ]);
  });
});

describe("World Archery timetables", () => {
  const SOURCE = "world-archery-timetables";
  let medellin: string;

  beforeEach(async () => {
    await clearIngestedData(env);
    medellin = await seedCompetition(env.DB, {
      name: "Medellin 2027 Hyundai World Archery Championships",
      sport: "Archery",
      source: "world-archery",
      sourceRef: "31556",
      kind: "championship",
      startDate: "2027-09-20",
      endDate: "2027-09-27",
      city: "Medellin",
    });
    const archer = await seedAthlete(env.DB, { name: "Ana Example", sport: "Archery" });
    const mixed = await seedTeam(env.DB, { name: "Belgium recurve mixed team", sport: "Archery", event: "Recurve Mixed Team" });
    await seedEntry(env.DB, { competitionId: medellin, sport: "Archery", event: "Recurve Women", athleteId: archer });
    await seedEntry(env.DB, { competitionId: medellin, sport: "Archery", event: "Recurve Mixed Team", teamId: mixed });
  });

  it("stores nothing while the Worlds' schedule is not published", async () => {
    await runSource(SOURCE, ARCHERY_TIMETABLE_RUN.now, "2026-11-13T04:00:00.000Z", archeryTimetableRun);

    expect(await storedTimetables()).toEqual([]);
    expect(await getDb(env.DB).select().from(schema.competition)).toHaveLength(1);
  });

  it("stores the published schedule: each category's phases as rounds, in Colombian time", async () => {
    await runSource(SOURCE, ARCHERY_TIMETABLE_RUN.now, "2026-11-13T04:00:00.000Z", archeryPublishedTimetableRun);

    expect(await storedTimetables()).toEqual(["Medellin 2027 Hyundai World Archery Championships · fetched 2026-11-14 8 Sessions source Name Entries"]);
    fixClock("2027-09-21T22:00:00.000Z"); // 17:00 in Medellín
    expect(dayRows(await page(`/championship/${medellin}`))).toEqual([
      "16:00 · 09:00 Medellin Belgium recurve mixed team Recurve Mixed Team · Qualification round",
      "20:30 · 13:30 Medellin Ana Example Recurve Women · Qualification round",
    ]);
    expect(dayRows(await page(`/championship/${medellin}?day=2027-09-26`))).toEqual([
      "21:00 · 14:00 Medellin Ana Example Recurve Women · Semifinal if through [greyed]",
      "22:00 · 15:00 Medellin Ana Example Recurve Women · Bronze medal match if through [greyed]",
      "22:00 · 15:00 Medellin Ana Example Recurve Women · Gold medal match if through [greyed]",
    ]);
  });
});
