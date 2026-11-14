// The one sport vocabulary (GLOSSARY "Athlete": a sport on the Olympic
// programme; "Olympic cycle"). Every stored sport — source rows, adapters,
// Teams, Entries, Games sport windows, rankings — is one of these names, and
// every comparison of sport strings goes through `sameSport`. The unit is the
// discipline as the IOC programme lists it (LA 2028 and French Alps 2030,
// plus Paris 2024 and Milano-Cortina 2026 for the reference Games), because
// that is what qualification, Games sport windows and Phases follow:
// "Swimming" and "Diving", not "Aquatics"; "Cycling road", not "Cycling".

import type { OlympicCycle } from "./qualification";

export type SportDefinition = { name: string; cycle: OlympicCycle };

export const SPORTS: readonly SportDefinition[] = [
  // Summer (LA 2028; Breaking from Paris 2024)
  ...[
    "3x3 basketball",
    "Archery",
    "Artistic gymnastics",
    "Artistic swimming",
    "Athletics",
    "Badminton",
    "Baseball/softball",
    "Basketball",
    "Beach volleyball",
    "Boxing",
    "Breaking",
    "Canoe slalom",
    "Canoe sprint",
    "Coastal rowing",
    "Cricket",
    "Cycling BMX freestyle",
    "Cycling BMX racing",
    "Cycling mountain bike",
    "Cycling road",
    "Cycling track",
    "Diving",
    "Equestrian dressage",
    "Equestrian eventing",
    "Equestrian jumping",
    "Fencing",
    "Flag football",
    "Football",
    "Golf",
    "Handball",
    "Hockey",
    "Judo",
    "Lacrosse",
    "Marathon swimming",
    "Modern pentathlon",
    "Rhythmic gymnastics",
    "Rowing",
    "Rugby sevens",
    "Sailing",
    "Shooting",
    "Skateboarding",
    "Sport climbing",
    "Squash",
    "Surfing",
    "Swimming",
    "Table tennis",
    "Taekwondo",
    "Tennis",
    "Trampoline",
    "Triathlon",
    "Volleyball",
    "Water polo",
    "Weightlifting",
    "Wrestling",
  ].map((name) => ({ name, cycle: "summer" as const })),
  // Winter (French Alps 2030; Nordic combined from Milano-Cortina 2026)
  ...[
    "Alpine skiing",
    "Biathlon",
    "Bobsleigh",
    "Cross-country skiing",
    "Curling",
    "Figure skating",
    "Freeride",
    "Freestyle skiing",
    "Ice hockey",
    "Luge",
    "Nordic combined",
    "Short track speed skating",
    "Skeleton",
    "Ski jumping",
    "Ski mountaineering",
    "Snowboard",
    "Speed skating",
  ].map((name) => ({ name, cycle: "winter" as const })),
];

/** Other names sources and people use, keyed by `key()`. Broad names ("Aquatics", "Cycling") are not aliases: they span several sports. */
const ALIASES: Record<string, string> = {
  "track and field": "Athletics",
  "track field": "Athletics",
  "short track": "Short track speed skating",
  "speed skating short track": "Short track speed skating",
  "road cycling": "Cycling road",
  "cycling road racing": "Cycling road",
  "track cycling": "Cycling track",
  "mountain bike": "Cycling mountain bike",
  "mountain biking": "Cycling mountain bike",
  "cycling mountain biking": "Cycling mountain bike",
  mtb: "Cycling mountain bike",
  "bmx racing": "Cycling BMX racing",
  "bmx freestyle": "Cycling BMX freestyle",
  "open water swimming": "Marathon swimming",
  "open water": "Marathon swimming",
  "synchronised swimming": "Artistic swimming",
  "synchronized swimming": "Artistic swimming",
  "gymnastics artistic": "Artistic gymnastics",
  "gymnastics rhythmic": "Rhythmic gymnastics",
  "trampoline gymnastics": "Trampoline",
  "gymnastics trampoline": "Trampoline",
  baseball: "Baseball/softball",
  softball: "Baseball/softball",
  "baseball and softball": "Baseball/softball",
  "basketball 3x3": "3x3 basketball",
  "3x3": "3x3 basketball",
  "beach volley": "Beach volleyball",
  "show jumping": "Equestrian jumping",
  jumping: "Equestrian jumping",
  dressage: "Equestrian dressage",
  eventing: "Equestrian eventing",
  "equestrian show jumping": "Equestrian jumping",
  "canoe kayak slalom": "Canoe slalom",
  "canoe kayak sprint": "Canoe sprint",
  "rowing beach sprint": "Coastal rowing",
  "rowing coastal beach sprints": "Coastal rowing",
  "beach sprint rowing": "Coastal rowing",
  bobsled: "Bobsleigh",
  snowboarding: "Snowboard",
  skateboard: "Skateboarding",
  climbing: "Sport climbing",
  "field hockey": "Hockey",
  rugby: "Rugby sevens",
  "lacrosse sixes": "Lacrosse",
  skimo: "Ski mountaineering",
  "freestyle skiing freeski": "Freestyle skiing",
  "freeride skiing": "Freeride",
  "freeride snowboard": "Freeride",
};

/** Lower case, no bracketed note at the end, any run of non-letters/digits a single space. */
function key(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_KEY = new Map<string, SportDefinition>([
  ...SPORTS.map((s) => [key(s.name), s] as const),
  ...Object.entries(ALIASES).map(([alias, name]) => [alias, SPORTS.find((s) => s.name === name)!] as const),
]);

/** The canonical name of a sport as any source or person writes it; null when it is no sport on the programme. */
export function canonicalSport(raw: string): string | null {
  return BY_KEY.get(key(raw))?.name ?? null;
}

/** Whether two names name the same sport; names that are no sport (the Games' "Olympic Games") compare ignoring case. */
export function sameSport(a: string, b: string): boolean {
  const ca = canonicalSport(a);
  const cb = canonicalSport(b);
  if (ca !== null || cb !== null) return ca === cb;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** GLOSSARY "Olympic cycle": the summer cycle (LA 2028) or the winter cycle (French Alps 2030); null for a name that is no sport. */
export function olympicCycleOf(sport: string): OlympicCycle | null {
  return BY_KEY.get(key(sport))?.cycle ?? null;
}

/** Throws for a name that is no sport: writers store canonical names only. */
export function requireSport(raw: string): string {
  const sport = canonicalSport(raw);
  if (sport === null) throw new Error(`Unknown sport "${raw}": use a sport of the Olympic programme (app/domain/sports.ts)`);
  return sport;
}
