// Display formats shared by pages (English UI, dates written out).

/** "19 Aug 1994" from "1994-08-19". */
export function formatDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "13 Nov" from "2026-11-13". */
export function formatDay(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "14 Nov 2026, 12:00 UTC" from an ISO instant; "never" for null. */
export function formatInstant(iso: string | null) {
  if (!iso) return "never";
  return `${formatDate(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
}

/** "13:00": the Belgian wall-clock time of an ISO instant. */
export function formatBelgianClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

/** "7 min", "1 h 05". */
export function formatMinutes(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
}

/** "17th"; a result without a place shows its status (DNF, DSQ). */
export function placeText(place: number | null, status: string) {
  if (place === null) return status;
  const suffix =
    place % 100 >= 11 && place % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[place % 10] ?? "th";
  return `${place}${suffix}`;
}

/** "22 Nov", "20–22 Nov", "28 Nov–6 Dec" for a competition's days. */
export function formatDayRange(start: string, end: string) {
  if (start === end) return formatDay(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8))}–${formatDay(end)}`;
  return `${formatDay(start)}–${formatDay(end)}`;
}
