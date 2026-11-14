import { describe, expect, it } from "vitest";
import { runSheetProgress, WEEKLY_RUN_SHEET } from "~/domain";

// Spec #20, stories 99–102: eight steps in a fixed order; a step shows ✓ when
// it is empty or passed; the progress bar counts those; the estimated time
// left sums the per-item estimates of every open item.
describe("the weekly Run sheet", () => {
  it("has eight steps in the agreed order", () => {
    expect(WEEKLY_RUN_SHEET.map((s) => s.label)).toEqual([
      "Source health",
      "Paste imports",
      "Manual results",
      "Merge queue",
      "Qualification review",
      "Selections & likely",
      "Schedules",
      "Monthly checklist",
    ]);
  });
});

describe("runSheetProgress", () => {
  const steps = [
    { key: "a", minutesPerItem: 2 },
    { key: "b", minutesPerItem: 3 },
    { key: "c", minutesPerItem: 10 },
  ];
  it.each([
    {
      name: "nothing open: every step is done, no time left",
      open: { a: 0, b: 0, c: 0 },
      passed: [],
      expected: { done: [true, true, true], doneCount: 3, minutesLeft: 0 },
    },
    {
      name: "open items: their steps are not done; time sums per item",
      open: { a: 2, b: 3, c: 0 },
      passed: [],
      expected: { done: [false, false, true], doneCount: 1, minutesLeft: 13 },
    },
    {
      name: "a step passed with items left is done, but its items still count toward time left",
      open: { a: 2, b: 3, c: 0 },
      passed: ["a"],
      expected: { done: [true, false, true], doneCount: 2, minutesLeft: 13 },
    },
  ])("$name", ({ open, passed, expected }) => {
    const progress = runSheetProgress(
      steps.map((s) => ({ ...s, open: open[s.key as keyof typeof open] })),
      new Set(passed),
    );
    expect({ done: progress.steps.map((s) => s.done), doneCount: progress.doneCount, minutesLeft: progress.minutesLeft }).toEqual(expected);
  });
});
