// Calendar-date arithmetic shared by source adapters. Dates are YYYY-MM-DD.

/** YYYY-MM-DD of an instant in a time zone (UTC by default). */
export function isoDate(instant: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
