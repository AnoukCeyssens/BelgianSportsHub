import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { seedAthlete } from "../support/seed";
import { get } from "../support/worker";
import { region } from "../support/html";

describe("Athlete tab", () => {
  it("shows a hand-seeded Athlete from D1 with name, sport, date of birth and external IDs", async () => {
    const id = await seedAthlete(env.DB, {
      name: "Nafissatou Thiam",
      sport: "Athletics",
      dateOfBirth: "1994-08-19",
      externalIds: [
        { scheme: "world-athletics", value: "14428253" },
        { scheme: "wikidata", value: "Q4167514" },
      ],
    });

    const res = await get(`/athletes/${id}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Nafissatou Thiam</h1>");
    expect(html).toContain("Athletics");
    expect(html).toContain("born 19 Aug 1994");
    expect(html).toContain("World Athletics 14428253");
    expect(html).toContain("Wikidata Q4167514");
  });

  it("finds the seeded Athletes, linking to each Athlete page", async () => {
    const id = await seedAthlete(env.DB, { name: "Remco Evenepoel", sport: "Cycling road", dateOfBirth: "2000-01-25" });

    const html = await (await get("/athletes?q=remco")).text();

    expect(html).toContain(`href="/athletes/${id}"`);
    expect(html).toContain("Remco Evenepoel");
  });

  it("answers 404 for an unknown Athlete", async () => {
    const res = await get("/athletes/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("puts the four reader tabs along the bottom, Athlete first", async () => {
    const html = await (await get("/athletes")).text();
    const tabs = region(html, "Sections", "nav") ?? "";
    expect([...tabs.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1])).toEqual(["Athlete", "Calendar", "Championship", "Games"]);
  });

  it("opens the app on the Athlete tab", async () => {
    const res = await get("/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/athletes");
  });
});
