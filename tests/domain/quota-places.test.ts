import { describe, expect, it } from "vitest";
import {
  placesEarned,
  quotaPlaceAdjustment,
  quotaPlaceLinkable,
  quotaPlaceTransition,
  type QualificationStatus,
  type QuotaPlaceEvent,
  type QuotaPlaceKind,
  type QuotaPlaceState,
} from "~/domain";

// GLOSSARY "Quota place"; ADR 0002; spec #20, stories 78, 79 and 81; ticket #36.
// A Quota place moves Provisional → Allocated → Accepted → Entered, or ends
// Declined / Lost; a place gained through reallocation starts at Allocated.

type Place = { state: QuotaPlaceState; kind: "noc" | "named"; linked: boolean } | null;

const noc = (state: QuotaPlaceState, linked = false): Place => ({ state, kind: "noc", linked });
const named = (state: QuotaPlaceState): Place => ({ state, kind: "named", linked: true });

describe("quotaPlaceTransition: only legal lifecycle moves", () => {
  it.each([
    { name: "held on today's list or ranking: a new place starts Provisional", place: null, event: "hold", expected: "provisional" },
    { name: "won outright at a quota tournament (FIH Pro League): a new place starts Allocated", place: null, event: "allocate", expected: "allocated" },
    { name: "gained through reallocation: a new place starts Allocated", place: null, event: "reallocate", expected: "allocated" },
    { name: "the federation confirms a provisional place", place: noc("provisional"), event: "allocate", expected: "allocated" },
    { name: "Belgium confirms it will use the place", place: noc("allocated"), event: "accept", expected: "accepted" },
    { name: "a selected Entry fills an NOC-owned place at the entries deadline", place: noc("accepted", true), event: "enter", expected: "entered" },
    { name: "a named place is entered by the Entry that earned it", place: named("accepted"), event: "enter", expected: "entered" },
    { name: "Belgium declines an allocated place", place: noc("allocated"), event: "decline", expected: "declined" },
    { name: "Belgium gives back an accepted place", place: noc("accepted"), event: "decline", expected: "declined" },
    { name: "a provisional place drops off the list", place: noc("provisional"), event: "lose", expected: "lost" },
    { name: "an allocated place is lost (e.g. a doping case)", place: noc("allocated"), event: "lose", expected: "lost" },
    { name: "an accepted place goes unfilled at the entries deadline", place: noc("accepted"), event: "lose", expected: "lost" },
  ] as { name: string; place: Place; event: QuotaPlaceEvent; expected: QuotaPlaceState }[])("$name", ({ place, event, expected }) => {
    expect(quotaPlaceTransition(place, event)).toEqual({ ok: true, state: expected });
  });

  it.each([
    { name: "a reallocated place never starts Provisional: reallocating an existing place", place: noc("provisional"), event: "reallocate" },
    { name: "a place cannot be held again once it exists", place: noc("allocated"), event: "hold" },
    { name: "no skipping the federation: Provisional straight to Accepted", place: noc("provisional"), event: "accept" },
    { name: "no skipping Belgium's confirmation: Allocated straight to Entered", place: noc("allocated", true), event: "enter" },
    { name: "an NOC-owned place is entered only once linked to its selected Entry", place: noc("accepted"), event: "enter" },
    { name: "Belgium cannot decline a place it does not hold yet", place: noc("provisional"), event: "decline" },
    { name: "no moving backwards: Accepted back to Allocated", place: noc("accepted"), event: "allocate" },
    { name: "Entered is final", place: noc("entered", true), event: "lose" },
    { name: "Declined is final", place: noc("declined"), event: "accept" },
    { name: "Lost is final", place: noc("lost"), event: "allocate" },
    { name: "a place must exist before it moves", place: null, event: "accept" },
  ] as { name: string; place: Place; event: QuotaPlaceEvent }[])("rejects: $name", ({ place, event }) => {
    expect(quotaPlaceTransition(place, event)).toMatchObject({ ok: false });
  });
});

describe("quotaPlaceLinkable: when a place meets its Entry (story 81)", () => {
  it.each([
    { name: "a named place links to the Entry that earned it, whatever its status", kind: "named", status: "qualified", expected: true },
    { name: "a named place links even before a status is recorded", kind: "named", status: null, expected: true },
    { name: "an NOC-owned place links at Selection", kind: "noc", status: "selected", expected: true },
    { name: "an NOC-owned place does not link to a Qualified Entry before Selection", kind: "noc", status: "qualified", expected: false },
    { name: "three Belgians chasing two NOC-owned places: an Eligible Entry is not linked", kind: "noc", status: "eligible", expected: false },
    { name: "an NOC-owned place does not link to a Not selected Entry", kind: "noc", status: "not-selected", expected: false },
  ] as { name: string; kind: QuotaPlaceKind; status: QualificationStatus | null; expected: boolean }[])("$name", ({ kind, status, expected }) => {
    expect(quotaPlaceLinkable(kind, status)).toBe(expected);
  });
});

// Spec #20, story 80; #20 review (D): a nation ranking that earns n places
// holds n Provisional places in its event, whatever was recorded before.
describe("placesEarned: how many places a nation ranking position earns, by what the track needs", () => {
  it.each([
    { name: "inside the Top N: one place for the event", needed: "Top 8 nations", position: 6, expected: 1 },
    { name: "outside the Top N: none", needed: "Top 8 nations", position: 9, expected: 0 },
    { name: "on the line", needed: "top-8", position: 8, expected: 1 },
    { name: "several places per nation inside the Top N", needed: "Top 12 nations: 3 places", position: 4, expected: 3 },
    { name: "bands: the best band the position is inside", needed: "Top 4: 3 places · top 10: 2 places · top 16: 1 place", position: 7, expected: 2 },
    { name: "bands: inside the last band only", needed: "Top 4: 3 places · top 10: 2 places · top 16: 1 place", position: 16, expected: 1 },
    { name: "bands: outside them all", needed: "Top 4: 3 places · top 10: 2 places · top 16: 1 place", position: 17, expected: 0 },
    { name: "names no places: nothing to say", needed: "Named by BOIC", position: 3, expected: null },
  ])("$name", ({ needed, position, expected }) => {
    expect(placesEarned(needed, position)).toBe(expected);
  });
});

describe("quotaPlaceAdjustment: keeping an event's places at what the ranking earns", () => {
  const RANKING = "ISU World Cup Team Pursuit Men";
  const p = (id: string, state: QuotaPlaceState, extra: { linked?: boolean; reallocated?: boolean; earnedVia?: string | null } = {}) => ({
    id,
    state,
    linked: extra.linked ?? false,
    reallocated: extra.reallocated ?? false,
    earnedVia: extra.earnedVia === undefined ? RANKING : extra.earnedVia,
  });
  it.each([
    { name: "none recorded, one earned: hold one", places: [], earned: 1, expected: { hold: 1, remove: [] } },
    { name: "already holding what it earns: nothing", places: [p("a", "provisional")], earned: 1, expected: { hold: 0, remove: [] } },
    { name: "a re-fetch of the same list adds nothing", places: [p("a", "provisional"), p("b", "provisional")], earned: 2, expected: { hold: 0, remove: [] } },
    { name: "earns one more", places: [p("a", "allocated")], earned: 2, expected: { hold: 1, remove: [] } },
    { name: "drops out: its Provisional places go, last first", places: [p("a", "provisional"), p("b", "provisional")], earned: 0, expected: { hold: 0, remove: ["b", "a"] } },
    { name: "an Allocated place is never removed", places: [p("a", "allocated"), p("b", "provisional")], earned: 0, expected: { hold: 0, remove: ["b"] } },
    { name: "a linked Provisional place stays", places: [p("a", "provisional", { linked: true })], earned: 0, expected: { hold: 0, remove: [] } },
    { name: "a reallocated place stays", places: [p("a", "provisional", { reallocated: true })], earned: 0, expected: { hold: 0, remove: [] } },
    { name: "a place earned some other way stays", places: [p("a", "provisional", { earnedVia: "Continental qualifier" })], earned: 0, expected: { hold: 0, remove: [] } },
    { name: "declined and lost places do not count", places: [p("a", "lost"), p("b", "declined")], earned: 1, expected: { hold: 1, remove: [] } },
  ])("$name", ({ places, earned, expected }) => {
    expect(quotaPlaceAdjustment(places, earned, RANKING)).toEqual(expected);
  });
});
