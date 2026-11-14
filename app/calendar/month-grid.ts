// Layout of the Calendar's month grid (spec #20, story 35): weeks from Monday
// to Sunday covering the month; each competition is a bar across its days,
// in the first lane free for all of them, continuing into the next week.

export type GridDay = { date: string; inMonth: boolean; today: boolean };

export type GridBar<T> = {
  item: T;
  /** Columns 0 (Monday) to 6 (Sunday), inclusive. */
  fromCol: number;
  toCol: number;
  lane: number;
  /** The competition started in an earlier week / ends in a later one. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type GridWeek<T> = { monday: string; days: GridDay[]; bars: GridBar<T>[] };

const DAY_MS = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** "2026-11" → its weeks, Monday first; `today` is YYYY-MM-DD. */
export function monthGrid<T extends { startDate: string; endDate: string }>(month: string, items: readonly T[], today: string): GridWeek<T>[] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weeks: GridWeek<T>[] = [];
  for (let monday = addDays(first, -weekday); monday.slice(0, 7) <= month; monday = addDays(monday, 7)) {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const sunday = dates[6];
    const lanes: [number, number][][] = [];
    const bars = items
      .filter((x) => x.startDate <= sunday && x.endDate >= monday)
      .toSorted((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate))
      .map((item) => {
        const fromCol = item.startDate < monday ? 0 : dates.indexOf(item.startDate);
        const toCol = item.endDate > sunday ? 6 : dates.indexOf(item.endDate);
        let lane = 0;
        while ((lanes[lane] ?? []).some(([a, b]) => !(toCol < a || fromCol > b))) lane++;
        (lanes[lane] ??= []).push([fromCol, toCol]);
        return { item, fromCol, toCol, lane, continuesBefore: item.startDate < monday, continuesAfter: item.endDate > sunday };
      });
    weeks.push({ monday, days: dates.map((date) => ({ date, inMonth: date.slice(0, 7) === month, today: date === today })), bars });
  }
  return weeks;
}

/** "2026-11" shifted by `by` months. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** The last day of "2026-11", "2026-11-30". */
export function lastDayOf(month: string): string {
  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}
