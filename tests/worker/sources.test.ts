import { describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { get, getDeployed, post, signedInAs } from "../support/worker";

// #20 review, finding B (spec #20, stories 89–97): a Source row for every
// Assisted and Manual sport (research/summer-sport-sources,
// research/winter-sport-sources), and the owner's screen to add and edit them.
const SOURCES = "/curate/sources";

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The Sources table's rows, as the owner reads them. */
async function sourceRows() {
  const html = await (await get(SOURCES)).text();
  const table = html.slice(html.indexOf('aria-label="Sources"'), html.indexOf("</table>"));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) => text(m[1])).filter((r) => !r.startsWith("Source Tier"));
}

const row = (rows: string[], name: string) => rows.find((r) => r.startsWith(name));

const newSource = {
  key: "world-climbing-europe",
  name: "World Climbing Europe (results)",
  tier: "assisted",
  cadenceDays: "14",
  sport: "climbing",
  idScheme: "world-climbing",
  url: "https://www.worldclimbing-europe.example/results",
  notes: "European Championships only",
};

describe("Sources", () => {
  it("has a row for the Assisted and Manual sports, with tier, cadence, sport, ID scheme and where to read them", async () => {
    const rows = await sourceRows();

    expect(row(rows, "BWF badminton")).toMatch(/^BWF badminton \(tournamentsoftware.com\) Assisted 7 days Badminton bwf HTML tables, bot-protected/);
    expect(row(rows, "FIG gymnastics")).toMatch(/^FIG gymnastics \(gymnastics.sport\) Manual 7 days several fig PDF-heavy/);
    expect(row(rows, "IBU biathlon")).toMatch(/^IBU biathlon \(biathlonresults.com\) Assisted 7 days Biathlon ibu /);
    expect(row(rows, "World Curling")).toMatch(/^World Curling \(results.worldcurling.org\) Assisted 30 days Curling wcf /);
    expect(row(rows, "World Taekwondo")).toMatch(/^World Taekwondo \(worldtaekwondo.org\) Manual 7 days Taekwondo world-taekwondo /);
    // Automatic sources keep their tier, and now say where they are read.
    expect(row(rows, "ISU speed skating")).toMatch(/^ISU speed skating \(api.isuresults.eu\) Automatic day Speed skating isu/);
    const html = await (await get(SOURCES)).text();
    expect(html).toContain('<a href="https://www.biathlonresults.com/">IBU biathlon (biathlonresults.com)</a>');
    expect(html).toContain('<a href="https://api.isuresults.eu/docs/">ISU speed skating (api.isuresults.eu)</a>');
  });

  it("links the Run sheet's Source health step and the Sources screen to each other", async () => {
    fixClock("2026-11-14T12:00:00.000Z");
    expect(await (await get("/curate/run/source-health")).text()).toMatch(/<a href="\/curate\/sources"[^>]*>Edit sources<\/a>/);
    expect(await (await get(SOURCES)).text()).toMatch(/<a href="\/curate\/run\/source-health"[^>]*>Source health<\/a>/);
  });

  it("adds an Assisted source, storing its sport by its Olympic programme name", async () => {
    fixClock("2026-11-14T12:00:00.000Z");
    const res = await post(SOURCES, newSource);

    expect(res.status).toBe(303);
    expect(row(await sourceRows(), "World Climbing Europe")).toBe(
      "World Climbing Europe (results) Assisted 14 days Sport climbing world-climbing European Championships only Edit",
    );
    // Its key is taken now.
    expect(await (await post(SOURCES, newSource)).status).toBe(400);
  });

  it("edits a source's tier, cadence, sport, URL and notes", async () => {
    const page = await (await get("/curate/sources/fil-luge")).text();
    expect(text(page)).toContain("Edit FIL luge (fil-luge.org)");

    const res = await post("/curate/sources/fil-luge", {
      name: "FIL luge (fil-luge.org)",
      tier: "manual",
      cadenceDays: "7",
      sport: "Luge",
      idScheme: "fil",
      url: "https://www.fil-luge.org/en/results",
      notes: "Results as PDF this season",
    });

    expect(res.status).toBe(303);
    expect(row(await sourceRows(), "FIL luge")).toBe("FIL luge (fil-luge.org) Manual 7 days Luge fil Results as PDF this season Edit");
  });

  it.each([
    { name: "an unknown tier", change: { tier: "scraped" } },
    { name: "a name that is no sport", change: { sport: "Aquatics" } },
    { name: "a cadence below a day", change: { cadenceDays: "0" } },
    { name: "a URL that is no web address", change: { url: "ftp://fil.example" } },
    { name: "Automatic without an adapter", change: { tier: "automatic" } },
  ])("refuses $name", async ({ change }) => {
    const res = await post("/curate/sources/fil-luge", {
      name: "FIL luge (fil-luge.org)",
      tier: "assisted",
      cadenceDays: "14",
      sport: "Luge",
      idScheme: "fil",
      url: "https://www.fil-luge.org/en/results",
      notes: "",
      ...change,
    });

    expect(res.status).toBe(400);
  });

  it("is the owner's only: on a deployed copy anyone else gets 403", async () => {
    expect((await getDeployed(SOURCES, signedInAs("someone@example.com"))).status).toBe(403);
    expect((await getDeployed(SOURCES)).status).toBe(403);
  });
});
