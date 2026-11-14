// Times are stored as venue-local wall-clock time plus the venue's IANA zone
// (spec #20, Data model). Readers see Belgian time first, with the venue time
// added only when the two clocks differ: "03:30 · 18:30 LA".

export const BELGIAN_ZONE = "Europe/Brussels";

export type DisplayTime = {
  /** Calendar date in Belgium, YYYY-MM-DD. */
  belgianDate: string;
  /** Wall-clock time in Belgium, HH:mm. */
  belgianTime: string;
  /** Wall-clock time at the venue, HH:mm, or null when it equals the Belgian time. */
  venueTime: string | null;
  text: string;
};

/**
 * @param venueLocal venue wall-clock time, "YYYY-MM-DDTHH:mm"
 * @param venueZone IANA zone of the venue, e.g. "America/Los_Angeles"
 * @param venueLabel short venue name shown after the venue time, e.g. "LA"
 */
export function toDisplayTime(venueLocal: string, venueZone: string, venueLabel: string): DisplayTime {
  const instant = zonedWallClockToInstant(venueLocal, venueZone);
  const belgian = wallClockIn(instant, BELGIAN_ZONE);
  const belgianTime = belgian.slice(11, 16);
  const venueClock = venueLocal.slice(11, 16);
  const venueTime = venueClock === belgianTime ? null : venueClock;
  return {
    belgianDate: belgian.slice(0, 10),
    belgianTime,
    venueTime,
    text: venueTime ? `${belgianTime} · ${venueTime} ${venueLabel}` : belgianTime,
  };
}

/** The instant at which the clock in `zone` reads `wallClock` ("YYYY-MM-DDTHH:mm"). */
function zonedWallClockToInstant(wallClock: string, zone: string): Date {
  const asIfUtc = Date.parse(`${wallClock}:00Z`);
  if (Number.isNaN(asIfUtc)) throw new RangeError(`Invalid venue-local time: ${wallClock}`);
  // Offset of the zone near that moment; a second pass settles DST edges.
  let guess = asIfUtc - offsetMs(asIfUtc, zone);
  guess = asIfUtc - offsetMs(guess, zone);
  return new Date(guess);
}

function offsetMs(epochMs: number, zone: string): number {
  return Date.parse(`${wallClockIn(new Date(epochMs), zone)}:00Z`) - epochMs;
}

/** "YYYY-MM-DDTHH:mm" as read on a clock in `zone`. */
function wallClockIn(instant: Date, zone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
