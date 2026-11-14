import { describe, expect, it } from "vitest";
import { isCurationPath, offlineReading } from "~/domain";

// Spec #20, story 117: recently viewed reader pages read offline; curation
// works online only. React Router fetches a page's data from "<path>.data"
// ("/_.data" for "/"), which follows the same rule as the page itself.
describe("offlineReading", () => {
  it.each([
    { name: "an Athlete page is kept for offline reading", path: "/athletes/0b6c", expected: "reader" },
    { name: "an Athlete page's data request too", path: "/athletes/0b6c.data", expected: "reader" },
    { name: "the Athlete tab", path: "/athletes", expected: "reader" },
    { name: "the Calendar tab", path: "/calendar", expected: "reader" },
    { name: "the Games tab's data", path: "/games.data", expected: "reader" },
    { name: "the app's start page data", path: "/_.data", expected: "reader" },
    { name: "the curation area is online only", path: "/curate", expected: "curation" },
    { name: "a curation step is online only", path: "/curate/merge-queue", expected: "curation" },
    { name: "a curation step's data request too", path: "/curate/merge-queue.data", expected: "curation" },
    { name: "the curation area's index data", path: "/curate/_.data", expected: "curation" },
    { name: "a reader page that merely starts with the same letters", path: "/curated-picks", expected: "reader" },
  ])("$name", ({ path, expected }) => {
    expect(offlineReading(path)).toBe(expected);
  });
});

// Spec #20, story 98 and ticket #24: curation routes are owner-only, however
// the path is spelled (route matching ignores case and decodes the path).
describe("isCurationPath", () => {
  it.each([
    { name: "the Run sheet", path: "/curate/run/source-health", expected: true },
    { name: "the curation area's own data request", path: "/curate.data", expected: true },
    { name: "upper case", path: "/CURATE/run/merge-queue", expected: true },
    { name: "percent-encoded letters", path: "/%63urate/roster-seed", expected: true },
    { name: "doubled slashes", path: "//curate//roster-seed", expected: true },
    { name: "a reader page", path: "/athletes/0b6c", expected: false },
    { name: "a reader page that merely starts with the same letters", path: "/curated-picks", expected: false },
  ])("$name", ({ path, expected }) => {
    expect(isCurationPath(path)).toBe(expected);
  });
});
