// Spec #20, stories 49, 50 and 60; ticket #35. The Games the app follows in
// the LA 2028 and French Alps 2030 Olympic cycles. Their dates (and each
// sport's first and last competition day) are curated by the owner in the Run
// sheet's Schedules step until the full session schedule is imported; this is
// only what the step needs to create them. A recorded Games is a `competition`
// of kind "games" from source "owner" whose source ref is the key below.

export type TrackedGames = {
  key: string;
  name: string;
  /** What the Calendar colours it by. */
  sport: string;
  city: string;
  /** IOC code of the host country. */
  country: string;
  /** IANA zone of the venue. */
  venueZone: string;
  /** The recurring competition (previous edition: Paris 2024 / Milano-Cortina 2026). */
  series: string;
};

export const GAMES_SOURCE = "owner";

export const TRACKED_GAMES: readonly TrackedGames[] = [
  {
    key: "la-2028",
    name: "LA 2028",
    sport: "Olympic Games",
    city: "Los Angeles",
    country: "USA",
    venueZone: "America/Los_Angeles",
    series: "olympic-games",
  },
  {
    key: "french-alps-2030",
    name: "French Alps 2030",
    sport: "Olympic Winter Games",
    city: "French Alps",
    country: "FRA",
    venueZone: "Europe/Paris",
    series: "olympic-winter-games",
  },
];

/** The chosen sport chips from `?sport=A,B`: known sports only, in the Games' order; empty means All sports. */
export function chosenSports(asked: string | null, sports: readonly string[]): string[] {
  const wanted = new Set((asked ?? "").split(",").map((s) => s.trim()));
  return sports.filter((s) => wanted.has(s));
}

/** The `?sport=` value after toggling one chip; null for All sports. */
export function toggledSports(chosen: readonly string[], sport: string, sports: readonly string[]): string | null {
  const next = chosen.includes(sport) ? chosen.filter((s) => s !== sport) : [...chosen, sport];
  const ordered = sports.filter((s) => next.includes(s));
  return ordered.length > 0 ? ordered.join(",") : null;
}

/**
 * Standards lines for the chosen sports: a line headed "<Sport>:" belongs to
 * that sport and shows only when it is chosen (or All sports); any other line
 * is Games-wide and always shows.
 */
export function standardsForSports(lines: readonly string[], sports: readonly string[], chosen: readonly string[]): string[] {
  if (chosen.length === 0) return [...lines];
  const sportOf = (line: string) => sports.find((s) => line.toLowerCase().startsWith(`${s.toLowerCase()}:`));
  return lines.filter((line) => {
    const sport = sportOf(line);
    return sport === undefined || chosen.includes(sport);
  });
}
