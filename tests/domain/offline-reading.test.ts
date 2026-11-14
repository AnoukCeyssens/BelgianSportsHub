import { describe, expect, it } from "vitest";
import { offlineReading } from "~/domain";

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
