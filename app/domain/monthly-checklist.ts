// Spec #20, story 111; ticket #45: the Monthly checklist keeps slow-moving
// sources from being forgotten (2030 IF qualification systems, the BOIC
// selection regulation, federation selection criteria, entry deadlines, the
// calendar refresh). The weekly Run sheet shows only the checks due this week:
// overdue, due today or within the next six days, by the Belgian date. Ticking
// a check schedules it again a number of months after the tick.
import { BELGIAN_ZONE } from "./time-display";

export type ChecklistCheck = { id: string; topic: string; dueOn: string };

export type ChecklistDue<C extends ChecklistCheck> = {
  /** Topics with a due check, earliest due first; checks by due date. */
  due: { topic: string; checks: C[] }[];
  /** Checks not due this week. */
  notDue: number;
};

/** "YYYY-MM-DD" as read on a calendar in Belgium. */
export function belgianDate(instant: Date): string {
  return instant.toLocaleDateString("en-CA", { timeZone: BELGIAN_ZONE });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function checklistDue<C extends ChecklistCheck>(checks: readonly C[], now: Date): ChecklistDue<C> {
  const lastDay = addDays(belgianDate(now), 6);
  const due = checks.filter((c) => c.dueOn <= lastDay).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const topics = new Map<string, C[]>();
  for (const c of due) topics.set(c.topic, [...(topics.get(c.topic) ?? []), c]);
  return {
    due: [...topics].map(([topic, grouped]) => ({ topic, checks: grouped })),
    notDue: checks.length - due.length,
  };
}

/** The next due date of a check ticked at `checkedAt`; a missing day (31 Feb) falls back to the month's last day. */
export function nextDueOn(checkedAt: Date, everyMonths: number): string {
  const [year, month, day] = belgianDate(checkedAt).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + everyMonths, 1));
  const lastOfMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastOfMonth));
  return target.toISOString().slice(0, 10);
}
