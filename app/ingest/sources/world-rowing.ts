// World Rowing through the undocumented JSON:API backend of its own site
// (world-rowing-api.soticcloud.net; research/summer-sport-sources). Anonymous
// GETs, no contract.
//
// One run:
// 1. the competition list of each calendar year the run looks at (one request
//    per year, usually one);
// 2. for each Championship, the Games, World Rowing Cup or Olympic
//    qualification regatta that ended since the last run (a year back on the
//    first run) or is running: all its races, with boats, crews and times
//    (one request); Belgian rows only.
// Olympic boat classes only. A single sculler's result is theirs; every other
// boat is a crew, a Team (ADR 0001: each boat is its own partnership), whose
// roster is everyone the results credit in that boat across the rounds. The
// API publishes races, not a final classification, so a boat's place comes
// from the final it reached (Final B is 7th to 12th, the bronze medal race 3rd
// and 4th), and a boat knocked out earlier is "eliminated" with its last time.
// No entry lists are read, so there is no Upcoming.
import { seriesKey } from "~/domain";
import type { CompetitionKind, Person, ResultStatus, SourceAdapter, SourceRun } from "../source-adapter";

const API = "https://world-rowing-api.soticcloud.net/stats/api";
const SPORT = "Rowing";
const FIRST_RUN_LOOKBACK_DAYS = 365;
const CALENDAR_HORIZON_DAYS = 14;
/** The Olympic single sculls: men's and women's, classic and coastal (beach sprints). */
const SINGLES = new Set(["M1x", "W1x", "CM1x", "CW1x"]);
/** The Olympic crew boats: classic sweep and sculling boats, and the coastal mixed double. */
const CREWS = new Set(["M2-", "W2-", "M2x", "W2x", "M4-", "W4-", "M4x", "W4x", "M8+", "W8+", "CMix2x"]);

type Competition = {
  id: string;
  DisplayName: string;
  /** "YYYY-MM-DD 00:00:00" */
  StartDate: string;
  EndDate: string;
  competitionType: { DisplayName: string } | null;
  venue: { RegionCity: string | null; country: { CountryCode: string } | null } | null;
};

type Race = {
  id: string;
  DisplayName: string;
  /** Venue-local, e.g. "2026-10-20T10:37:00+08:00". */
  DateString: string;
  event: { id: string; DisplayName: string; boatClass: { DisplayName: string } };
  racePhase: { DisplayName: string };
  raceBoats: Boat[];
};

type Boat = {
  /** The boat entered in the event, the same in every round. */
  boatId: string;
  Rank: number | null;
  ResultTime: string | null;
  /** "DNS", "DNF", "DSQ", "EXC", … when the boat has no valid result. */
  InvalidMarkResult: string | null;
  country: { CountryCode: string } | null;
  raceBoatAthletes: { person: { id: string; FirstName: string; LastName: string; BirthDate: string | null } }[];
};

export const worldRowing: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    const horizon = addDays(today, CALENDAR_HORIZON_DAYS);

    for (const c of await competitions(run, windowStart, horizon)) {
      const kind = competitionKind(c);
      const startDate = c.StartDate.slice(0, 10);
      const endDate = c.EndDate.slice(0, 10);
      if (!kind || endDate < windowStart || startDate > horizon) continue;
      const competitionId = await run.rows.competition({
        name: c.DisplayName.trim(),
        sport: SPORT,
        kind,
        startDate,
        endDate,
        city: c.venue?.RegionCity || null,
        country: c.venue?.country?.CountryCode ?? null,
        venueZone: null,
        sourceRef: c.id,
        series: seriesKey({ source: "world-rowing", name: c.DisplayName, kind, sport: SPORT, city: c.venue?.RegionCity || null }),
        rawCopyId: c.rawCopyId,
      });
      if (startDate > today) continue;

      const fetched = await run.fetch(
        `${API}/race/?include=racePhase,event.boatClass,raceBoats.raceBoatAthletes.person,raceBoats.country&filter[event.competitionId]=${c.id}&sort[eventNum]=asc`,
      );
      const races = (JSON.parse(fetched.text) as { data: Race[] }).data.filter(
        (r) => SINGLES.has(r.event.boatClass.DisplayName) || CREWS.has(r.event.boatClass.DisplayName),
      );
      for (const [eventId, eventRaces] of groupBy(races, (r) => r.event.id)) {
        const crew = CREWS.has(eventRaces[0].event.boatClass.DisplayName);
        for (const { race, boat, rowers } of lastRaces(eventRaces)) {
          const status = statusOf(race, boat);
          if (!status) continue;
          const result = {
            competitionId,
            event: race.event.DisplayName,
            date: race.DateString.slice(0, 10),
            place: status === "finished" ? placeIn(race, boat, eventRaces) : null,
            status,
            performance: boat.ResultTime ? boat.ResultTime.replace(/^00:/, "") : null,
            rawCopyId: fetched.rawCopyId,
          };
          if (crew) {
            const roster = rowers.map(person);
            await run.rows.teamResult({ ...result, nationality: "BEL", roster, sourceRef: `${c.id}/${eventId}/${boat.boatId}` });
          } else {
            const sculler = rowers[0];
            await run.rows.result({ ...result, person: person(sculler), sourceRef: `${c.id}/${eventId}/${sculler.id}` });
          }
        }
      }
    }
  },
};

async function competitions(run: SourceRun, from: string, to: string) {
  const all: (Competition & { rawCopyId: string })[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    const fetched = await run.fetch(`${API}/competition?include=competitionType,venue.country&filter[Year]=${year}&sort[StartDate]=asc`);
    all.push(...(JSON.parse(fetched.text) as { data: Competition[] }).data.map((c) => ({ ...c, rawCopyId: fetched.rawCopyId })));
  }
  return all;
}

/** Senior competitions only; coastal rowing counts through its beach sprints. */
function competitionKind(c: Competition): CompetitionKind | null {
  const type = c.competitionType?.DisplayName ?? "";
  if (/under|U19|U23|junior|masters|indoor|universit|youth|virtual/i.test(`${type} ${c.DisplayName}`)) return null;
  if (/Olympic Games/i.test(type)) return "games";
  if (/^(World|European) Rowing Championships$/i.test(type) || /Beach Sprint/i.test(type)) return "championship";
  if (/^World Rowing Cup/i.test(type) || /Qualification Regatta/i.test(c.DisplayName)) return "circuit";
  return null;
}

type Rower = Boat["raceBoatAthletes"][number]["person"];

/**
 * Each Belgian boat's last race in the event (the final it reached, or the
 * round it went out in), with every rower the results credit in it across
 * the rounds: the last race's crew first, then anyone who rowed only earlier.
 */
function lastRaces(races: Race[]) {
  const boats = new Map<string, { race: Race; boat: Boat; rowers: Map<string, Rower> }>();
  const byDate = races.toSorted((a, b) => Date.parse(b.DateString) - Date.parse(a.DateString));
  for (const race of byDate) {
    for (const boat of race.raceBoats) {
      if (boat.country?.CountryCode !== "BEL" || boat.raceBoatAthletes.length === 0) continue;
      let seen = boats.get(boat.boatId);
      if (!seen) boats.set(boat.boatId, (seen = { race, boat, rowers: new Map() }));
      for (const { person } of boat.raceBoatAthletes) if (!seen.rowers.has(person.id)) seen.rowers.set(person.id, person);
    }
  }
  return [...boats.values()].map(({ race, boat, rowers }) => ({ race, boat, rowers: [...rowers.values()] }));
}

function statusOf(race: Race, boat: Boat): ResultStatus | null {
  const invalid = boat.InvalidMarkResult?.toUpperCase();
  if (invalid === "DNS") return null;
  if (invalid === "DNF") return "DNF";
  if (invalid) return "DSQ";
  if (boat.Rank === null) return null;
  return isFinal(race) ? "finished" : "eliminated";
}

const isFinal = (race: Race) => race.racePhase.DisplayName === "Final";

/**
 * The place a final gives: its rank, after every boat of the finals above it
 * (Final A above Final B; the gold medal race above the bronze).
 */
function placeIn(race: Race, boat: Boat, eventRaces: Race[]): number | null {
  if (boat.Rank === null) return null;
  const order = (r: Race) => (/Gold/i.test(r.DisplayName) ? 0 : /Bronze/i.test(r.DisplayName) ? 1 : (r.DisplayName.match(/Final ([A-Z])$/)?.[1].charCodeAt(0) ?? 65) - 65);
  const above = eventRaces.filter((r) => isFinal(r) && order(r) < order(race));
  return above.reduce((n, r) => n + r.raceBoats.length, 0) + boat.Rank;
}

function person(p: Rower): Person {
  return {
    name: `${p.FirstName} ${p.LastName}`,
    dateOfBirth: p.BirthDate ? p.BirthDate.slice(0, 10) : null,
    nationality: "BEL",
    ifId: { scheme: "world-rowing", value: p.id },
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function isoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
