import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { seedAthlete } from "../support/seed";
import { get } from "../support/worker";

const athleteNames = (html: string) =>
  [...html.matchAll(/<a [^>]*href="\/athletes\/[^"]+"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);

// Storage is per test file, so the roster is arranged once for every search.
describe("Athletes list search", () => {
  beforeAll(async () => {
    await seedAthlete(env.DB, { name: "Nafissatou Thiam", sport: "Athletics" });
    await seedAthlete(env.DB, { name: "Nafy Thiam", sport: "Athletics" });
    await seedAthlete(env.DB, { name: "Hanne Desmet", sport: "Short track speed skating" });
    await seedAthlete(env.DB, { name: "Fran Vanhoutte", sport: "Speed skating" });
  });

  it("finds Athletes by any part of their name, ignoring accents, and keeps the search in the box", async () => {
    const html = await (await get("/athletes?q=thi%C3%A0m")).text();

    expect(athleteNames(html)).toEqual(["Nafissatou Thiam", "Nafy Thiam"]);
    expect(html).toMatch(/<input[^>]*name="q"[^>]*value="thiàm"/);
  });

  it("lists everyone alphabetically without a search", async () => {
    const html = await (await get("/athletes")).text();

    expect(athleteNames(html)).toEqual(["Fran Vanhoutte", "Hanne Desmet", "Nafissatou Thiam", "Nafy Thiam"]);
  });

  it("says so when nobody matches", async () => {
    const html = await (await get("/athletes?q=evenepoel")).text();

    expect(athleteNames(html)).toEqual([]);
    expect(html).toContain("No Athlete matches “evenepoel”.");
  });
});
