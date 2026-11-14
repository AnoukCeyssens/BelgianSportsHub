import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { isuWorldCup1Run, ISU_WORLD_CUP_1_RUN } from "../fixtures/sources/isu-speed-skating";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, seedTeam, seedTeamResult, setSource } from "../support/seed";
import { deliverIngestJobs, get, post } from "../support/worker";

// Spec #20, stories 46, 81, 85, 96 and 108; ticket #34. The owner enters a
// Selection from a federation press release in the Run sheet's Selections &
// likely step: the press release URL is the source, the names found in the
// pasted text are pre-ticked, the other candidates become Not selected. The
// selector is the national federation for a Championship and the Belgian
// Olympic Committee for the Games. The Selection phase begins with the first
// Selected Entry and shows the final list with the non-selected Entries
// underneath; the IF entry list replaces the press-release Selection.
const NOW = "2026-11-14T12:00:00.000Z";
const STEP = "/curate/run/selections-likely";

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

/** POST a form whose fields may repeat (the ticked candidates). */
const postFields = (path: string, fields: [string, string][]) => get(path, { method: "POST", body: new URLSearchParams(fields) });

/** The shown phase's panel, as text. */
function panel(html: string) {
  const m = html.match(/<section class="phase" aria-label="([^"]+)">(.*?)<\/section>/s);
  return m ? { phase: m[1], text: text(m[2]) } : undefined;
}

/** A table's rows (header left out), as text. */
function rows(html: string, label: string) {
  const start = html.indexOf(`aria-label="${label}"`);
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).slice(1);
}

/** The Calendar's month list row for one competition, as text. */
function calendarRow(html: string, name: string) {
  const list = html.slice(html.indexOf("This month"));
  return [...list.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).find((r) => r.includes(name));
}

/** The Selection cards of the Run sheet step: heading and each candidate with whether it is ticked. */
function selectionCards(html: string) {
  return [...html.matchAll(/<section class="card selection" aria-label="([^"]+)"[^>]*>(.*?)<\/section>/gs)].map((m) => ({
    card: m[1].replace(/&#x27;/g, "'"),
    text: text(m[2]),
    candidates: [...m[2].matchAll(/<label class="candidate">(.*?)<\/label>/gs)].map((c) => `${/checked=""/.test(c[1]) ? "☑" : "☐"} ${text(c[1])}`),
    ids: Object.fromEntries([...m[2].matchAll(/<label class="candidate"><input[^>]*value="([^"]+)"[^>]*\/?>(.*?)<\/label>/gs)].map((c) => [text(c[2]), c[1]])),
  }));
}

/** An Athlete with a senior international performance in the last 12 months (Active). */
async function activeAthlete(name: string, sport: string, on = "2026-08-20") {
  const id = await seedAthlete(env.DB, { name, sport });
  const meeting = await seedCompetition(env.DB, { name: `${sport} meeting`, sport, startDate: on });
  await seedResult(env.DB, meeting, id, { date: on });
  return id;
}

const qualification = (id: string, kind: "championships" | "games" = "championships") => `/curate/${kind}/${id}/qualification`;

async function addEntry(target: string, who: string, event: string, status = "qualified", kind: "championships" | "games" = "championships") {
  const res = await post(qualification(target, kind), { intent: "add-entry", who, event, status, source: "World Aquatics points table" });
  expect(res.status).toBe(303);
}

const PRESS =
  "The selection committee has named the following swimmers for the European Short Course Championships: Lucas Verbeke (400 and 1500 free), " +
  "Kobe NDOUMBE (100 fly) and Fleur Dewit (50 and 100 breast).";
const PRESS_URL = "https://www.belswim.be/news/selection-european-short-course-2026";

async function lublin() {
  const id = await seedCompetition(env.DB, {
    name: "European Short Course Swimming Championships, Lublin",
    sport: "Swimming",
    kind: "championship",
    startDate: "2026-12-02",
    endDate: "2026-12-07",
    venueZone: "Europe/Warsaw",
  });
  const verbeke = await activeAthlete("Lucas Verbeke", "Swimming");
  const ndoumbe = await activeAthlete("Kobe Ndoumbe", "Swimming");
  const vanhoutte = await activeAthlete("Roos Vanhoutte", "Swimming");
  await addEntry(id, `athlete:${verbeke}`, "Men's 1500 m freestyle");
  await addEntry(id, `athlete:${ndoumbe}`, "Men's 100 m butterfly");
  await addEntry(id, `athlete:${vanhoutte}`, "Women's 200 m backstroke", "eligible");
  return { id, verbeke, ndoumbe, vanhoutte };
}

describe("Selection", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
  });

  it("enters a Selection from a press release: names found pre-ticked, the rest Not selected, the selector and source recorded", async () => {
    const { id } = await lublin();

    // Due: the Championship starts within eight weeks. No names ticked before a press release is read.
    let [card] = selectionCards(await page(STEP));
    expect(card.card).toBe("Selection · European Short Course Swimming Championships, Lublin · Swimming");
    expect(card.candidates).toEqual([
      "☐ Kobe Ndoumbe · Men's 100 m butterfly",
      "☐ Lucas Verbeke · Men's 1500 m freestyle",
      "☐ Roos Vanhoutte · Women's 200 m backstroke",
    ]);

    const read = await post(STEP, { intent: "read-selection", competition: id, sport: "Swimming", url: PRESS_URL, text: PRESS, selector: "", announcedOn: "" });
    expect(read.status).toBe(303);
    [card] = selectionCards(await page(read.headers.get("location")!));
    expect(card.candidates).toEqual([
      "☑ Kobe Ndoumbe · Men's 100 m butterfly",
      "☑ Lucas Verbeke · Men's 1500 m freestyle",
      "☐ Roos Vanhoutte · Women's 200 m backstroke",
    ]);
    const raw = new URL(read.headers.get("location")!, "https://bsh.test").searchParams.get("raw")!;

    // A selector is needed for a Championship: the national federation.
    const refused = await postFields(STEP, [["intent", "save-selection"], ["competition", id], ["sport", "Swimming"], ["url", PRESS_URL], ["selector", ""], ["announcedOn", "2026-11-12"], ["raw", raw]]);
    expect(refused.status).toBe(400);

    const saved = await postFields(STEP, [
      ["intent", "save-selection"],
      ["competition", id],
      ["sport", "Swimming"],
      ["url", PRESS_URL],
      ["selector", "Belgian Swimming Federation"],
      ["announcedOn", "2026-11-12"],
      ["raw", raw],
      ["selected", card.ids["Kobe Ndoumbe · Men's 100 m butterfly"]],
      ["selected", card.ids["Lucas Verbeke · Men's 1500 m freestyle"]],
    ]);
    expect(saved.status).toBe(303);

    // The step is done, and the session log says what was saved.
    const step = await page(STEP);
    expect(selectionCards(step)).toEqual([]);
    expect(text(step)).toContain("European Short Course Swimming Championships, Lublin · Swimming: Selection saved (2 Selected, 1 Not selected)");

    // The Championship opens on Selection: the final list, the non-selected Entries underneath.
    const html = await page(`/championship/${id}`);
    expect(panel(html)?.phase).toBe("Selection");
    expect(panel(html)?.text).toContain("Selected by Belgian Swimming Federation · 12 Nov 2026 · press release");
    expect(html).toContain(`href="${PRESS_URL}"`);
    expect(rows(html, "Selected Entries")).toEqual(["Kobe Ndoumbe Men's 100 m butterfly", "Lucas Verbeke Men's 1500 m freestyle"]);
    expect(rows(html, "Not selected Entries")).toEqual(["Roos Vanhoutte Women's 200 m backstroke"]);

    // The owner's Qualification page shows the statuses with the press release as source.
    const owner = text(await page(qualification(id)));
    expect(owner).toContain("Selection: Belgian Swimming Federation · 12 Nov 2026");
  });

  it("confirms the Participation once an Entry is Selected", async () => {
    const { id } = await lublin();
    // Before: likely, because Belgian Entries are in contention.
    expect(calendarRow(await page("/calendar?month=2026-12"), "Lublin")).toContain("Likely");

    const [card] = selectionCards(await page(STEP));
    await postFields(STEP, [
      ["intent", "save-selection"],
      ["competition", id],
      ["sport", "Swimming"],
      ["url", PRESS_URL],
      ["selector", "Belgian Swimming Federation"],
      ["announcedOn", "2026-11-12"],
      ["text", PRESS],
      ["selected", card.ids["Lucas Verbeke · Men's 1500 m freestyle"]],
    ]);

    expect(calendarRow(await page("/calendar?month=2026-12"), "Lublin")).toBe(
      "2–7 Dec European Short Course Swimming Championships, Lublin Swimming · Confirmed · Lucas Verbeke",
    );
  });

  it("passes a place to a new partnership: the old Team Not selected, the new Team Selected", async () => {
    const worlds = await seedCompetition(env.DB, {
      name: "World Rowing Championships, Amsterdam",
      sport: "Rowing",
      kind: "championship",
      startDate: "2026-12-20",
      endDate: "2026-12-27",
    });
    const earlier = await seedCompetition(env.DB, { name: "World Rowing Cup", sport: "Rowing", startDate: "2026-08-20" });
    const brys = await activeAthlete("Tim Brys", "Rowing");
    const vanDamme = await activeAthlete("Pieter Van Damme", "Rowing");
    const vanZandweghe = await activeAthlete("Niels Van Zandweghe", "Rowing");
    const old = await seedTeamResult(env.DB, { competitionId: earlier, sport: "Rowing", event: "Men's double sculls", place: 4, roster: [brys, vanDamme] });
    await getDb(env.DB).update(schema.team).set({ name: "Tim Brys / Pieter Van Damme", kind: "partnership", key: "old" }).where(eq(schema.team.id, old));
    const pair = await seedTeam(env.DB, { name: "Tim Brys / Niels Van Zandweghe", sport: "Rowing", event: "Men's double sculls", kind: "partnership" });
    const later = await seedCompetition(env.DB, { name: "World Rowing Cup III", sport: "Rowing", startDate: "2026-09-10" });
    await getDb(env.DB).insert(schema.result).values({
      competitionId: later,
      teamId: pair,
      event: "Men's double sculls",
      date: "2026-09-10",
      place: 2,
      status: "finished",
      source: "test-source",
      sourceRef: crypto.randomUUID(),
      rawCopyId: (await getDb(env.DB).query.competition.findFirst({ where: eq(schema.competition.id, later) }))!.rawCopyId,
    });
    await addEntry(worlds, `team:${old}`, "Men's double sculls");
    await addEntry(worlds, `team:${pair}`, "Men's double sculls", "on-track");

    const read = await post(STEP, {
      intent: "read-selection",
      competition: worlds,
      sport: "Rowing",
      url: "https://www.belgianrowing.be/news/worlds-selection",
      text: "Tim Brys now rows the double sculls with Niels Van Zandweghe.",
      selector: "Belgian Rowing",
      announcedOn: "2026-11-13",
    });
    const [card] = selectionCards(await page(read.headers.get("location")!));
    expect(card.candidates).toEqual(["☑ Tim Brys / Niels Van Zandweghe · Men's double sculls", "☐ Tim Brys / Pieter Van Damme · Men's double sculls"]);
    await postFields(STEP, [
      ["intent", "save-selection"],
      ["competition", worlds],
      ["sport", "Rowing"],
      ["url", "https://www.belgianrowing.be/news/worlds-selection"],
      ["selector", "Belgian Rowing"],
      ["announcedOn", "2026-11-13"],
      ["raw", new URL(read.headers.get("location")!, "https://bsh.test").searchParams.get("raw")!],
      ["selected", card.ids["Tim Brys / Niels Van Zandweghe · Men's double sculls"]],
    ]);

    const html = await page(`/championship/${worlds}`);
    expect(rows(html, "Selected Entries")).toEqual(["Tim Brys / Niels Van Zandweghe Men's double sculls"]);
    expect(rows(html, "Not selected Entries")).toEqual(["Tim Brys / Pieter Van Damme Men's double sculls"]);
  });

  it("at the Games, the BOIC selects, and each sport enters Selection with its own first Selected Entry", async () => {
    fixClock("2028-04-01T10:00:00.000Z");
    const schedules = "/curate/run/schedules";
    await post(schedules, { intent: "save-games-dates", games: "la-2028", firstDay: "2028-07-12", lastDay: "2028-07-30", sourceUrl: "https://la28.example" });
    await post(schedules, { intent: "save-sport-days", games: "la-2028", sport: "Athletics", firstDay: "2028-07-15", lastDay: "2028-07-24", sourceUrl: "https://la28.example" });
    await post(schedules, { intent: "save-sport-days", games: "la-2028", sport: "Swimming", firstDay: "2028-07-15", lastDay: "2028-07-23", sourceUrl: "https://la28.example" });
    const la = (await getDb(env.DB).query.competition.findFirst({ where: eq(schema.competition.sourceRef, "la-2028") }))!.id;
    await post(`/curate/games/${la}/standards`, { expectedOn: "", publishedOn: "2026-11-10", url: "", standards: "", closesOn: "2028-06-30" });
    const thiam = await activeAthlete("Nafissatou Thiam", "Athletics", "2028-03-10");
    const verbeke = await activeAthlete("Lucas Verbeke", "Swimming", "2028-03-10");
    await addEntry(la, `athlete:${thiam}`, "Heptathlon", "qualified", "games");
    await addEntry(la, `athlete:${verbeke}`, "Men's 1500 m freestyle", "qualified", "games");
    await post(qualification(la, "games"), {
      intent: "add-quota-places",
      sport: "Athletics",
      event: "Heptathlon",
      kind: "noc",
      how: "hold",
      count: "1",
      earnedVia: "World Ranking",
      entryId: "",
      source: "https://worldathletics.org/road-to/la28",
    });

    // Not due yet (more than eight weeks before LA, window open): the owner opens it from the Qualification page.
    expect(selectionCards(await page(STEP))).toEqual([]);
    const owner = await page(qualification(la, "games"));
    const link = owner.match(/href="(\/curate\/run\/selections-likely\?selection=[^"#]*Athletics[^"#]*)/)![1].replace(/&amp;/g, "&");
    const [card] = selectionCards(await page(link));
    expect(card.card).toBe("Selection · LA 2028 · Athletics");
    expect(card.text).toContain("Belgian Olympic Committee");
    await postFields(STEP, [
      ["intent", "save-selection"],
      ["competition", la],
      ["sport", "Athletics"],
      ["url", "https://www.teambelgium.be/news/first-selection-wave"],
      ["selector", "Belgian Olympic Committee"],
      ["announcedOn", "2028-03-28"],
      ["selected", card.ids["Nafissatou Thiam · Heptathlon"]],
    ]);

    // The Games as a whole enter Selection with the first Selected Entry; swimming is still qualifying.
    const whole = await page(`/games/${la}`);
    expect(panel(whole)?.phase).toBe("Selection");
    expect(panel(whole)?.text).toContain("Selected by Belgian Olympic Committee · 28 Mar 2028");
    expect(rows(whole, "Selected Entries")).toEqual(["Nafissatou Thiam Heptathlon"]);
    expect(panel(await page(`/games/${la}?sport=Athletics`))?.phase).toBe("Selection");
    expect(panel(await page(`/games/${la}?sport=Swimming`))?.phase).toBe("Qualification");
    // Belgium's NOC-owned place in the event links to the Selected Entry.
    expect(rows(await page(`/games/${la}?phase=qualification`), "Quota places")[0]).toContain("NOC-owned Provisional via World Ranking Nafissatou Thiam");
  });

  it("lets the IF entry list replace the press-release Selection", async () => {
    // ISU World Cup #1's competitors (Medard, Swings, Vanhoutte), after a press release that named Sandrine Tas and Bart Swings.
    fixClock(ISU_WORLD_CUP_1_RUN.now);
    await setSource(env.DB, "isu-speed-skating", { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt, blockedAt: null, blockedReason: null });
    const swings = await seedAthlete(env.DB, { name: "Bart Swings", sport: "Speed skating", dateOfBirth: "1991-02-12" });
    const tas = await seedAthlete(env.DB, { name: "Sandrine Tas", sport: "Speed skating", dateOfBirth: "1995-06-01" });
    stubOutboundFetch(isuWorldCup1Run);
    await deliverIngestJobs([{ kind: "fetch-source", source: "isu-speed-skating" }]);
    const db = getDb(env.DB);
    const worldCup = (await db.select().from(schema.competition).where(eq(schema.competition.name, "ISU CNSG Speed Skating World Cup #1")))[0];
    const pressRelease = { qualificationSource: "https://skating.be/selection", selectionSource: "https://skating.be/selection", selectionKind: "press-release", selector: "Skate Belgium", selectedOn: "2026-11-01", checkedOn: "2026-11-01" };
    await db.insert(schema.entry).values([
      { competitionId: worldCup.id, sport: "Speed skating", event: "Mass Start Men", athleteId: swings, qualificationStatus: "selected", ...pressRelease },
      { competitionId: worldCup.id, sport: "Speed skating", event: "Mass Start Women", athleteId: tas, qualificationStatus: "selected", ...pressRelease },
    ]);

    // The next day's run reads the same entry list.
    await setSource(env.DB, "isu-speed-skating", { lastSuccessAt: ISU_WORLD_CUP_1_RUN.lastSuccessAt });
    stubOutboundFetch(isuWorldCup1Run);
    await deliverIngestJobs([{ kind: "fetch-source", source: "isu-speed-skating" }]);

    const entries = await db.select().from(schema.entry).where(eq(schema.entry.competitionId, worldCup.id));
    const of = (athleteId: string) => entries.find((e) => e.athleteId === athleteId)!;
    expect(of(swings)).toMatchObject({ qualificationStatus: "selected", selectionKind: "entry-list", selector: "Skate Belgium", selectionSource: "https://api.isuresults.eu/events/2027_CHN_0001/competitors/" });
    expect(of(tas)).toMatchObject({ qualificationStatus: "not-selected", selectionKind: "entry-list" });
  });
});
