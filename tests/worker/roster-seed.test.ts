import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { seedAthlete } from "../support/seed";
import { get, runIngest } from "../support/worker";
import { teamBelgiumSeedRun } from "../fixtures/sources/team-belgium";

const athleteLinks = async () => {
  const html = await (await get("/athletes")).text();
  return [...html.matchAll(/<a [^>]*href="(\/athletes\/[^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({ href: m[1], name: m[2] }));
};
const athletePage = async (name: string) => {
  const link = (await athleteLinks()).find((a) => a.name === name);
  expect(link, `${name} on the Athletes list`).toBeDefined();
  return (await get(link!.href)).text();
};

// One recorded seed run: five Team Belgium profiles, of which three have a
// senior international performance in an Olympic sport. Storage is per file,
// so the tests below build on each other in order, like real seed runs do.
describe("roster seed from Team Belgium and Wikidata", () => {
  beforeAll(async () => {
    // Already on the roster by hand (db/seed/dev.sql), without a Team Belgium ID.
    await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics", dateOfBirth: "1994-08-19" });
  });

  it("makes Athletes of senior international performers in Olympic sports only", async () => {
    fixClock("2026-11-14T04:00:00.000Z");
    stubOutboundFetch(teamBelgiumSeedRun);

    const outcome = await runIngest([{ kind: "seed-roster" }]);

    expect(outcome.retried).toEqual([]);
    // Nafy Thiam has EYOF results only; Lieze Desmet has no results at all.
    expect((await athleteLinks()).map((a) => a.name)).toEqual(["Fran Vanhoutte", "Hanne Desmet", "Nafissatou Thiam"]);
  });

  it("shows the Athlete header: sport, date of birth, Athlete since and linked external IDs, no photo", async () => {
    const html = await athletePage("Nafissatou Thiam");

    expect(html).toContain("<h1>Nafissatou Thiam</h1>");
    expect(html).toContain("Athletics · born 19 Aug 1994 · Athlete since 2014 (European Championships)");
    expect(html).toContain('<a href="https://www.teambelgium.be/atleten/Nafissatou-Thiam-347">Team Belgium Nafissatou-Thiam-347</a>');
    expect(html).toContain('<a href="https://worldathletics.org/athletes/_/14428253">World Athletics 14428253</a>');
    expect(html).toContain('<a href="https://www.olympedia.org/athletes/129137">Olympedia 129137</a>');
    expect(html).toContain('<a href="https://www.wikidata.org/wiki/Q4167514">Wikidata Q4167514</a>');
    expect(html).not.toContain("<img");
  });

  it("keeps only the Olympic sport of a multi-sport profile", async () => {
    // Team Belgium lists inline skating and speed skating for her.
    const html = await athletePage("Fran Vanhoutte");

    expect(html).toContain("Speed skating · born 24 May 2003 · Athlete since");
    expect(html).not.toMatch(/inline/i);
  });

  it("keeps every input as received in R2", async () => {
    const teamBelgium = await env.RAW.list({ prefix: "raw/team-belgium/", include: ["customMetadata"] });
    const wikidata = await env.RAW.list({ prefix: "raw/wikidata/", include: ["customMetadata"] });

    // Sitemap index, three child sitemaps, five profiles.
    expect(teamBelgium.objects.map((o) => o.customMetadata?.url).sort()).toEqual(
      teamBelgiumSeedRun.filter((r) => r.url.startsWith("https://www.teambelgium.be/")).map((r) => r.url).sort(),
    );
    expect(wikidata.objects).toHaveLength(1);
  });

  it("can be re-run when a Games delegation is announced without creating duplicates", async () => {
    const before = await athleteLinks();
    fixClock("2027-12-01T09:00:00.000Z");
    stubOutboundFetch(teamBelgiumSeedRun);

    const outcome = await runIngest([{ kind: "seed-roster" }]);

    expect(outcome.retried).toEqual([]);
    expect(await athleteLinks()).toEqual(before);
    const html = await athletePage("Nafissatou Thiam");
    expect(html.match(/Team Belgium Nafissatou-Thiam-347/g)).toHaveLength(1);
  });
});
