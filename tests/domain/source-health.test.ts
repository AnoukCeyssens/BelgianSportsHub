import { describe, expect, it } from "vitest";
import { pasteImportDue, sourceHealth, type SourceState } from "~/domain";

// Spec #20, stories 89, 90, 94 and 97: cadence is data on the Source; the daily
// cron queues each Automatic source whose cadence is due; a source is stale
// once it has missed twice its cadence; a blocked source drops to Assisted.
const daily: SourceState = {
  tier: "automatic",
  cadenceDays: 1,
  addedAt: "2026-11-01T00:00:00.000Z",
  lastSuccessAt: "2026-11-13T04:00:12.000Z",
  blockedAt: null,
};
const weekly: SourceState = { ...daily, cadenceDays: 7, lastSuccessAt: "2026-11-09T04:03:00.000Z" };

describe("sourceHealth", () => {
  it.each([
    {
      name: "daily source, fetched at yesterday's cron, is due at today's cron",
      source: daily,
      now: "2026-11-14T04:00:00.000Z",
      expected: { tier: "automatic", due: true, stale: false, blocked: false },
    },
    {
      name: "daily source already fetched this morning is not due again the same day",
      source: { ...daily, lastSuccessAt: "2026-11-14T04:00:30.000Z" },
      now: "2026-11-14T16:00:00.000Z",
      expected: { tier: "automatic", due: false, stale: false, blocked: false },
    },
    {
      name: "a source that has never been fetched is due",
      source: { ...daily, lastSuccessAt: null },
      now: "2026-11-01T04:00:00.000Z",
      expected: { tier: "automatic", due: true, stale: false, blocked: false },
    },
    {
      name: "weekly source fetched last Monday is not due on Saturday",
      source: weekly,
      now: "2026-11-14T04:00:00.000Z",
      expected: { tier: "automatic", due: false, stale: false, blocked: false },
    },
    {
      name: "weekly source fetched last Monday a few minutes after the cron is due next Monday",
      source: weekly,
      now: "2026-11-16T04:00:00.000Z",
      expected: { tier: "automatic", due: true, stale: false, blocked: false },
    },
    {
      name: "daily source missing exactly two days is not stale yet",
      source: { ...daily, lastSuccessAt: "2026-11-12T04:00:00.000Z" },
      now: "2026-11-14T04:00:00.000Z",
      expected: { tier: "automatic", due: true, stale: false, blocked: false },
    },
    {
      name: "daily source missing more than twice its cadence is stale",
      source: { ...daily, lastSuccessAt: "2026-11-12T04:00:00.000Z" },
      now: "2026-11-14T04:00:01.000Z",
      expected: { tier: "automatic", due: true, stale: true, blocked: false },
    },
    {
      name: "weekly source is stale only after two missed weeks",
      source: weekly,
      now: "2026-11-23T04:03:01.000Z",
      expected: { tier: "automatic", due: true, stale: true, blocked: false },
    },
    {
      name: "a source never fetched counts from when it was added",
      source: { ...daily, lastSuccessAt: null },
      now: "2026-11-03T00:00:01.000Z",
      expected: { tier: "automatic", due: true, stale: true, blocked: false },
    },
    {
      name: "a blocked source drops to Assisted and is never queued",
      source: { ...daily, blockedAt: "2026-11-13T04:00:12.000Z" },
      now: "2026-11-14T04:00:00.000Z",
      expected: { tier: "assisted", due: false, stale: false, blocked: true },
    },
    {
      name: "an Assisted source is never queued nor stale",
      source: { ...daily, tier: "assisted", lastSuccessAt: null },
      now: "2026-12-14T04:00:00.000Z",
      expected: { tier: "assisted", due: false, stale: false, blocked: false },
    },
  ] satisfies { name: string; source: SourceState; now: string; expected: unknown }[])("$name", ({ source, now, expected }) => {
    expect(sourceHealth(source, new Date(now))).toEqual(expected);
  });
});

// Ticket #25: the Paste imports step lists the Assisted sources (configured
// Assisted, or blocked) whose cadence has come round since their last paste.
describe("pasteImportDue", () => {
  const assisted = { ...weekly, tier: "assisted" as const, lastSuccessAt: null, lastPastedAt: null };
  it.each([
    { name: "an Assisted source never pasted", source: assisted, now: "2026-11-14T10:00:00.000Z", due: true },
    {
      name: "weekly source pasted in last Saturday's session, later in the day",
      source: { ...assisted, lastPastedAt: "2026-11-07T15:00:00.000Z" },
      now: "2026-11-14T10:00:00.000Z",
      due: true,
    },
    {
      name: "weekly source pasted on Wednesday",
      source: { ...assisted, lastPastedAt: "2026-11-11T15:00:00.000Z" },
      now: "2026-11-14T10:00:00.000Z",
      due: false,
    },
    { name: "a healthy Automatic source", source: { ...daily, lastPastedAt: null }, now: "2026-11-14T10:00:00.000Z", due: false },
    {
      name: "a blocked Automatic source drops to Assisted",
      source: { ...daily, blockedAt: "2026-11-13T04:00:00.000Z", lastPastedAt: null },
      now: "2026-11-14T10:00:00.000Z",
      due: true,
    },
    { name: "a Manual source has no pastes", source: { ...assisted, tier: "manual" as const }, now: "2026-11-14T10:00:00.000Z", due: false },
  ])("$name", ({ source, now, due }) => {
    expect(pasteImportDue(source, new Date(now))).toBe(due);
  });
});
