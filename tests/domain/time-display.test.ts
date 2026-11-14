import { describe, expect, it } from "vitest";
import { toDisplayTime } from "~/domain";

// Spec #20, story 59: Belgian time first, venue time in smaller text only when
// the two clocks differ ("03:30 · 18:30 LA").
describe("toDisplayTime", () => {
  it.each([
    {
      name: "LA28 evening session lands in the Belgian night (worked case from the grilling)",
      venueLocal: "2028-07-20T18:30",
      venueZone: "America/Los_Angeles",
      venueLabel: "LA",
      expected: { belgianDate: "2028-07-21", belgianTime: "03:30", venueTime: "18:30", text: "03:30 · 18:30 LA" },
    },
    {
      name: "Paris 2024 shares the Belgian clock, so only one time is shown",
      venueLocal: "2024-07-27T19:30",
      venueZone: "Europe/Paris",
      venueLabel: "Paris",
      expected: { belgianDate: "2024-07-27", belgianTime: "19:30", venueTime: null, text: "19:30" },
    },
    {
      name: "Tokyo in winter (no daylight saving there, CET here)",
      venueLocal: "2026-02-10T20:00",
      venueZone: "Asia/Tokyo",
      venueLabel: "Tokyo",
      expected: { belgianDate: "2026-02-10", belgianTime: "12:00", venueTime: "20:00", text: "12:00 · 20:00 Tokyo" },
    },
    {
      name: "a different zone with the same clock time in winter shows Belgian time only",
      venueLocal: "2027-01-15T15:00",
      venueZone: "Africa/Lagos",
      venueLabel: "Lagos",
      expected: { belgianDate: "2027-01-15", belgianTime: "15:00", venueTime: null, text: "15:00" },
    },
    {
      name: "London in summer is one hour behind Belgium",
      venueLocal: "2027-08-01T09:00",
      venueZone: "Europe/London",
      venueLabel: "London",
      expected: { belgianDate: "2027-08-01", belgianTime: "10:00", venueTime: "09:00", text: "10:00 · 09:00 London" },
    },
    {
      name: "Brisbane morning is still the previous evening in Belgium",
      venueLocal: "2032-07-25T07:00",
      venueZone: "Australia/Brisbane",
      venueLabel: "Brisbane",
      expected: { belgianDate: "2032-07-24", belgianTime: "23:00", venueTime: "07:00", text: "23:00 · 07:00 Brisbane" },
    },
  ])("$name", ({ venueLocal, venueZone, venueLabel, expected }) => {
    expect(toDisplayTime(venueLocal, venueZone, venueLabel)).toEqual(expected);
  });
});
