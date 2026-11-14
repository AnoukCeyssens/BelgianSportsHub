import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedRankingSnapshot, seedResult, seedTimetable } from "../support/seed";
import { get, post, signedInAs } from "../support/worker";

// Spec #20, stories 46, 64 and 67–70, 116; ticket #40 (decided in #12 and
// #16). The Selection phase shows each Selected Entry's Seed (monthly
// world-rank snapshots, then the final Seed from the entry list, with its
// method) next to the owner's personal pick. Picks open once the Entry is
// Selected, are entered through shortcuts, can be changed freely (no history)
// and lock at the competition's first Session; at the Games every sport locks
// at the Games' first Session. Picks and Seeds are written by the owner only.
const NOW = "2026-11-14T12:00:00.000Z";

const page = async (path: string, init?: RequestInit) => (await get(path, init)).text();
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** A table's rows (header left out), as text. */
function rows(html: string, label: string) {
  const start = html.indexOf(`aria-label="${label}"`);
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => text(m[1])).slice(1);
}

/** The value of the pick input in the owner's row for an Entry (undefined when the row has no input). */
function pickInput(html: string, entryId: string) {
  const form = html.match(new RegExp(`<form[^>]*>(?:(?!</form>).)*name="entryId" value="${entryId}"(?:(?!</form>).)*</form>`, "s"))?.[0];
  if (!form || !/<input[^>]*name="pick"/.test(form)) return undefined;
  return form.match(/<input[^>]*name="pick"[^>]*>/)?.[0].match(/value="([^"]*)"/)?.[1] ?? "";
}

/** An Athlete with a senior international performance in the last 12 months (Active). */
async function activeAthlete(name: string, sport: string) {
  const id = await seedAthlete(env.DB, { name, sport });
  const meeting = await seedCompetition(env.DB, { name: `${sport} meeting`, sport, startDate: "2026-08-20" });
  await seedResult(env.DB, meeting, id, { date: "2026-08-20" });
  return id;
}

const qualification = (id: string, kind: "championships" | "games") => `/curate/${kind}/${id}/qualification`;
const expectations = (id: string, kind: "championships" | "games" = "championships") => `/curate/${kind}/${id}/expectations`;

/** Adds a potential Entry with a status through the owner's Qualification page. */
async function addEntry(target: string, kind: "championships" | "games", who: string, event: string, status: string) {
  const res = await post(qualification(target, kind), { intent: "add-entry", who, event, status, source: "Selection press release" });
  expect(res.status).toBe(303);
}

/** European Short Course Championships, Lublin: first Session 2 Dec 09:30 in Warsaw (08:30 UTC). */
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
  const vanhoutte = await activeAthlete("Roos Vanhoutte", "Swimming");
  await addEntry(id, "championships", `athlete:${verbeke}`, "Men's 1500 m freestyle", "selected");
  await addEntry(id, "championships", `athlete:${vanhoutte}`, "Women's 200 m backstroke", "eligible");
  await seedTimetable(env.DB, id, "Europe/Warsaw", [{ sport: "Swimming", date: "2026-12-02", start: "09:30", rounds: [["Men's 1500 m freestyle", "Heats"]] }]);
  const html = await page(expectations(id));
  const entryOf = (name: string) => html.match(new RegExp(`data-entry="([^"]+)" data-name="${name}"`))![1];
  return { id, verbeke: entryOf("Lucas Verbeke"), vanhoutte: entryOf("Roos Vanhoutte"), verbekeAthlete: verbeke };
}

const selectedRows = async (id: string) => rows(await page(`/championship/${id}`), "Selected Entries");

describe("Seeds and personal picks", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
  });

  it("makes a pick through a shortcut once the Entry is Selected, and changes it freely with no history", async () => {
    const { id, verbeke, vanhoutte } = await lublin();

    // The owner's page offers a pick for the Selected Entry only, and says when picks lock (Belgian time).
    let owner = await page(expectations(id));
    expect(text(owner)).toContain("Picks lock 2 Dec 2026, 09:30 (Belgian time)");
    expect(pickInput(owner, verbeke)).toBe("");
    expect(pickInput(owner, vanhoutte)).toBeUndefined();

    const picked = await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "Medal" });
    expect(picked.status).toBe(303);
    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle – Medal 1st–3rd"]);

    // Changed: only the new value is kept.
    expect((await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "QF exit" })).status).toBe(303);
    expect((await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "4th-6th" })).status).toBe(303);
    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle – 4th–6th"]);
    owner = await page(expectations(id));
    expect(pickInput(owner, verbeke)).toBe("4-6");

    // Cleared: no pick.
    expect((await post(expectations(id), { intent: "clear-pick", entryId: verbeke })).status).toBe(303);
    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle – –"]);
  });

  it("refuses a pick for an Entry that is not Selected, and a pick that is no shortcut", async () => {
    const { id, verbeke, vanhoutte } = await lublin();
    expect((await post(expectations(id), { intent: "pick", entryId: vanhoutte, pick: "Gold" })).status).toBe(409);
    expect((await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "podium-ish" })).status).toBe(400);
    expect((await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "8-5" })).status).toBe(400);
    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle – –"]);
  });

  it("rejects writes after the lock at the first Session; the locked value stands", async () => {
    const { id, verbeke } = await lublin();
    await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "Bronze" });

    fixClock("2026-12-02T08:29:00.000Z"); // 09:29 in Warsaw: still open
    expect((await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "Silver" })).status).toBe(303);

    fixClock("2026-12-02T08:30:00.000Z"); // 09:30 in Warsaw: the first Session starts
    expect((await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "Gold" })).status).toBe(409);
    expect((await post(expectations(id), { intent: "clear-pick", entryId: verbeke })).status).toBe(409);
    const owner = await page(expectations(id));
    expect(pickInput(owner, verbeke)).toBeUndefined();
    expect(text(owner)).toContain("Picks locked 2 Dec 2026, 09:30 (Belgian time)");
    expect(await selectedRows(`${id}?phase=selection`)).toEqual(["Lucas Verbeke Men's 1500 m freestyle – Silver 2nd"]);
  });

  it("locks at midnight venue time on day one when no Session has a start time", async () => {
    const id = await seedCompetition(env.DB, {
      name: "World Short Course Championships",
      sport: "Swimming",
      kind: "championship",
      startDate: "2026-12-10",
      endDate: "2026-12-15",
      venueZone: "Asia/Singapore",
    });
    const verbeke = await activeAthlete("Lucas Verbeke", "Swimming");
    await addEntry(id, "championships", `athlete:${verbeke}`, "Men's 1500 m freestyle", "selected");
    const entry = (await page(expectations(id))).match(/data-entry="([^"]+)"/)![1];
    fixClock("2026-12-09T15:59:00.000Z"); // 23:59 in Singapore
    expect((await post(expectations(id), { intent: "pick", entryId: entry, pick: "Final" })).status).toBe(303);
    fixClock("2026-12-09T16:00:00.000Z"); // midnight on day one
    expect((await post(expectations(id), { intent: "pick", entryId: entry, pick: "Gold" })).status).toBe(409);
  });

  it("at the Games every sport locks at the Games' first Session", async () => {
    const la = await seedCompetition(env.DB, {
      name: "LA 2028",
      sport: "Olympic Games",
      kind: "games",
      source: "owner",
      startDate: "2028-07-12",
      endDate: "2028-07-30",
      venueZone: "America/Los_Angeles",
    });
    const sprinter = await activeAthlete("Rani Rosius", "Athletics");
    await addEntry(la, "games", `athlete:${sprinter}`, "Women's 100 m", "selected");
    await seedTimetable(env.DB, la, "America/Los_Angeles", [
      { sport: "Football", date: "2028-07-12", start: "10:00", rounds: [["Men", "Group stage"]] },
      { sport: "Athletics", date: "2028-07-24", start: "10:00", rounds: [["Women's 100 m", "Round 1"]] },
    ]);
    const entry = (await page(expectations(la, "games"))).match(/data-entry="([^"]+)"/)![1];
    fixClock("2028-07-12T16:59:00.000Z"); // 09:59 in LA on football's first day
    expect((await post(expectations(la, "games"), { intent: "pick", entryId: entry, pick: "Final" })).status).toBe(303);
    fixClock("2028-07-12T17:00:00.000Z"); // football kicks off: athletics locks too
    expect((await post(expectations(la, "games"), { intent: "pick", entryId: entry, pick: "Medal" })).status).toBe(409);
  });

  it("records Seeds as dated snapshots and shows the latest next to the Selection list, with how it moved", async () => {
    const { id, verbeke } = await lublin();
    const seed = (fields: Record<string, string>) => post(expectations(id), { intent: "record-seed", entryId: verbeke, sourceUrl: "", ...fields });

    fixClock("2026-10-02T10:00:00.000Z");
    expect((await seed({ place: "9", method: "world-rank", asOf: "2026-10-01" })).status).toBe(303);
    fixClock(NOW);
    // The monthly world-rank snapshot is due again in November.
    const seedRow = async () => rows(await page(expectations(id)), "Seeds").find((r) => r.startsWith("Lucas Verbeke"));
    expect(await seedRow()).toContain("World-rank snapshot due");
    expect((await seed({ place: "7", method: "world-rank", asOf: "2026-11-04", sourceUrl: "https://www.worldaquatics.com/swimming/rankings" })).status).toBe(303);
    expect(await seedRow()).not.toContain("World-rank snapshot due");
    expect((await seed({ place: "4", method: "federation-seed", asOf: "2026-11-28", sourceUrl: "https://www.len.eu/entry-list" })).status).toBe(303);

    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle 4th federation seed · 28 Nov world ranking 9th → 7th –"]);

    // Re-recording on the same date replaces that snapshot.
    expect((await seed({ place: "3", method: "federation-seed", asOf: "2026-11-28" })).status).toBe(303);
    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle 3rd federation seed · 28 Nov world ranking 9th → 7th –"]);

    // Refused: an unknown method, a place that is no place.
    expect((await seed({ place: "3", method: "vibes", asOf: "2026-11-28" })).status).toBe(400);
    expect((await seed({ place: "medal", method: "ranking", asOf: "2026-11-28" })).status).toBe(400);
  });

  it("takes the monthly world-rank Seed from the ranking the Entry's track follows, until the final Seed", async () => {
    const { id, verbeke, verbekeAthlete } = await lublin();
    const ranking = { source: "world-aquatics", ranking: "World Aquatics world ranking · 1500 m freestyle Men", sport: "Swimming", athleteId: verbekeAthlete };
    const follow = () =>
      post(qualification(id, "championships"), {
        intent: "save-track",
        entryId: verbeke,
        name: "World ranking",
        needed: "Top 16",
        has: "–",
        state: "pending",
        better: "",
        source: "",
        ranking: `${ranking.source}|${ranking.ranking}`,
      });

    await seedRankingSnapshot(env.DB, { ...ranking, position: 9, asOf: "2026-10-06" });
    expect((await follow()).status).toBe(303);
    // A second list in the same month is no new Seed; a list in the next month is.
    await seedRankingSnapshot(env.DB, { ...ranking, position: 8, asOf: "2026-10-27" });
    await follow();
    await seedRankingSnapshot(env.DB, { ...ranking, position: 6, asOf: "2026-11-10" });
    await follow();
    let row = rows(await page(expectations(id)), "Seeds").find((r) => r.startsWith("Lucas Verbeke"));
    expect(row).toContain("9th · world ranking · 6 Oct");
    expect(row).not.toContain("8th");
    expect(row).toContain("6th · world ranking · 10 Nov");
    expect(row).not.toContain("World-rank snapshot due");

    // Once the final Seed exists, rankings no longer add snapshots.
    await post(expectations(id), { intent: "record-seed", entryId: verbeke, place: "5", method: "ranking", asOf: "2026-11-12", sourceUrl: "" });
    fixClock("2026-12-01T10:00:00.000Z");
    await seedRankingSnapshot(env.DB, { ...ranking, position: 4, asOf: "2026-12-01" });
    await follow();
    row = rows(await page(expectations(id)), "Seeds").find((r) => r.startsWith("Lucas Verbeke"));
    expect(row).not.toContain("4th");
    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle 5th entry list by ranking · 12 Nov world ranking 9th → 6th –"]);
  });

  it("lets only the owner write picks and Seeds", async () => {
    const { id, verbeke } = await lublin();
    const friend = signedInAs("friend@example.com");
    expect((await post(expectations(id), { intent: "pick", entryId: verbeke, pick: "Gold" }, friend)).status).toBe(403);
    expect((await get(expectations(id), friend)).status).toBe(403);
    expect(await selectedRows(id)).toEqual(["Lucas Verbeke Men's 1500 m freestyle – –"]);
    // The reader page offers the owner's link only to the owner.
    expect(await page(`/championship/${id}`)).toContain(`href="${expectations(id)}"`);
    expect(await page(`/championship/${id}`, friend)).not.toContain(`href="${expectations(id)}"`);
  });
});
