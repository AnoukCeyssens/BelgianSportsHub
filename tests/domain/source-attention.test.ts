import { describe, expect, it } from "vitest";
import { sourceAttention, type SourceAttentionState } from "~/domain";

// Spec #20, stories 97 and 103: the Run sheet's Source health step shows an
// action card per problem source (blocked, failing, stale). Acknowledging a
// problem, or retrying, puts the card away until the problem changes: a new
// failure, a new block, or the source going stale again later.
const healthy: SourceAttentionState = {
  tier: "automatic",
  cadenceDays: 1,
  addedAt: "2026-11-01T00:00:00.000Z",
  lastSuccessAt: "2026-11-14T04:00:12.000Z",
  lastFailureAt: null,
  lastError: null,
  blockedAt: null,
  acknowledgedAt: null,
};
const now = "2026-11-14T12:00:00.000Z";

describe("sourceAttention", () => {
  it.each([
    { name: "a healthy source has no problem", source: healthy, expected: { problem: null, open: false } },
    {
      name: "a blocked source is a problem since it was blocked",
      source: { ...healthy, lastError: "HTTP 403", lastFailureAt: "2026-11-13T04:00:00.000Z", blockedAt: "2026-11-13T04:00:00.000Z" },
      expected: { problem: { kind: "blocked", since: "2026-11-13T04:00:00.000Z" }, open: true },
    },
    {
      name: "a source whose last run failed is failing",
      source: { ...healthy, lastSuccessAt: "2026-11-13T04:00:00.000Z", lastError: "HTTP 500", lastFailureAt: "2026-11-14T04:00:00.000Z" },
      expected: { problem: { kind: "failing", since: "2026-11-14T04:00:00.000Z" }, open: true },
    },
    {
      name: "a daily source with no success for over two days is stale from the moment it missed twice its cadence",
      source: { ...healthy, lastSuccessAt: "2026-11-11T04:00:00.000Z" },
      expected: { problem: { kind: "stale", since: "2026-11-13T04:00:00.000Z" }, open: true },
    },
    {
      name: "an acknowledged failure is no longer open",
      source: { ...healthy, lastError: "HTTP 500", lastFailureAt: "2026-11-14T04:00:00.000Z", acknowledgedAt: "2026-11-14T09:00:00.000Z" },
      expected: { problem: { kind: "failing", since: "2026-11-14T04:00:00.000Z" }, open: false },
    },
    {
      name: "a failure after the acknowledgement is open again",
      source: { ...healthy, lastError: "HTTP 500", lastFailureAt: "2026-11-14T04:00:00.000Z", acknowledgedAt: "2026-11-13T09:00:00.000Z" },
      expected: { problem: { kind: "failing", since: "2026-11-14T04:00:00.000Z" }, open: true },
    },
    {
      name: "a blocked source kept on Assisted stays blocked but is not open",
      source: { ...healthy, lastError: "HTTP 403", blockedAt: "2026-11-13T04:00:00.000Z", acknowledgedAt: "2026-11-13T10:00:00.000Z" },
      expected: { problem: { kind: "blocked", since: "2026-11-13T04:00:00.000Z" }, open: false },
    },
    {
      name: "an Assisted source is never a problem",
      source: { ...healthy, tier: "assisted", lastSuccessAt: null },
      expected: { problem: null, open: false },
    },
  ] satisfies { name: string; source: SourceAttentionState; expected: unknown }[])("$name", ({ source, expected }) => {
    expect(sourceAttention(source, new Date(now))).toEqual(expected);
  });
});
