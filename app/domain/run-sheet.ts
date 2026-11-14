// Spec #20, stories 99–102: the weekly curation session is a guided run of
// eight steps in a fixed order. Each step has a one-line purpose, a time
// estimate and a per-item estimate; the estimated time left sums the per-item
// estimates of every open item. A step is done (✓) when it is empty or the
// owner passed it in this session. Step order and estimates were not
// explicitly confirmed by the owner (spec #20, Modules), so they live here as
// data to revise.

export type RunSheetStep = {
  key: string;
  label: string;
  /** Shown in the rail, e.g. "~5 min". */
  estimate: string;
  minutesPerItem: number;
  purpose: string;
};

export const WEEKLY_RUN_SHEET: readonly RunSheetStep[] = [
  {
    key: "source-health",
    label: "Source health",
    estimate: "~5 min",
    minutesPerItem: 2,
    purpose: "Automatic sources first, so you know which data to distrust today.",
  },
  {
    key: "paste-imports",
    label: "Paste imports",
    estimate: "0.5–1.25 h",
    minutesPerItem: 12,
    purpose: "Assisted sources with a Belgian Participation this week: paste, then confirm the BEL rows.",
  },
  {
    key: "manual-results",
    label: "Manual results",
    estimate: "15–30 min",
    minutesPerItem: 6,
    purpose: "PDF-only and login-only sports: type the Belgian rows.",
  },
  {
    key: "merge-queue",
    label: "Merge queue",
    estimate: "~10 min",
    minutesPerItem: 3,
    purpose: "Identities the IF ID and name + date of birth rules could not settle, including what this session's imports sent here.",
  },
  {
    key: "qualification-review",
    label: "Qualification review",
    estimate: "0.5–1 h",
    minutesPerItem: 5,
    purpose: "Only Entries whose ranking or track changed since their last check.",
  },
  {
    key: "selections-likely",
    label: "Selections & likely",
    estimate: "~15 min",
    minutesPerItem: 4,
    purpose: "Selections from federation press releases, then the likely Participations of the coming weeks.",
  },
  { key: "schedules", label: "Schedules", estimate: "~10 min", minutesPerItem: 10, purpose: "New timetable versions and Games dates." },
  { key: "monthly-checklist", label: "Monthly checklist", estimate: "~15 min", minutesPerItem: 5, purpose: "Only the checks due this week." },
];

export type RunSheetProgress<S> = {
  steps: (S & { done: boolean })[];
  doneCount: number;
  minutesLeft: number;
};

export function runSheetProgress<S extends { key: string; minutesPerItem: number; open: number }>(
  steps: readonly S[],
  passed: ReadonlySet<string>,
): RunSheetProgress<S> {
  const withDone = steps.map((s) => ({ ...s, done: s.open === 0 || passed.has(s.key) }));
  return {
    steps: withDone,
    doneCount: withDone.filter((s) => s.done).length,
    minutesLeft: steps.reduce((sum, s) => sum + s.open * s.minutesPerItem, 0),
  };
}
