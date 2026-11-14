import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, seedTeam, seedTeamResult } from "../support/seed";
import { get, post } from "../support/worker";
import { phasePanel, region } from "../support/html";

// Spec #20, stories 25, 28–30, 34, 45, 82 and 84; ticket #32. The owner
// curates a Qualification status per Entry per target (the next Games, the
// next Championship) with source and last-checked date, plus Qualification
// tracks (needed, has, met). The Athlete page shows its Qualification
// section; a Championship's or the Games' Qualification phase lists each
// potential Entry. Only Active Athletes and Teams get tracks and statuses.
const NOW = "2026-11-14T12:00:00.000Z";

const page = async (path: string) => (await get(path)).text();
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** The shown phase's panel, as text. */
function panel(html: string) {
  const shown = phasePanel(html);
  return shown ? { phase: shown.phase, text: text(shown.html) } : undefined;
}

/** The Qualification phase's table: one line per potential Entry. */
function qualificationRows(html: string) {
  const start = html.indexOf('aria-label="Potential Entries"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).slice(1);
}

/** The Athlete or Team page's Qualification section, as text. */
function qualificationSection(html: string) {
  const section = region(html, "Qualification", "section");
  return section === null ? undefined : text(section);
}

/** Each progress bar of the Qualification section: its track and how full it is. */
function progressBars(html: string) {
  return [...html.matchAll(/<div\b[^>]*\brole="progressbar" aria-label="([^"]+)" aria-valuenow="(\d+)"/g)].map((m) => `${m[1]} ${m[2]}%`);
}

/** The id of a potential Entry on the owner's qualification page, by its "<who> · <event>" heading. */
function entryIdOn(html: string, heading: string) {
  const start = html.indexOf(`aria-label="${heading.replace(/'/g, "&#x27;")}"`);
  expect(start, `no Entry "${heading}" on the page`).toBeGreaterThan(-1);
  return html.slice(start).match(/name="entryId" value="([^"]+)"/)![1];
}

const curate = (competitionId: string, kind: "championships" | "games" = "championships") => `/curate/${kind}/${competitionId}/qualification`;

async function worlds() {
  const id = await seedCompetition(env.DB, {
    name: "World Athletics Championships, Beijing",
    sport: "Athletics",
    kind: "championship",
    startDate: "2027-09-11",
    endDate: "2027-09-19",
    venueZone: "Asia/Shanghai",
    series: "world-athletics:world-championships",
  });
  await post(`/curate/championships/${id}/standards`, {
    expectedOn: "",
    publishedOn: "2026-08-01",
    url: "https://worldathletics.org/beijing27/standards",
    standards: "Heptathlon: 6 500 pts or World Ranking top 24",
    closesOn: "2027-08-24",
    closesSource: "https://worldathletics.org/beijing27/qualification-period",
  });
  return id;
}

/** An Athlete with a senior international performance in the last 12 months (Active). */
async function activeAthlete(name: string, sport = "Athletics") {
  const id = await seedAthlete(env.DB, { name, sport });
  const meeting = await seedCompetition(env.DB, { name: `${sport} meeting`, sport, startDate: "2026-08-20" });
  await seedResult(env.DB, meeting, id, { date: "2026-08-20" });
  return id;
}

describe("Qualification status and tracks", () => {
  beforeEach(async () => {
    fixClock(NOW);
    const db = getDb(env.DB);
    await db.delete(schema.gamesSportWindow);
    await clearIngestedData(env);
  });

  it("lists each potential Entry on the Championship's Qualification phase with its tracks and status badge", async () => {
    const beijing = await worlds();
    const thiam = await activeAthlete("Nafissatou Thiam");
    const vanderelst = await activeAthlete("Elise Vanderelst");

    let added = await post(curate(beijing), {
      intent: "add-entry",
      who: `athlete:${thiam}`,
      event: "Heptathlon",
      status: "qualified",
      source: "https://worldathletics.org/stats-zone/road-to/beijing27",
    });
    expect(added.status).toBe(303);
    expect(added.headers.get("location")).toBe(curate(beijing));
    await post(curate(beijing), { intent: "add-entry", who: `athlete:${vanderelst}`, event: "Women's 1500 m", status: "at-risk", source: "World Rankings, 10 Nov" });

    let owner = await page(curate(beijing));
    const thiamEntry = entryIdOn(owner, "Nafissatou Thiam · Heptathlon");
    await post(curate(beijing), { intent: "save-track", entryId: thiamEntry, name: "Entry standard", needed: "6 500 pts", has: "6 640 pts", state: "met", better: "higher", source: "" });
    await post(curate(beijing), { intent: "save-track", entryId: thiamEntry, name: "World Ranking", needed: "Top 24", has: "#2", state: "met", better: "", source: "" });
    const vanderelstEntry = entryIdOn(owner, "Elise Vanderelst · Women's 1500 m");
    await post(curate(beijing), { intent: "save-track", entryId: vanderelstEntry, name: "Entry standard", needed: "4:01.50", has: "4:04.10", state: "not-met", better: "", source: "" });
    await post(curate(beijing), { intent: "save-track", entryId: vanderelstEntry, name: "Federation selection", needed: "Belgian Athletics, Aug 2027", has: "Pending", state: "pending", better: "", source: "" });

    const html = await page(`/championship/${beijing}`);
    expect(panel(html)?.phase).toBe("Qualification");
    expect(panel(html)?.text).toContain("Qualification window closes 24 Aug 2027 · 283 days left · source · checked 14 Nov 2026");
    expect(panel(html)?.text).toContain("1 qualified · 1 at risk");
    expect(qualificationRows(html)).toEqual([
      "Elise Vanderelst Women's 1500 m ✗ Entry standard need 4:01.50 · has 4:04.10 … Federation selection need Belgian Athletics, Aug 2027 · has Pending At risk",
      "Nafissatou Thiam Heptathlon ✓ Entry standard need 6 500 pts · has 6 640 pts ✓ World Ranking need Top 24 · has #2 Qualified",
    ]);
    expect(html).toContain(`href="/athletes/${thiam}"`);

    // Editing a track keeps its place; the status changes with a new source.
    owner = await page(curate(beijing));
    const trackId = owner.slice(owner.indexOf('aria-label="Elise Vanderelst · Women&#x27;s 1500 m"')).match(/name="trackId" value="([^"]+)"/)![1];
    await post(curate(beijing), { intent: "save-track", entryId: vanderelstEntry, trackId, name: "Entry standard", needed: "4:01.50", has: "4:01.20", state: "met", better: "", source: "" });
    await post(curate(beijing), { intent: "set-status", entryId: vanderelstEntry, status: "on-track", source: "https://worldathletics.org/results/1" });
    expect(qualificationRows(await page(`/championship/${beijing}`))[0]).toBe(
      "Elise Vanderelst Women's 1500 m ✓ Entry standard need 4:01.50 · has 4:01.20 … Federation selection need Belgian Athletics, Aug 2027 · has Pending On track",
    );

    await post(curate(beijing), { intent: "remove-track", trackId });
    expect(qualificationRows(await page(`/championship/${beijing}`))[0]).toBe(
      "Elise Vanderelst Women's 1500 m … Federation selection need Belgian Athletics, Aug 2027 · has Pending On track",
    );
  });

  it("gives tracks and statuses to Active Entries only", async () => {
    const beijing = await worlds();
    const active = await activeAthlete("Noor Vidts");
    const retiredLongAgo = await seedAthlete(env.DB, { name: "Kim Gevaert", sport: "Athletics" });

    const refused = await post(curate(beijing), { intent: "add-entry", who: `athlete:${retiredLongAgo}`, event: "Women's 100 m", status: "on-track", source: "x" });
    expect(refused.status).toBe(400);
    expect(text(await page(curate(beijing)))).not.toContain("Kim Gevaert");

    await post(curate(beijing), { intent: "add-entry", who: `athlete:${active}`, event: "Heptathlon", status: "on-track", source: "World Rankings" });
    // The Athlete retires: she drops out of Qualification tracking.
    await post(`/curate/athletes/${active}/status`, { intent: "save", kind: "retirement", date: "2026-11-01", source: "Press release", checkedOn: "2026-11-02" });

    const html = await page(`/championship/${beijing}`);
    expect(qualificationRows(html)).toEqual([]);
    expect(panel(html)?.text).toContain("No Qualification statuses recorded yet.");
    expect(qualificationSection(await page(`/athletes/${active}`))).toBe("Qualification Not tracked while inactive.");
  });

  it("shows the Athlete's Qualification for the next Olympics and the next Championship, one at a time", async () => {
    const la = await seedCompetition(env.DB, {
      name: "LA 2028",
      sport: "Olympic Games",
      kind: "games",
      source: "owner",
      startDate: "2028-07-14",
      endDate: "2028-07-30",
      venueZone: "America/Los_Angeles",
    });
    await post(`/curate/games/${la}/standards`, { expectedOn: "", publishedOn: "2026-11-10", url: "https://example.org/standards", standards: "", closesOn: "2028-06-11", closesSource: "https://example.org/qualification-window" });
    const indoors = await seedCompetition(env.DB, { name: "European Athletics Indoor Championships", sport: "Athletics", kind: "championship", startDate: "2027-03-05", endDate: "2027-03-07" });
    const beijing = await worlds();
    const thiam = await activeAthlete("Nafissatou Thiam");

    await post(curate(la, "games"), { intent: "add-entry", who: `athlete:${thiam}`, event: "Heptathlon", status: "on-track", source: "https://worldathletics.org/road-to/la28" });
    const laEntry = entryIdOn(await page(curate(la, "games")), "Nafissatou Thiam · Heptathlon");
    await post(curate(la, "games"), { intent: "save-track", entryId: laEntry, name: "World Ranking", needed: "Top 24", has: "#48", state: "pending", better: "", source: "" });
    await post(curate(la, "games"), { intent: "save-track", entryId: laEntry, name: "BOIC selection", needed: "Criteria TBA", has: "–", state: "pending", better: "", source: "" });
    await post(curate(beijing), { intent: "add-entry", who: `athlete:${thiam}`, event: "Heptathlon", status: "qualified", source: "World Athletics entry standards list" });
    const beijingEntry = entryIdOn(await page(curate(beijing)), "Nafissatou Thiam · Heptathlon");
    await post(curate(beijing), { intent: "save-track", entryId: beijingEntry, name: "Entry standard", needed: "6 500 pts", has: "6 640 pts", state: "met", better: "", source: "" });

    // Next Olympics by default.
    let html = await page(`/athletes/${thiam}`);
    expect(qualificationSection(html)).toBe(
      "Qualification Next Olympics LA 2028 Next Championship World Athletics Championships, Beijing " +
        "LA 2028 · 14–30 Jul 2028 · window closes in 575 days " +
        "Heptathlon On track World Ranking Top 24 #48 BOIC selection Criteria TBA – " +
        "Source: https://worldathletics.org/road-to/la28 · checked 14 Nov 2026",
    );
    expect(progressBars(html)).toEqual(["World Ranking 50%", "BOIC selection 0%"]);
    expect(html).toContain(`href="/athletes/${thiam}?target=championship"`);

    // The next Championship is the one with her Entry, not the indoor one before it.
    html = await page(`/athletes/${thiam}?target=championship`);
    expect(qualificationSection(html)).toContain("World Athletics Championships, Beijing · 11–19 Sept 2027 · window closes in 283 days");
    expect(qualificationSection(html)).toContain("Heptathlon Qualified Entry standard 6 500 pts 6 640 pts");
    expect(qualificationSection(html)).toContain("Source: World Athletics entry standards list · checked 14 Nov 2026");
    expect(qualificationSection(html)).not.toContain("European Athletics Indoor Championships");
    expect(progressBars(html)).toEqual(["Entry standard 100%"]);
    void indoors;
  });

  it("shows the next Championship in the sport with no status yet when none is recorded", async () => {
    await seedCompetition(env.DB, { name: "European Athletics Indoor Championships", sport: "Athletics", kind: "championship", startDate: "2027-03-05", endDate: "2027-03-07" });
    await worlds();
    const doom = await activeAthlete("Alexander Doom");

    const section = qualificationSection(await page(`/athletes/${doom}?target=championship`));

    expect(section).toContain("European Athletics Indoor Championships · 5–7 Mar 2027");
    expect(section).toContain("No Qualification status recorded yet.");
    expect(section).not.toContain("Beijing ·");
  });

  it("sets a Team's status on the Team only, never on its roster members", async () => {
    const la = await seedCompetition(env.DB, { name: "LA 2028", sport: "Olympic Games", kind: "games", source: "owner", startDate: "2028-07-14", endDate: "2028-07-30" });
    const player = await seedAthlete(env.DB, { name: "Arthur van Doren", sport: "Hockey" });
    const proLeague = await seedCompetition(env.DB, { name: "FIH Pro League", sport: "Hockey", startDate: "2026-06-20" });
    const lions = await seedTeamResult(env.DB, { competitionId: proLeague, sport: "Hockey", event: "Men", place: 1, roster: [player] });

    const refused = await post(curate(la, "games"), { intent: "add-entry", who: `athlete:${player}`, event: "Men", status: "qualified", source: "x" });
    expect(refused.status).toBe(400);

    await post(curate(la, "games"), { intent: "add-entry", who: `team:${lions}`, event: "Men", status: "qualified", source: "https://fih.hockey/news/belgium-crowned" });

    expect(qualificationSection(await page(`/teams/${lions}`))).toContain("Men Qualified");
    expect(qualificationSection(await page(`/athletes/${player}`))).toContain("No Qualification status recorded yet.");
    expect(qualificationSection(await page(`/athletes/${player}`))).not.toContain("Qualified");
  });

  it("makes Belgium's Participation likely at a Championship where an Entry is in contention", async () => {
    const beijing = await worlds();
    const bolingo = await activeAthlete("Cynthia Bolingo");

    await post(curate(beijing), { intent: "add-entry", who: `athlete:${bolingo}`, event: "Women's 400 m", status: "on-track", source: "World Rankings" });
    expect(text(await page("/championship"))).toContain("World Athletics Championships, Beijing Athletics · Likely: a Belgian Entry is in contention");

    const entry = entryIdOn(await page(curate(beijing)), "Cynthia Bolingo · Women's 400 m");
    await post(curate(beijing), { intent: "set-status", entryId: entry, status: "not-in-contention", source: "Season over (injury)" });
    expect(text(await page("/championship"))).not.toContain("World Athletics Championships, Beijing");
  });

  it("filters the Games' Qualification phase by sport chip", async () => {
    const la = await seedCompetition(env.DB, { name: "LA 2028", sport: "Olympic Games", kind: "games", source: "owner", startDate: "2028-07-14", endDate: "2028-07-30" });
    await post(`/curate/games/${la}/standards`, { expectedOn: "", publishedOn: "2026-11-10", url: "https://example.org/standards", standards: "", closesOn: "2028-06-11", closesSource: "https://example.org/qualification-window" });
    const db = getDb(env.DB);
    for (const sport of ["Athletics", "Hockey"]) {
      await db.insert(schema.gamesSportWindow).values({ competitionId: la, sport, firstDay: "2028-07-15", lastDay: "2028-07-24", sourceUrl: "https://la28.example", checkedOn: "2026-11-14" });
    }
    const thiam = await activeAthlete("Nafissatou Thiam");
    const lions = await seedTeam(env.DB, { name: "Red Lions", sport: "Hockey", event: "Men" });
    const proLeague = await seedCompetition(env.DB, { name: "FIH Pro League", sport: "Hockey", startDate: "2026-06-20" });
    await db.insert(schema.result).values({ competitionId: proLeague, teamId: lions, event: "Men", date: "2026-06-20", place: 1, status: "finished", source: "test-source", sourceRef: "pl-1", rawCopyId: (await db.query.competition.findFirst({ where: (c, { eq }) => eq(c.id, proLeague) }))!.rawCopyId });
    await post(curate(la, "games"), { intent: "add-entry", who: `athlete:${thiam}`, event: "Heptathlon", status: "on-track", source: "Road to LA" });
    await post(curate(la, "games"), { intent: "add-entry", who: `team:${lions}`, event: "Men", status: "qualified", source: "FIH" });

    expect(qualificationRows(await page(`/games/${la}`))).toEqual(["Nafissatou Thiam Heptathlon On track", "Red Lions Men Qualified"]);
    expect(qualificationRows(await page(`/games/${la}?sport=Hockey`))).toEqual(["Red Lions Men Qualified"]);
  });
});
