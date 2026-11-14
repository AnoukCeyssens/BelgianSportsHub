// Teams (GLOSSARY "Team", "Roster"; ADR 0001): which Team a multi-athlete
// result or ranking belongs to, and how Team medals count.

export type TeamKind = "default" | "partnership";

/** A roster member as a source names them: `id` is their IF ID ("scheme:value"). */
export type TeamMember = { id: string; name: string };

export type TeamIdentity = {
  kind: TeamKind;
  /** Stable identity: Belgium's default Team is sport + event; a partnership adds its members. */
  key: string;
  name: string;
};

/** Sports where every multi-athlete entry is a standing partnership (Belgium can field several pairs). */
const PARTNERSHIP_SPORTS = new Set(["beach volleyball", "rowing"]);

/** Events where Belgium can field several crews at once: doubles, pairs, duets, synchro, small boats and sleds. */
const PARTNERSHIP_EVENT =
  /\bdoubles?\b|\bpairs?\b|\bduets?\b|\bsynchroni[sz]ed\b|\bsynchro\b|\bice dance\b|\b[KC]-?[24]\b|\b(?:two|2)[- ]?(?:man|woman|person)\b|\b(?:sculls?|coxless|coxed|four|eight)\b|\b(?:470|49er(?:FX)?|nacra)\b/i;

/**
 * The Team a Belgian multi-athlete result or ranking belongs to. By default
 * one Team per Belgium + event, whatever its roster; where Belgium can field
 * several at once (beach volleyball, doubles, boats), each partnership is its
 * own Team. Without members (a nation ranking) it is always the default Team.
 */
export function teamIdentity(input: { sport: string; event: string; members: TeamMember[] | null }): TeamIdentity {
  const { sport, event, members } = input;
  const partnership =
    members !== null && members.length > 0 && (PARTNERSHIP_SPORTS.has(sport.toLowerCase()) || PARTNERSHIP_EVENT.test(event));
  if (!partnership) return { kind: "default", key: `${sport}|${event}`, name: `Belgium · ${event}` };
  const ids = members.map((m) => m.id).toSorted();
  return { kind: "partnership", key: `${sport}|${event}|${ids.join("+")}`, name: members.map((m) => m.name).join(" / ") };
}

export type MedalEntry = { kind: "athlete"; athleteId: string } | { kind: "team"; teamId: string; roster: string[] };

export type MedalResult = {
  competitionId: string;
  /** Medals are won at Championships and the Games only. */
  competitionKind: string;
  event: string;
  place: number | null;
  status: string;
  entry: MedalEntry;
};

export type MedalCount = { gold: number; silver: number; bronze: number };

const COLOURS = ["gold", "silver", "bronze"] as const;

function medalColour(r: MedalResult) {
  if (r.competitionKind === "circuit" || r.status !== "finished" || r.place === null) return null;
  return COLOURS[r.place - 1] ?? null;
}

function count(results: MedalResult[], key: (r: MedalResult) => string): MedalCount {
  const counted = new Set<string>();
  const total: MedalCount = { gold: 0, silver: 0, bronze: 0 };
  for (const r of results) {
    const colour = medalColour(r);
    const k = `${r.competitionId}|${r.event}|${key(r)}`;
    if (!colour || counted.has(k)) continue;
    counted.add(k);
    total[colour]++;
  }
  return total;
}

const entryKey = (e: MedalEntry) => (e.kind === "athlete" ? `athlete:${e.athleteId}` : `team:${e.teamId}`);

/** Belgium's medals: one per Entry per event, so a Team medal counts once whatever its roster size. */
export function belgiumMedals(results: MedalResult[]): MedalCount {
  return count(results, (r) => entryKey(r.entry));
}

/** One Athlete's medals: their own, plus every Team medal whose roster credits them, once per event. */
export function athleteMedals(results: MedalResult[], athleteId: string): MedalCount {
  const theirs = results.filter((r) =>
    r.entry.kind === "athlete" ? r.entry.athleteId === athleteId : r.entry.roster.includes(athleteId),
  );
  return count(theirs, () => athleteId);
}
