import { describe, expect, it, vi } from "vitest";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { get, post } from "../support/worker";
import { teamBelgiumSeedRun } from "../fixtures/sources/team-belgium";

const listedNames = async () => {
  const html = await (await get("/athletes")).text();
  return [...html.matchAll(/<a [^>]*href="\/athletes\/[^"]+"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
};

describe("owner starts the roster seed", () => {
  it("offers a button that queues the seed, which then fills the roster in the background", async () => {
    stubOutboundFetch(teamBelgiumSeedRun);
    expect(await (await get("/curation/roster-seed")).text()).toContain("Refresh roster from Team Belgium");

    const res = await post("/curation/roster-seed");

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/curation/roster-seed?queued=1");
    // Through the real local queue, so wait for the consumer to finish.
    await vi.waitFor(async () => expect(await listedNames()).toHaveLength(3), { timeout: 15_000, interval: 200 });
  });
});
