import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedResult, seedTimetable } from "../support/seed";
import { get, post, signedInAs } from "../support/worker";

// Spec #20, stories 48, 51–52, 65–66 and 71–75; ticket #41. The After phase
// compares every Expectation with the official outcome: one Verdict per source
// per Entry (Seed, Gracenote at the Games, the owner's pick) with the raw
// places, a Beat/Met/Missed tally per source, Belgium's medal and top-8 counts
// against the counts the Expectations imply (and the BOIC target at the
// Games), Belgium's best results and the final medal table. Each source is
// compared with its last snapshot before the start. A pick for an Entry
// withdrawn before the lock is voided; a DNS after it is Missed.
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

/** An Athlete with a senior international performance in the last 12 months (Active). */
async function activeAthlete(name: string, sport: string) {
  const id = await seedAthlete(env.DB, { name, sport });
  const meeting = await seedCompetition(env.DB, { name: `${sport} meeting ${name}`, sport, startDate: "2026-08-20" });
  await seedResult(env.DB, meeting, id, { date: "2026-08-20" });
  return id;
}

type Kind = "championships" | "games";
const qualification = (id: string, kind: Kind) => `/curate/${kind}/${id}/qualification`;
const expectations = (id: string, kind: Kind) => `/curate/${kind}/${id}/expectations`;

async function addEntry(target: string, kind: Kind, athlete: string, event: string) {
  const res = await post(qualification(target, kind), { intent: "add-entry", who: `athlete:${athlete}`, event, status: "selected", source: "Selection press release" });
  expect(res.status).toBe(303);
}

/** The Entry ids on the owner's Seeds table, by Athlete name. */
async function entryIds(target: string, kind: Kind) {
  const html = await page(expectations(target, kind));
  return Object.fromEntries([...html.matchAll(/data-entry="([^"]+)" data-name="([^"]+)"/g)].map((m) => [m[2], m[1]]));
}

const ok = async (res: Promise<Response>) => expect((await res).status).toBe(303);

describe("After: Verdicts, tallies and implied counts", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
  });

  it("gives each Expectation a Verdict against the official place, tallies them per source and compares the implied counts", async () => {
    // European Short Course Championships, Lublin, 2–7 Dec; picks lock at the first Session, 2 Dec 09:30 in Warsaw.
    const lublin = await seedCompetition(env.DB, {
      name: "European Short Course Swimming Championships, Lublin",
      sport: "Swimming",
      kind: "championship",
      startDate: "2026-12-02",
      endDate: "2026-12-07",
      venueZone: "Europe/Warsaw",
    });
    await seedTimetable(env.DB, lublin, "Europe/Warsaw", [{ sport: "Swimming", date: "2026-12-02", start: "09:30", rounds: [["Men's 1500 m freestyle", "Heats"]] }]);
    const athletes = {
      verbeke: await activeAthlete("Lucas Verbeke", "Swimming"),
      vanhoutte: await activeAthlete("Roos Vanhoutte", "Swimming"),
      gaspard: await activeAthlete("Florine Gaspard", "Swimming"),
      ndebele: await activeAthlete("Kobe Ndebele", "Swimming"),
    };
    await addEntry(lublin, "championships", athletes.verbeke, "Men's 1500 m freestyle");
    await addEntry(lublin, "championships", athletes.vanhoutte, "Women's 200 m backstroke");
    await addEntry(lublin, "championships", athletes.gaspard, "Women's 50 m freestyle");
    await addEntry(lublin, "championships", athletes.ndebele, "Men's 100 m freestyle");
    const entry = await entryIds(lublin, "championships");
    const seed = (name: string, place: string, asOf: string) =>
      ok(post(expectations(lublin, "championships"), { intent: "record-seed", entryId: entry[name], place, method: "federation-seed", asOf, sourceUrl: "https://www.len.eu/entry-list" }));
    const pick = (name: string, value: string) => ok(post(expectations(lublin, "championships"), { intent: "pick", entryId: entry[name], pick: value }));

    await seed("Lucas Verbeke", "4", "2026-11-28");
    await seed("Roos Vanhoutte", "2", "2026-11-28");
    await seed("Kobe Ndebele", "12", "2026-11-28");
    await pick("Lucas Verbeke", "5-8");
    await pick("Roos Vanhoutte", "Medal");
    await pick("Florine Gaspard", "Final");
    // Kobe Ndebele is left unpicked: no personal Verdict.

    // Roos Vanhoutte withdraws the evening before the first Session (recorded later, with the moment it happened).
    fixClock("2026-12-02T10:00:00.000Z");
    await ok(
      post(qualification(lublin, "championships"), {
        intent: "set-status",
        entryId: entry["Roos Vanhoutte"],
        status: "withdrawn",
        source: "https://www.belgianswimming.be/news",
        withdrawnAt: "2026-12-01T19:00",
      }),
    );
    // A Seed recorded after the start is not compared (story 75).
    await seed("Lucas Verbeke", "1", "2026-12-03");
    // Florine Gaspard does not start her heat (DNS after the lock); the owner marks her withdrawn then.
    fixClock("2026-12-04T09:00:00.000Z");
    await ok(
      post(qualification(lublin, "championships"), { intent: "set-status", entryId: entry["Florine Gaspard"], status: "withdrawn", source: "LEN results: DNS" }),
    );
    // Equal 5th (a shared place counts as its best) against a 5th–8th pick: Met.
    await seedResult(env.DB, lublin, athletes.verbeke, { event: "Men's 1500 m freestyle", date: "2026-12-06", place: 5 });
    await seedResult(env.DB, lublin, athletes.ndebele, { event: "Men's 100 m freestyle", date: "2026-12-05", place: 3 });

    fixClock("2026-12-10T12:00:00.000Z");
    const after = await page(`/championship/${lublin}`);
    expect(after).toContain('aria-label="After"');
    expect(rows(after, "Expectations vs outcome")).toEqual([
      "Florine Gaspard Women's 50 m freestyle – 1st–8th Missed Withdrawn",
      "Kobe Ndebele Men's 100 m freestyle 12th Beat – 3rd",
      "Lucas Verbeke Men's 1500 m freestyle 4th Missed 5th–8th Met 5th",
      "Roos Vanhoutte Women's 200 m backstroke 2nd Voided 1st–3rd Voided Withdrawn",
    ]);
    expect(rows(after, "Tally")).toEqual(["Seed 1 0 1", "My pick 0 1 1"]);
    // A Championship has no BOIC target or Gracenote: Belgium against the Seed- and pick-implied counts only.
    expect(rows(after, "Medals and top 8")).toEqual(["Belgium 1 2", "Implied by Seeds 0 1", "Implied by my picks 0 2"]);
    expect(rows(after, "Best results")).toEqual(["B Kobe Ndebele Men's 100 m freestyle", "5th Lucas Verbeke Men's 1500 m freestyle"]);
    expect(text(after)).toContain("Final medal table");

    // No Expectation vs outcome on the Athlete page (story 32).
    const athletePage = text(await page(`/athletes/${athletes.verbeke}`));
    expect(athletePage).not.toMatch(/\b(Met|Missed|Beat|Voided)\b/);
    expect(athletePage).not.toContain("5th–8th");
  });

  it("at the Games compares Gracenote picks and the BOIC target, entered by hand, attributed and linked", async () => {
    const la = await seedCompetition(env.DB, {
      name: "LA 2028",
      sport: "Olympic Games",
      kind: "games",
      source: "owner",
      startDate: "2028-07-14",
      endDate: "2028-07-30",
      venueZone: "America/Los_Angeles",
    });
    for (const [sport, first, last] of [
      ["Athletics", "2028-07-15", "2028-07-30"],
      ["Swimming", "2028-07-15", "2028-07-23"],
    ])
      await env.DB.prepare("INSERT INTO games_sport_window (competition_id, sport, first_day, last_day, source_url, checked_on) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(la, sport, first, last, "https://la28.org/schedule", "2026-11-14")
        .run();
    await seedTimetable(env.DB, la, "America/Los_Angeles", [{ sport: "Athletics", date: "2028-07-15", start: "10:00", rounds: [["Women's heptathlon", "100 m hurdles"]] }]);
    const thiam = await activeAthlete("Nafissatou Thiam", "Athletics");
    const doom = await activeAthlete("Alexander Doom", "Athletics");
    await addEntry(la, "games", thiam, "Women's heptathlon");
    await addEntry(la, "games", doom, "Men's 400 m");
    const entry = await entryIds(la, "games");
    const gracenote = (name: string, place: string, asOf: string) =>
      post(expectations(la, "games"), {
        intent: "record-gracenote",
        entryId: entry[name],
        place,
        asOf,
        sourceUrl: "https://sporza.be/nl/2028/07/10/gracenote-voorspelling",
      });

    // Gracenote picks: dated snapshots; the last before the start counts.
    await ok(gracenote("Nafissatou Thiam", "Silver", "2028-04-05"));
    await ok(gracenote("Nafissatou Thiam", "Gold", "2028-07-10"));
    await ok(gracenote("Alexander Doom", "Bronze", "2028-07-10"));
    await ok(gracenote("Alexander Doom", "Gold", "2028-07-20")); // after the start: ignored
    // A Gracenote pick needs its link.
    expect((await post(expectations(la, "games"), { intent: "record-gracenote", entryId: entry["Alexander Doom"], place: "Gold", asOf: "2028-07-10", sourceUrl: "" })).status).toBe(400);
    // The BOIC target is a delegation-level count, not an Expectation.
    await ok(post(expectations(la, "games"), { intent: "boic-target", medals: "8", top8: "25", statedOn: "2028-06-30", sourceUrl: "https://www.teambelgium.be/news/ambitie" }));
    const owner = text(await page(expectations(la, "games")));
    expect(owner).toContain("1st · Gracenote · 10 Jul");
    expect(owner).toContain("BOIC target: 8 medals · 25 top-8 places");

    await seedResult(env.DB, la, thiam, { event: "Women's heptathlon", date: "2028-07-16", place: 2 });
    await seedResult(env.DB, la, doom, { event: "Men's 400 m", date: "2028-07-20", place: 6 });

    fixClock("2028-08-02T12:00:00.000Z");
    const after = await page(`/games/${la}`);
    expect(rows(after, "Expectations vs outcome")).toEqual([
      "Alexander Doom Men's 400 m – 3rd Missed – 6th",
      "Nafissatou Thiam Women's heptathlon – 1st Missed – 2nd",
    ]);
    expect(text(after)).toContain("Gracenote via sporza.be");
    expect(after).toContain('href="https://sporza.be/nl/2028/07/10/gracenote-voorspelling"');
    expect(rows(after, "Tally")).toEqual(["Seed 0 0 0", "Gracenote 0 0 2", "My pick 0 0 0"]);
    expect(rows(after, "Medals and top 8")).toEqual(["Belgium 1 2", "BOIC target 8 25", "Implied by Seeds 0 0", "Implied by Gracenote 2 2", "Implied by my picks 0 0"]);

    // Sport chips filter the After panel; the BOIC target is the whole delegation's.
    const swimming = await page(`/games/${la}?sport=Swimming`);
    expect(rows(swimming, "Expectations vs outcome")).toEqual([]);
    expect(rows(swimming, "Medals and top 8")).not.toContain("BOIC target 8 25");
  });

  it("lets only the owner enter Gracenote picks and the BOIC target, at the Games only", async () => {
    const la = await seedCompetition(env.DB, { name: "LA 2028", sport: "Olympic Games", kind: "games", source: "owner", startDate: "2028-07-14", endDate: "2028-07-30" });
    const champs = await seedCompetition(env.DB, { name: "Worlds", sport: "Athletics", kind: "championship", startDate: "2027-08-20", endDate: "2027-08-29" });
    const thiam = await activeAthlete("Nafissatou Thiam", "Athletics");
    await addEntry(champs, "championships", thiam, "Women's heptathlon");
    const entry = await entryIds(champs, "championships");
    const friend = signedInAs("friend@example.com");
    const target = { intent: "boic-target", medals: "8", top8: "25", statedOn: "2028-06-30", sourceUrl: "https://www.teambelgium.be/news" };
    expect((await post(expectations(la, "games"), target, friend)).status).toBe(403);
    // Championships have no Gracenote and no BOIC target.
    expect((await post(expectations(champs, "championships"), target)).status).toBe(400);
    expect(
      (await post(expectations(champs, "championships"), { intent: "record-gracenote", entryId: entry["Nafissatou Thiam"], place: "Gold", asOf: "2027-08-01", sourceUrl: "https://sporza.be/x" })).status,
    ).toBe(400);
  });
});
