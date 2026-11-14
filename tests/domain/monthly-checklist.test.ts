import { describe, expect, it } from "vitest";
import { checklistDue, nextDueOn } from "~/domain";

// Spec #20, story 111; ticket #45: the Monthly checklist shows only the checks
// due this week (overdue ones included), grouped by topic, with a count of
// those not due yet. Ticking a check schedules its next due date.
describe("checklistDue", () => {
  const check = (id: string, topic: string, dueOn: string) => ({ id, topic, dueOn });

  it.each([
    {
      name: "a Saturday morning: due today, overdue and due within six days count; the seventh day does not",
      now: "2026-11-14T08:00:00.000Z",
      checks: [
        check("overdue", "Calendar refresh", "2026-11-10"),
        check("today", "BOIC", "2026-11-14"),
        check("friday", "BOIC", "2026-11-20"),
        check("next-saturday", "IF systems", "2026-11-21"),
        check("december", "IF systems", "2026-12-14"),
      ],
      expected: {
        due: [
          { topic: "Calendar refresh", ids: ["overdue"] },
          { topic: "BOIC", ids: ["today", "friday"] },
        ],
        notDue: 2,
      },
    },
    {
      name: "the day is the Belgian date: 23:30 UTC on 13 Nov is already 14 Nov in Brussels",
      now: "2026-11-13T23:30:00.000Z",
      checks: [check("a", "IF systems", "2026-11-20"), check("b", "IF systems", "2026-11-21")],
      expected: { due: [{ topic: "IF systems", ids: ["a"] }], notDue: 1 },
    },
    {
      name: "a topic is listed by its earliest due check",
      now: "2026-11-14T08:00:00.000Z",
      checks: [check("x", "Later topic", "2026-11-18"), check("y", "Earlier topic", "2026-11-12"), check("z", "Later topic", "2026-11-11")],
      expected: {
        due: [
          { topic: "Later topic", ids: ["z", "x"] },
          { topic: "Earlier topic", ids: ["y"] },
        ],
        notDue: 0,
      },
    },
    {
      name: "nothing due",
      now: "2026-11-14T08:00:00.000Z",
      checks: [check("a", "IF systems", "2026-12-01")],
      expected: { due: [], notDue: 1 },
    },
  ])("$name", ({ now, checks, expected }) => {
    const result = checklistDue(checks, new Date(now));
    expect({ due: result.due.map((g) => ({ topic: g.topic, ids: g.checks.map((c) => c.id) })), notDue: result.notDue }).toEqual(expected);
  });
});

describe("nextDueOn", () => {
  it.each([
    { name: "a month after the tick", checkedAt: "2026-11-14T10:00:00.000Z", everyMonths: 1, expected: "2026-12-14" },
    { name: "into the next year", checkedAt: "2026-12-20T10:00:00.000Z", everyMonths: 1, expected: "2027-01-20" },
    { name: "the 31st falls back to the month's last day", checkedAt: "2027-01-31T10:00:00.000Z", everyMonths: 1, expected: "2027-02-28" },
    { name: "every three months", checkedAt: "2026-11-14T10:00:00.000Z", everyMonths: 3, expected: "2027-02-14" },
    { name: "counted from the Belgian date of the tick", checkedAt: "2026-11-30T23:30:00.000Z", everyMonths: 1, expected: "2027-01-01" },
  ])("$name", ({ checkedAt, everyMonths, expected }) => {
    expect(nextDueOn(new Date(checkedAt), everyMonths)).toBe(expected);
  });
});
