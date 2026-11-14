import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, seedTeam } from "../support/seed";
import { get, post } from "../support/worker";

// Spec #20, stories 78–81, 83, 85 and 86; ADR 0002; ticket #36. The owner
// records Belgium's Quota places per Games and event (NOC-owned or named)
// through their lifecycle, with source and last-checked date; the Games'
// Qualification phase shows them next to (not instead of) each Entry's
// Qualification status. A named place links to its Entry when earned, an
// NOC-owned place at Selection. Championships have no Quota places.
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

/** The rows of a table on the page, by its aria-label, as text (header row left out). */
function rows(html: string, label: string) {
  const start = html.indexOf(`aria-label="${label}"`);
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).slice(1);
}
const quotaRows = (html: string) => rows(html, "Quota places");
const entryRows = (html: string) => rows(html, "Potential Entries");

/** The shown phase's panel, as text. */
function panel(html: string) {
  const m = html.match(/<section class="phase" aria-label="([^"]+)">(.*?)<\/section>/s);
  return m ? { phase: m[1], text: text(m[2]) } : undefined;
}

/** The id of a potential Entry on the owner's qualification page, by its "<who> · <event>" heading. */
function entryIdOn(html: string, heading: string) {
  const start = html.indexOf(`aria-label="${heading.replace(/'/g, "&#x27;")}"`);
  expect(start, `no Entry "${heading}" on the page`).toBeGreaterThan(-1);
  return html.slice(start).match(/name="entryId" value="([^"]+)"/)![1];
}

/** The ids of the Quota places on the owner's page, in order. */
function placeIdsOn(html: string) {
  return [...html.matchAll(/name="placeId" value="([^"]+)"/g)].map((m) => m[1]).filter((id, i, all) => all.indexOf(id) === i);
}

const curate = (id: string, kind: "games" | "championships" = "games") => `/curate/${kind}/${id}/qualification`;

async function la2028() {
  const id = await seedCompetition(env.DB, {
    name: "LA 2028",
    sport: "Olympic Games",
    kind: "games",
    source: "owner",
    startDate: "2028-07-14",
    endDate: "2028-07-30",
    venueZone: "America/Los_Angeles",
  });
  await post(`/curate/games/${id}/standards`, { expectedOn: "", publishedOn: "2026-11-10", url: "", standards: "", closesOn: "2028-06-11" });
  return id;
}

/** An Athlete with a senior international performance in the last 12 months (Active). */
async function activeAthlete(name: string, sport: string) {
  const id = await seedAthlete(env.DB, { name, sport });
  const meeting = await seedCompetition(env.DB, { name: `${sport} meeting`, sport, startDate: "2026-08-20" });
  await seedResult(env.DB, meeting, id, { date: "2026-08-20" });
  return id;
}

/** A Team with a result in the last 12 months (Active). */
async function activeTeam(name: string, sport: string, event: string, kind: "default" | "partnership" = "default") {
  const db = getDb(env.DB);
  const team = await seedTeam(env.DB, { name, sport, event, kind });
  const competition = await seedCompetition(env.DB, { name: `${sport} ${event} 2026`, sport, startDate: "2026-06-20" });
  const { rawCopyId } = (await db.query.competition.findFirst({ where: eq(schema.competition.id, competition) }))!;
  await db.insert(schema.result).values({ competitionId: competition, teamId: team, event, date: "2026-06-20", place: 1, status: "finished", source: "test-source", sourceRef: crypto.randomUUID(), rawCopyId });
  return team;
}

describe("Quota places", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
  });

  it("shows men's hockey's Quota place Allocated via the FIH Pro League next to the Red Lions' Qualified status", async () => {
    const la = await la2028();
    const lions = await activeTeam("Red Lions", "Hockey", "Men");
    await post(curate(la), { intent: "add-entry", who: `team:${lions}`, event: "Men", status: "qualified", source: "https://www.fih.hockey/news/belgium-qualify" });

    const added = await post(curate(la), {
      intent: "add-quota-places",
      sport: "Hockey",
      event: "Men",
      kind: "noc",
      how: "allocate",
      count: "1",
      earnedVia: "FIH Pro League 2026–27",
      entryId: "",
      source: "https://www.fih.hockey/news/pro-league-olympic-quota",
    });
    expect(added.status).toBe(303);

    const html = await page(`/games/${la}`);
    expect(panel(html)?.phase).toBe("Qualification");
    expect(entryRows(html)).toEqual(["Red Lions Men Qualified"]);
    expect(panel(html)?.text).toContain("Quota places 1 allocated");
    expect(quotaRows(html)).toEqual([
      "Hockey · Men NOC-owned Allocated via FIH Pro League 2026–27 at Selection https://www.fih.hockey/news/pro-league-olympic-quota · checked 14 Nov 2026",
    ]);
  });

  it("keeps equestrian team places Provisional until checked against the FEI, stamping each check", async () => {
    const la = await la2028();
    await post(curate(la), {
      intent: "add-quota-places",
      sport: "Equestrian",
      event: "Team eventing",
      kind: "noc",
      how: "hold",
      count: "1",
      earnedVia: "FEI Olympic ranking",
      entryId: "",
      source: "Equestrian federation news, 10 Nov",
    });
    expect(quotaRows(await page(`/games/${la}`))).toEqual([
      "Equestrian · Team eventing NOC-owned Provisional via FEI Olympic ranking at Selection Equestrian federation news, 10 Nov · checked 14 Nov 2026",
    ]);

    // Moving a place needs a source; illegal moves are refused.
    const [place] = placeIdsOn(await page(curate(la)));
    expect((await post(curate(la), { intent: "move-quota-place", placeId: place, event: "allocate", source: "" })).status).toBe(400);
    expect((await post(curate(la), { intent: "move-quota-place", placeId: place, event: "accept", source: "https://inside.fei.org/x" })).status).toBe(400);

    fixClock("2026-12-02T09:00:00.000Z");
    const moved = await post(curate(la), { intent: "move-quota-place", placeId: place, event: "allocate", source: "https://inside.fei.org/olympic-allocation" });
    expect(moved.status).toBe(303);
    expect(quotaRows(await page(`/games/${la}`))).toEqual([
      "Equestrian · Team eventing NOC-owned Allocated via FEI Olympic ranking at Selection https://inside.fei.org/olympic-allocation · checked 2 Dec 2026",
    ]);
  });

  it("records n places for a nation ranking that earns n, while three Belgians chase two NOC-owned places as Eligible", async () => {
    const la = await la2028();
    const names = ["Wout van Aert", "Remco Evenepoel", "Jasper Stuyven"];
    const riders = [];
    for (const name of names) riders.push(await activeAthlete(name, "Cycling road"));
    for (const rider of riders) {
      await post(curate(la), { intent: "add-entry", who: `athlete:${rider}`, event: "Men's road race", status: "eligible", source: "UCI nation ranking" });
    }

    await post(curate(la), {
      intent: "add-quota-places",
      sport: "Cycling road",
      event: "Men's road race",
      kind: "noc",
      how: "hold",
      count: "2",
      earnedVia: "UCI nation ranking (#4)",
      entryId: "",
      source: "https://www.uci.org/rankings/nations",
    });

    let html = await page(`/games/${la}`);
    expect(panel(html)?.text).toContain("Quota places 2 provisional");
    expect(quotaRows(html).map((r) => r.slice(0, r.indexOf(" at Selection")))).toEqual([
      "Cycling road · Men's road race place 1 of 2 NOC-owned Provisional via UCI nation ranking (#4)",
      "Cycling road · Men's road race place 2 of 2 NOC-owned Provisional via UCI nation ranking (#4)",
    ]);
    expect(entryRows(html)).toEqual([
      "Jasper Stuyven Men's road race Eligible",
      "Remco Evenepoel Men's road race Eligible",
      "Wout van Aert Men's road race Eligible",
    ]);

    // An Eligible Entry cannot hold an NOC-owned place; at Selection it links.
    const owner = await page(curate(la));
    const [first] = placeIdsOn(owner);
    const remco = entryIdOn(owner, "Remco Evenepoel · Men's road race");
    expect((await post(curate(la), { intent: "link-quota-place", placeId: first, entryId: remco })).status).toBe(400);

    await post(curate(la), { intent: "set-status", entryId: remco, status: "selected", source: "BOIC board, 2 Jun 2028" });
    html = await page(`/games/${la}`);
    expect(quotaRows(html)[0]).toContain("place 1 of 2 NOC-owned Provisional via UCI nation ranking (#4) Remco Evenepoel");
    expect(quotaRows(html)[1]).toContain("place 2 of 2 NOC-owned Provisional via UCI nation ranking (#4) at Selection");
  });

  it("links a named place to the Entry that earned it", async () => {
    const la = await la2028();
    const casse = await activeAthlete("Matthias Casse", "Judo");
    await post(curate(la), { intent: "add-entry", who: `athlete:${casse}`, event: "Men -81 kg", status: "qualified", source: "IJF World Ranking List" });
    const entry = entryIdOn(await page(curate(la)), "Matthias Casse · Men -81 kg");

    const unnamed = { intent: "add-quota-places", sport: "Judo", event: "Men -81 kg", kind: "named", how: "hold", count: "1", earnedVia: "IJF Olympic ranking", source: "https://www.ijf.org/wrl" };
    expect((await post(curate(la), { ...unnamed, entryId: "" })).status).toBe(400);
    expect((await post(curate(la), { ...unnamed, entryId: entry, count: "2" })).status).toBe(400);
    await post(curate(la), { ...unnamed, sport: "", event: "", entryId: entry });

    const html = await page(`/games/${la}`);
    expect(quotaRows(html)).toEqual(["Judo · Men -81 kg Named Provisional via IJF Olympic ranking Matthias Casse https://www.ijf.org/wrl · checked 14 Nov 2026"]);
    expect(html).toContain(`href="/athletes/${casse}"`);
  });

  it("passes a rowing double's place to a new partnership at Selection, and enters it once accepted", async () => {
    const la = await la2028();
    const old = await activeTeam("Tim Brys / Niels Van Zandweghe", "Rowing", "Men's double sculls", "partnership");
    const fresh = await activeTeam("Tibo Vyvey / Aaron Andries", "Rowing", "Men's double sculls", "partnership");
    await post(curate(la), { intent: "add-entry", who: `team:${old}`, event: "Men's double sculls", status: "selected", source: "BOIC board" });
    await post(curate(la), {
      intent: "add-quota-places",
      sport: "Rowing",
      event: "Men's double sculls",
      kind: "noc",
      how: "allocate",
      count: "1",
      earnedVia: "World Rowing Championships 2027",
      entryId: "",
      source: "https://worldrowing.com/la28-quota",
    });
    const owner = await page(curate(la));
    const [place] = placeIdsOn(owner);
    const oldEntry = entryIdOn(owner, "Tim Brys / Niels Van Zandweghe · Men's double sculls");
    // Selected before the place was recorded: it links as it is recorded.
    expect(quotaRows(await page(`/games/${la}`))[0]).toContain("Allocated via World Rowing Championships 2027 Tim Brys");

    // The place passes to the new partnership: old Team Not selected, new Team Selected.
    await post(curate(la), { intent: "set-status", entryId: oldEntry, status: "not-selected", source: "BOIC board, 2 Jun 2028" });
    await post(curate(la), { intent: "add-entry", who: `team:${fresh}`, event: "Men's double sculls", status: "selected", source: "BOIC board, 2 Jun 2028" });

    let html = await page(`/games/${la}`);
    expect(quotaRows(html)[0]).toContain("Allocated via World Rowing Championships 2027 Tibo Vyvey");
    expect(entryRows(html)).toEqual(["Tibo Vyvey / Aaron Andries Men's double sculls Selected", "Tim Brys / Niels Van Zandweghe Men's double sculls Not selected"]);

    await post(curate(la), { intent: "move-quota-place", placeId: place, event: "accept", source: "BOIC confirmation to World Rowing" });
    await post(curate(la), { intent: "move-quota-place", placeId: place, event: "enter", source: "LA28 entries list" });
    html = await page(`/games/${la}`);
    expect(panel(html)?.text).toContain("Quota places 1 entered");
    expect(quotaRows(html)[0]).toContain("Entered via World Rowing Championships 2027 Tibo Vyvey");
  });

  it("starts a reallocated place at Allocated", async () => {
    const la = await la2028();
    await post(curate(la), {
      intent: "add-quota-places",
      sport: "Shooting",
      event: "Women's 10 m air pistol",
      kind: "noc",
      how: "reallocate",
      count: "1",
      earnedVia: "",
      entryId: "",
      source: "ISSF reallocation list, 3 Apr 2028",
    });
    expect(quotaRows(await page(`/games/${la}`))).toEqual([
      "Shooting · Women's 10 m air pistol NOC-owned Allocated reallocated at Selection ISSF reallocation list, 3 Apr 2028 · checked 14 Nov 2026",
    ]);
  });

  it("gives Championships no Quota places", async () => {
    const worlds = await seedCompetition(env.DB, { name: "World Rowing Championships", sport: "Rowing", kind: "championship", startDate: "2027-09-01", endDate: "2027-09-08" });
    await post(`/curate/championships/${worlds}/standards`, { expectedOn: "", publishedOn: "2026-11-01", url: "", standards: "", closesOn: "2027-08-01" });

    const refused = await post(curate(worlds, "championships"), {
      intent: "add-quota-places",
      sport: "Rowing",
      event: "Men's single sculls",
      kind: "noc",
      how: "hold",
      count: "1",
      earnedVia: "",
      entryId: "",
      source: "x",
    });
    expect(refused.status).toBe(400);
    const html = await page(`/championship/${worlds}`);
    expect(panel(html)?.phase).toBe("Qualification");
    expect(panel(html)?.text).not.toContain("Quota places");
    expect(await page(curate(worlds, "championships"))).not.toContain("add-quota-places");
  });
});
