import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntrant, seedParticipationCuration } from "../support/seed";
import { get, OWNER_EMAIL, post, signedInAs } from "../support/worker";

// Spec #20, stories 41–46, 53 and 54; ticket #31: the Championship tab lists
// the upcoming Championships with a Belgian Participation; a Championship's
// page shows the five-step Phase bar, one phase at a time, opening on the
// current phase (marked "now") with earlier phases reachable. Standards shows
// only the expected publication date until the owner records the published
// standards, which then stay visible.
const NOW = "2026-11-14T12:00:00.000Z";

const page = async (path: string, init?: RequestInit) => (await get(path, init)).text();
const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

/** The Championship list's rows, as text. */
function listRows(html: string) {
  const start = html.indexOf('aria-label="Upcoming Championships"');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1]));
}

/** The Phase bar: each step's text, whether it links somewhere, and which one is shown. */
function phaseBar(html: string) {
  const nav = html.match(/<nav class="phases" aria-label="Phases">(.*?)<\/nav>/s)?.[1] ?? "";
  return [...nav.matchAll(/<(a|span)([^>]*)>(.*?)<\/\1>(?=<a|<span class|$)/gs)].map((m) => ({
    step: text(m[3]),
    link: m[1] === "a",
    shown: m[2].includes('aria-current="page"'),
  }));
}

/** The shown phase's panel, as text. */
function panel(html: string) {
  const m = html.match(/<section class="phase" aria-label="([^"]+)">(.*?)<\/section>/s);
  return m ? { phase: m[1], text: text(m[2]) } : undefined;
}

async function worlds() {
  return seedCompetition(env.DB, {
    name: "World Athletics Championships, Beijing",
    sport: "Athletics",
    kind: "championship",
    startDate: "2027-09-11",
    endDate: "2027-09-19",
    city: "Beijing",
    venueZone: "Asia/Shanghai",
    series: "world-athletics:world-championships",
  });
}

describe("Championship tab", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
  });

  it("lists the upcoming Championships with a Belgian Participation, soonest first, each in its current phase", async () => {
    const henveaux = await seedAthlete(env.DB, { name: "Lucas Henveaux", sport: "Swimming" });
    const shortCourse = await seedCompetition(env.DB, {
      name: "European Short Course Swimming Championships",
      sport: "Swimming",
      kind: "championship",
      startDate: "2026-12-01",
      endDate: "2026-12-06",
    });
    await seedEntrant(env.DB, shortCourse, henveaux);
    const beijing = await worlds();
    await seedParticipationCuration(env.DB, beijing, { addedAt: "2026-10-02T10:00:00.000Z", checkedAt: "2026-10-02T10:00:00.000Z" });
    // Going on right now, with a Belgian named.
    const shortTrack = await seedCompetition(env.DB, {
      name: "European Short Track Championships",
      sport: "Short track speed skating",
      kind: "championship",
      startDate: "2026-11-13",
      endDate: "2026-11-15",
      venueZone: "Europe/Warsaw",
    });
    await seedEntrant(env.DB, shortTrack, await seedAthlete(env.DB, { name: "Hanne Desmet", sport: "Short track speed skating" }));

    // Not listed: no Belgian Participation, already over, not a Championship.
    await seedCompetition(env.DB, { name: "World Swimming Championships (25 m)", sport: "Swimming", kind: "championship", startDate: "2026-12-10", endDate: "2026-12-14" });
    const over = await seedCompetition(env.DB, { name: "World Judo Championships", sport: "Judo", kind: "championship", startDate: "2026-10-01", endDate: "2026-10-08" });
    await seedParticipationCuration(env.DB, over, { decision: "confirmed", checkedAt: "2026-10-01T10:00:00.000Z" });
    const circuit = await seedCompetition(env.DB, { name: "Swimming World Cup, Toronto", sport: "Swimming", startDate: "2026-11-20" });
    await seedEntrant(env.DB, circuit, henveaux);

    const html = await page("/championship");

    expect(listRows(html)).toEqual([
      "13–15 Nov European Short Track Championships Short track speed skating · Confirmed · Hanne Desmet · Live",
      "1–6 Dec European Short Course Swimming Championships Swimming · Confirmed · Lucas Henveaux · Standards",
      "11–19 Sept 2027 World Athletics Championships, Beijing Athletics · Likely: added by hand · Standards",
    ]);
    expect(html).toContain(`href="/championship/${beijing}"`);
  });

  it("opens a Championship on Standards, showing only the expected publication date until the standards are published", async () => {
    const beijing = await worlds();

    let html = await page(`/championship/${beijing}`);
    expect(text(html)).toContain("World Athletics Championships, Beijing");
    expect(phaseBar(html)).toEqual([
      { step: "Standards ● now", link: true, shown: true },
      { step: "Qualification", link: false, shown: false },
      { step: "Selection", link: false, shown: false },
      { step: "Live", link: false, shown: false },
      { step: "After", link: false, shown: false },
    ]);
    expect(panel(html)).toEqual({ phase: "Standards", text: "Publication date of the standards not known yet." });

    await post(`/curate/championships/${beijing}/standards`, { expectedOn: "2027-01-15", publishedOn: "", url: "", standards: "" });

    html = await page(`/championship/${beijing}`);
    expect(panel(html)).toEqual({ phase: "Standards", text: "Standards expected 15 Jan 2027." });
  });

  it("moves to Qualification once the owner records the published standards, which stay visible", async () => {
    const beijing = await worlds();

    const saved = await post(`/curate/championships/${beijing}/standards`, {
      expectedOn: "2026-10-01",
      publishedOn: "2026-10-03",
      url: "https://worldathletics.org/beijing27-entry-standards",
      standards: "Heptathlon: 6 500 pts or World Ranking top 24\nMen 400 m: 44.85 or World Ranking top 48",
    });
    expect(saved.status).toBe(303);
    expect(saved.headers.get("Location")).toBe(`/championship/${beijing}`);

    let html = await page(`/championship/${beijing}`);
    expect(phaseBar(html)).toEqual([
      { step: "Standards", link: true, shown: false },
      { step: "Qualification ● now", link: true, shown: true },
      { step: "Selection", link: false, shown: false },
      { step: "Live", link: false, shown: false },
      { step: "After", link: false, shown: false },
    ]);
    expect(panel(html)?.phase).toBe("Qualification");
    expect(panel(html)?.text).toContain("Heptathlon: 6 500 pts or World Ranking top 24");

    html = await page(`/championship/${beijing}?phase=standards`);
    expect(phaseBar(html)[0]).toEqual({ step: "Standards", link: true, shown: true });
    expect(panel(html)).toEqual({
      phase: "Standards",
      text:
        "Published 3 Oct 2026 · source Heptathlon: 6 500 pts or World Ranking top 24 Men 400 m: 44.85 or World Ranking top 48",
    });
    expect(html).toContain('href="https://worldathletics.org/beijing27-entry-standards"');
  });

  it("never opens a later phase than the current one", async () => {
    const beijing = await worlds();

    const html = await page(`/championship/${beijing}?phase=after`);

    expect(panel(html)?.phase).toBe("Standards");
  });

  it("goes Live at midnight venue time on day one when no Session is known, even without standards or a Selection", async () => {
    const beijing = await worlds();
    fixClock("2027-09-10T16:00:00.000Z"); // 00:00 on 11 Sep in Beijing

    const html = await page(`/championship/${beijing}`);

    expect(phaseBar(html).map((s) => s.step)).toEqual(["Standards", "Qualification", "Selection", "Live ● now", "After"]);
    expect(panel(html)?.phase).toBe("Live");
  });

  it("is After once the last competition day has ended at the venue", async () => {
    const beijing = await worlds();
    fixClock("2027-09-19T16:00:00.000Z"); // 00:00 on 20 Sep in Beijing

    const html = await page(`/championship/${beijing}`);

    expect(phaseBar(html).map((s) => s.step)).toEqual(["Standards", "Qualification", "Selection", "Live", "After ● now"]);
    expect(phaseBar(html).every((s) => s.link)).toBe(true);
  });

  it("offers the owner, and only the owner, to record the standards", async () => {
    const beijing = await worlds();

    expect(await page(`/championship/${beijing}`, signedInAs(OWNER_EMAIL))).toContain(`href="/curate/championships/${beijing}/standards"`);
    expect(await page(`/championship/${beijing}`, signedInAs("friend@example.com"))).not.toContain("/curate/");
    const refused = await post(`/curate/championships/${beijing}/standards`, { expectedOn: "2027-01-15" }, signedInAs("friend@example.com"));
    expect(refused.status).toBe(403);
  });

  it("shows the owner's standards form filled with what is recorded", async () => {
    const beijing = await worlds();
    await post(`/curate/championships/${beijing}/standards`, { expectedOn: "2027-01-15", publishedOn: "", url: "", standards: "" });

    const html = await page(`/curate/championships/${beijing}/standards`);

    expect(text(html)).toContain("World Athletics Championships, Beijing");
    expect(html).toMatch(/name="expectedOn"[^>]*value="2027-01-15"/);
  });

  it("has no page for a competition that is not a Championship", async () => {
    const circuit = await seedCompetition(env.DB, { name: "Swimming World Cup, Toronto", sport: "Swimming", startDate: "2026-11-20" });

    expect((await get(`/championship/${circuit}`)).status).toBe(404);
  });
});
