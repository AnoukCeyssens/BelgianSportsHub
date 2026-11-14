import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntrant } from "../support/seed";
import { get, post } from "../support/worker";

// Spec #20, stories 47, 55–57, 59, 61, 63 and 110; GLOSSARY "Session";
// ticket #37. The owner pastes a timetable version in the Run sheet's
// Schedules step (version-stamped, Belgian events only: the owner names the
// Belgian Entries per event). Belgian Entries are placed in every round of
// their event; the Live phase shows a day picker (days with Belgian Entries
// marked) and that day's Sessions, Belgian time first.
const NOW = "2026-11-14T12:00:00.000Z";
const SCHEDULES = "/curate/run/schedules";

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const page = async (path: string) => (await get(path)).text();

/** POST a form whose fields may repeat (ticked Entries). */
function postForm(path: string, fields: [string, string][]) {
  return get(path, { method: "POST", body: new URLSearchParams(fields) });
}

/** The shown phase's panel, as text. */
function panel(html: string) {
  const m = html.match(/<section class="phase" aria-label="([^"]+)">(.*?)<\/section>/s);
  return m ? { phase: m[1], text: text(m[2]) } : undefined;
}

/** The day picker: each day's text, whether it is marked (Belgian Entries) and whether it is shown. */
function dayPicker(html: string) {
  const nav = html.match(/<nav class="days" aria-label="Days">(.*?)<\/nav>/s)?.[1] ?? "";
  return [...nav.matchAll(/<a([^>]*)>(.*?)<\/a>/gs)].map((m) => ({
    day: text(m[2]),
    marked: /class="[^"]*\bhas\b/.test(m[1]),
    on: /class="[^"]*\bon\b/.test(m[1]),
  }));
}

/** The shown day's Sessions: one line per Belgian Entry in a round. */
function dayRows(html: string) {
  const start = html.indexOf('aria-label="Sessions"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr([^>]*)>(.*?)<\/tr>/gs)].map((m) => `${text(m[2])}${/if-through/.test(m[1]) ? " [greyed]" : ""}`);
}

const SHORT_TRACK_V1 = [
  "Day\tVenue time\tRound",
  "Fri 15 Jan\t13:00\tWomen's 500 m heats",
  "Fri 15 Jan\t14:10\tMen's 500 m heats",
  "Fri 15 Jan\t15:30\tWomen's 1000 m heats",
  "Sat 16 Jan\t12:00\tWomen's 500 m quarter-finals",
  "Sat 16 Jan\t14:40\tMixed relay semi-finals",
  "Sat 16 Jan\t15:20\tMen's 1500 m final",
  "Sun 17 Jan\t13:00\tWomen's 1000 m quarter-finals",
  "Sun 17 Jan\t15:00\tWomen's 500 m final",
].join("\n");

type Stored = { version: string; text: string; entries: Record<string, { athleteId: string; firstRound?: string }[]>; venueZone?: string };

/** Reads a timetable in the Schedules step and stores it with the Belgian Entries named per event, as the review offers them. */
async function storeTimetable(competitionId: string, t: Stored) {
  const fields = { competition: competitionId, version: t.version, publishedOn: "2026-11-11", sourceUrl: "https://isu.example/timetable.pdf", venueZone: t.venueZone ?? "" };
  const read = await post(SCHEDULES, { intent: "read-timetable", ...fields, text: t.text });
  expect(read.status).toBe(303);
  const review = await page(read.headers.get("location")!);
  const form = review.match(/<form[^>]*class="card timetable-review"[^>]*>(.*?)<\/form>/s)?.[1];
  expect(form, "the review form").toBeDefined();
  const hidden = [...form!.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/g)].map((m): [string, string] => [m[1], m[2].replace(/&#x27;/g, "'").replace(/&amp;/g, "&")]);
  const events = hidden.filter(([name]) => name.startsWith("event."));
  const ticks: [string, string][] = [];
  for (const [name, event] of events) {
    const i = name.slice("event.".length);
    for (const e of t.entries[event] ?? []) {
      ticks.push([`entry.${i}`, `athlete:${e.athleteId}`]);
      if (e.firstRound) ticks.push([`firstRound.${i}.athlete:${e.athleteId}`, e.firstRound]);
    }
  }
  return postForm(SCHEDULES, [["intent", "store-timetable"], ...hidden.filter(([name]) => name !== "intent"), ...ticks]);
}

describe("Sessions and the Live day view", () => {
  let europeans: string;
  let desmet: string;
  let vanRuijven: string;
  let relay: string;

  beforeEach(async () => {
    fixClock(NOW);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await clearIngestedData(env);
    europeans = await seedCompetition(env.DB, {
      name: "European Short Track Championships 2027",
      sport: "Short track",
      kind: "championship",
      startDate: "2027-01-15",
      endDate: "2027-01-17",
      city: "Gdańsk",
      venueZone: "Europe/Warsaw",
    });
    desmet = await seedAthlete(env.DB, { name: "Hanne Desmet", sport: "Short track" });
    vanRuijven = await seedAthlete(env.DB, { name: "Tineke den Dulk", sport: "Short track" });
    relay = await seedAthlete(env.DB, { name: "Stijn Desmet", sport: "Short track" });
    await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics" });
  });

  it("reads a pasted timetable and offers the Belgian Entries of the competition's sport per event", async () => {
    const read = await post(SCHEDULES, { intent: "read-timetable", competition: europeans, version: "v1", publishedOn: "", sourceUrl: "", venueZone: "", text: SHORT_TRACK_V1 });
    const review = text(await page(read.headers.get("location")!));

    expect(review).toContain("8 rounds read in 5 events");
    expect(review).toContain("Women's 500 m Heats · Quarter-finals · Final");
    expect(review).toContain("Hanne Desmet");
    expect(review).not.toContain("Nafissatou Thiam");
  });

  it("stores the version with only the rounds of events with a Belgian Entry, logged in the session", async () => {
    const stored = await storeTimetable(europeans, {
      version: "v1",
      text: SHORT_TRACK_V1,
      entries: { "Women's 500 m": [{ athleteId: desmet }], "Women's 1000 m": [{ athleteId: desmet }, { athleteId: vanRuijven }] },
    });
    expect(stored.status).toBe(303);

    const step = text(await page(SCHEDULES));
    expect(step).toContain("European Short Track Championships 2027: timetable v1 stored, 5 Sessions with Belgian Entries");
    expect(step).toContain("European Short Track Championships 2027 · v1 · published 11 Nov 2026");

    const sessions = await getDb(env.DB).select().from(schema.session);
    expect(sessions.map((s) => [s.startsAt, s.venueZone]).sort()).toEqual([
      ["2027-01-15T13:00", "Europe/Warsaw"],
      ["2027-01-15T15:30", "Europe/Warsaw"],
      ["2027-01-16T12:00", "Europe/Warsaw"],
      ["2027-01-17T13:00", "Europe/Warsaw"],
      ["2027-01-17T15:00", "Europe/Warsaw"],
    ]);
  });

  it("goes Live at the first Session, not at midnight", async () => {
    await storeTimetable(europeans, { version: "v1", text: SHORT_TRACK_V1, entries: { "Women's 500 m": [{ athleteId: desmet }] } });

    fixClock("2027-01-15T11:59:00.000Z"); // 12:59 in Gdańsk
    expect(panel(await page(`/championship/${europeans}`))?.phase).not.toBe("Live");
    fixClock("2027-01-15T12:00:00.000Z"); // 13:00 in Gdańsk
    expect(panel(await page(`/championship/${europeans}`))?.phase).toBe("Live");
  });

  it("shows a day picker with the Belgian days marked, and the day's Entries by round (later rounds if through)", async () => {
    await storeTimetable(europeans, {
      version: "v1",
      text: SHORT_TRACK_V1,
      entries: { "Women's 500 m": [{ athleteId: desmet }], "Women's 1000 m": [{ athleteId: vanRuijven }] },
    });
    fixClock("2027-01-16T10:00:00.000Z"); // day 2, 11:00 in Gdańsk

    const html = await page(`/championship/${europeans}`);
    expect(dayPicker(html)).toEqual([
      { day: "Day 1 Fri 15 Jan", marked: true, on: false },
      { day: "Day 2 Sat 16 Jan", marked: true, on: true },
      { day: "Day 3 Sun 17 Jan", marked: true, on: false },
    ]);
    expect(dayRows(html)).toEqual(["12:00 Hanne Desmet Women's 500 m · Quarter-finals if through [greyed]"]);

    const day1 = await page(`/championship/${europeans}?day=2027-01-15`);
    expect(dayRows(day1)).toEqual(["13:00 Hanne Desmet Women's 500 m · Heats", "15:30 Tineke den Dulk Women's 1000 m · Heats"]);
  });

  it("skips the rounds before the one an Entry starts in after a bye", async () => {
    await storeTimetable(europeans, {
      version: "v1",
      text: SHORT_TRACK_V1,
      entries: { "Women's 500 m": [{ athleteId: desmet, firstRound: "Quarter-finals" }] },
    });
    fixClock("2027-01-16T10:00:00.000Z");

    expect(dayRows(await page(`/championship/${europeans}?day=2027-01-15`))).toEqual([]);
    expect(dayRows(await page(`/championship/${europeans}?day=2027-01-16`))).toEqual(["12:00 Hanne Desmet Women's 500 m · Quarter-finals"]);
  });

  it("re-importing replaces the previous version", async () => {
    await storeTimetable(europeans, { version: "v1", text: SHORT_TRACK_V1, entries: { "Women's 500 m": [{ athleteId: desmet }] } });
    await storeTimetable(europeans, {
      version: "v2",
      text: SHORT_TRACK_V1.replace("Fri 15 Jan\t13:00\tWomen's 500 m heats", "Fri 15 Jan\t13:30\tWomen's 500 m heats"),
      entries: { "Women's 500 m": [{ athleteId: desmet }] },
    });
    fixClock("2027-01-15T13:00:00.000Z"); // 14:00 in Gdańsk on day 1

    expect(dayRows(await page(`/championship/${europeans}`))).toEqual(["13:30 Hanne Desmet Women's 500 m · Heats"]);
    expect(text(await page(SCHEDULES))).toContain("European Short Track Championships 2027 · v2 · published 11 Nov 2026 · replaces v1");
    expect(await getDb(env.DB).select().from(schema.timetableVersion)).toHaveLength(2);
  });

  it("pre-ticks the stored Entries when the next version is read", async () => {
    await seedEntrant(env.DB, europeans, relay);
    await storeTimetable(europeans, { version: "v1", text: SHORT_TRACK_V1, entries: { "Women's 500 m": [{ athleteId: desmet }] } });

    const read = await post(SCHEDULES, { intent: "read-timetable", competition: europeans, version: "v2", publishedOn: "", sourceUrl: "", venueZone: "", text: SHORT_TRACK_V1 });
    const review = await page(read.headers.get("location")!);

    const ticked = [...review.matchAll(/<input type="checkbox"([^>]*)\/>/g)].filter((m) => m[1].includes('checked=""')).map((m) => m[1].match(/value="([^"]+)"/)?.[1]);
    expect(ticked).toEqual([`athlete:${desmet}`]);
    expect(review).toContain("Stijn Desmet");
  });
});

describe("Sessions at the Games", () => {
  let la: string;
  let thiam: string;
  let lions: string;

  beforeEach(async () => {
    fixClock(NOW);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await db.delete(schema.gamesSportWindow);
    await clearIngestedData(env);
    await post(SCHEDULES, { intent: "save-games-dates", games: "la-2028", firstDay: "2028-07-12", lastDay: "2028-07-30", sourceUrl: "https://la28.example/schedule" });
    for (const [sport, first, last] of [
      ["Athletics", "2028-07-15", "2028-07-24"],
      ["Hockey", "2028-07-13", "2028-07-28"],
    ]) {
      await post(SCHEDULES, { intent: "save-sport-days", games: "la-2028", sport, firstDay: first, lastDay: last, sourceUrl: "https://la28.example/schedule" });
    }
    la = (await getDb(env.DB).query.competition.findFirst({ where: (c, { eq }) => eq(c.sourceRef, "la-2028") }))!.id;
    thiam = await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics" });
    lions = await seedAthlete(env.DB, { name: "Red Lions", sport: "Hockey" });
  });

  const BY_EVENT = [
    "Sport\tVenue\tSession Code\tDate\tGames Day\tSession Type\tSession Description\tStart Time\tEnd Time",
    "Hockey\tCarson Field\tHOC01\tThursday, July 13\tDay -1\tPreliminary\tMen's Pool (2 Matches)\t9:00\t14:00",
    "Athletics (Track & Field)\tLA Memorial Coliseum\tATH03\tSunday, July 16\tDay 2\tPreliminary\tWomen's Heptathlon Day 1 / Men's 400m Round 1\t18:30\t21:30",
    "Hockey\tCarson Field\tHOC23\tMonday, July 24\tDay 10\tQuarterfinal\tMen's Quarterfinal (2 Matches)\t9:00\t14:00",
  ].join("\n");

  async function storeLa28() {
    const stored = await storeTimetable(la, {
      version: "V4.1",
      text: BY_EVENT,
      entries: { "Women's Heptathlon": [{ athleteId: thiam }], "Men's": [{ athleteId: lions }] },
    });
    expect(stored.status).toBe(303);
  }

  it("shows Belgian time first and LA time after it; pool matches are match TBD", async () => {
    await storeLa28();
    fixClock("2028-07-16T12:00:00.000Z");

    expect(dayRows(await page(`/games/${la}?day=2028-07-16`))).toEqual(["03:30 Mon · 18:30 LA ATH03 Nafissatou Thiam Women's Heptathlon · Day 1"]);
    expect(dayRows(await page(`/games/${la}?day=2028-07-13`))).toEqual(["18:00 · 09:00 LA HOC01 Red Lions Men's · Pool (2 Matches) match TBD"]);
    expect(dayRows(await page(`/games/${la}?day=2028-07-24`))).toEqual([
      "18:00 · 09:00 LA HOC23 Red Lions Men's · Quarterfinal (2 Matches) if through [greyed]",
    ]);
  });

  it("puts each sport Live at its own first Session, and the sport chips filter the day", async () => {
    await storeLa28();
    fixClock("2028-07-13T16:30:00.000Z"); // 09:30 in LA on 13 Jul: the hockey session has started

    const all = await page(`/games/${la}?day=2028-07-13`);
    expect(panel(all)?.phase).toBe("Live");
    expect(dayRows(all)).toHaveLength(1);
    fixClock("2028-07-15T12:00:00.000Z"); // 05:00 in LA on athletics' first day; its first Session is tomorrow evening
    expect(panel(await page(`/games/${la}?sport=Athletics`))?.phase).not.toBe("Live");

    fixClock("2028-07-17T12:00:00.000Z"); // athletics went Live at 18:30 LA on the 16th
    const athletics = await page(`/games/${la}?sport=Athletics&day=2028-07-13`);
    expect(dayRows(athletics)).toEqual([]);
    expect(dayPicker(athletics).filter((d) => d.marked).map((d) => d.day)).toEqual(["Day 5 Sun 16 Jul"]);
  });
});
