import { describe, expect, it } from "vitest";
import { matchesNameSearch } from "~/domain";

// Spec #20, story 24 and Reader screens: search over all Athletes by name.
// Every word typed must start a word of the name, ignoring case and accents.
describe("matchesNameSearch", () => {
  it.each([
    { name: "a surname", athlete: "Nafissatou Thiam", query: "thiam", expected: true },
    { name: "the start of a word", athlete: "Hanne Desmet", query: "desm", expected: true },
    { name: "several word starts in any order", athlete: "Nafissatou Thiam", query: "thi naf", expected: true },
    { name: "accents typed or not", athlete: "Mathilde Vandenbossche-Éloy", query: "eloy", expected: true },
    { name: "accent typed for an unaccented name", athlete: "Hanne Desmet", query: "hanné", expected: true },
    { name: "a particle in a double surname", athlete: "Charline Van Snick", query: "van sn", expected: true },
    { name: "the middle of a word does not match", athlete: "Hanne Desmet", query: "smet", expected: false },
    { name: "one word not in the name", athlete: "Nafissatou Thiam", query: "nafy thiam", expected: false },
    { name: "an empty search matches everyone", athlete: "Hanne Desmet", query: "  ", expected: true },
  ])("$name", ({ athlete, query, expected }) => {
    expect(matchesNameSearch(athlete, query)).toBe(expected);
  });
});
