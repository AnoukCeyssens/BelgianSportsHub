// The iCal subscription feed's text (spec #20, story 39; RFC 5545). Pure: the
// caller gathers the competitions and passes `now` for DTSTAMP. Competitions
// are all-day events on their local dates (no time zone, as the federations
// publish them); DTEND is the day after the last day, as RFC 5545 wants.

export type IcalEvent = {
  /** Stable from one fetch of the feed to the next, so calendar apps update rather than duplicate. */
  uid: string;
  /** YYYY-MM-DD, first and last day inclusive. */
  startDate: string;
  endDate: string;
  summary: string;
  location?: string | null;
  description?: string;
  url?: string;
};

export type IcalCalendar = { name: string; timeZone: string; refreshHours: number; events: readonly IcalEvent[] };

export function icalFeed(calendar: IcalCalendar, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BelgianSportsHub//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icalText(calendar.name)}`,
    `X-WR-TIMEZONE:${calendar.timeZone}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${calendar.refreshHours}H`,
    `X-PUBLISHED-TTL:PT${calendar.refreshHours}H`,
  ];
  for (const e of calendar.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icalText(e.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.startDate.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${dayAfter(e.endDate).replace(/-/g, "")}`,
      `SUMMARY:${icalText(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${icalText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icalText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icalFold).join("\r\n") + "\r\n";
}

/** A TEXT value: backslash, semicolon, comma and newlines escaped. */
export function icalText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Lines longer than 75 octets continue on the next line after a space, never splitting a character. */
export function icalFold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function dayAfter(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
