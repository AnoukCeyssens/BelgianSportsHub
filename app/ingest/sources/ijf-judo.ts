// IJF judo through Judobase's undocumented JSON backend (data.ijf.org;
// research/summer-sport-sources). Anonymous GETs, no contract: it can change
// without notice, and a refusal drops the source to Assisted.
//
// One run:
// 1. the competition list of each calendar year the run looks at (one request
//    per year, usually one);
// 2. for each qualification-relevant senior competition that ended since the
//    last run (a year back on the first run), is running, or starts within two
//    weeks: its competitors list. That one payload carries both the entry list
//    (behind Upcoming) and, per weight category, the final places once the
//    category is decided.
// Mixed team events are not ingested: Judobase keeps them as separate
// competitions (e.g. "... Mixed Teams", is_teams 1) that its competition list
// does not return, and their competitors list gives no team place. Belgium has
// fielded no mixed team at the Games or the Worlds since 2024.
import { seriesKey } from "~/domain";
import type { CompetitionKind, Person, SourceAdapter, SourceRun } from "../source-adapter";

const API = "https://data.ijf.org/api/get_json";
const SPORT = "Judo";
const FIRST_RUN_LOOKBACK_DAYS = 365;
const ENTRY_LIST_HORIZON_DAYS = 14;

/**
 * Judobase's tier names of the competitions that earn IJF World Ranking List
 * points (the Olympic qualification ranking): the Games, the Worlds, the
 * continental Championships, the Masters, the Grand Slams, the Grand Prix and
 * the continental Opens. Continental Cups, Kata, multi-sport games and camps
 * are left out.
 */
const KIND_BY_TIER: Record<string, CompetitionKind> = {
  "Olympic Games": "games",
  "World Championships": "championship",
  "European Championships": "championship",
  "Asian Championships": "championship",
  "African Championships": "championship",
  "Panamerica Championships": "championship",
  "Oceanian Championships": "championship",
  Masters: "circuit",
  "Grand Slam": "circuit",
  "Grand Prix": "circuit",
  "European Open": "circuit",
  "Asian Open": "circuit",
  "African Open": "circuit",
  "Panamerica Open": "circuit",
  "Oceanian Open": "circuit",
};

type IjfCompetition = {
  id_competition: string;
  name: string;
  /** "YYYY/MM/DD", venue-local. */
  date_from: string;
  date_to: string;
  city: string | null;
  country_short: string | null;
  timezone: string | null;
  rank_name: string;
  ages: string[];
  is_teams: string;
};

type IjfCompetitor = {
  id_person: string;
  given_name: string;
  family_name: string;
  /** "1970-01-01" stands for "not given". */
  birth_date: string | null;
  country_short: string;
  /** Final place once the category is decided ("1", "2", "3", "5", "7"); null for everyone else. */
  place: string | null;
  /** YYYY-MM-DD */
  date_from: string;
  contests_won: string | null;
  contests_lost: string | null;
};

type IjfCategory = { category: string; gender: "male" | "female"; persons: Record<string, IjfCompetitor> };
type IjfCompetitors = { categories: Record<string, Record<string, IjfCategory>> | [] };

export const ijfJudo: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    const horizon = addDays(today, ENTRY_LIST_HORIZON_DAYS);

    for (const c of await competitions(run, windowStart, horizon)) {
      const kind = KIND_BY_TIER[c.rank_name];
      const startDate = c.date_from.replaceAll("/", "-");
      const endDate = c.date_to.replaceAll("/", "-");
      if (!kind || c.is_teams === "1" || !c.ages.includes("sen") || endDate < windowStart) continue;

      const competitionId = await run.rows.competition({
        name: c.name,
        sport: SPORT,
        kind,
        startDate,
        endDate,
        city: c.city || null,
        country: c.country_short || null,
        venueZone: c.timezone || null,
        sourceRef: c.id_competition,
        series: seriesKey({ source: "ijf", name: c.name, kind, sport: SPORT, city: c.city || null }),
        rawCopyId: c.rawCopyId,
      });
      if (startDate > horizon) continue;

      const fetched = await run.fetch(`${API}?params[action]=competition.competitors&params[id_competition]=${c.id_competition}`);
      const body = JSON.parse(fetched.text) as IjfCompetitors;
      const categories = Array.isArray(body.categories) ? [] : Object.values(body.categories).flatMap((g) => Object.values(g));

      if (startDate <= today) {
        for (const category of categories) {
          const judoka = Object.values(category.persons);
          // A category is decided once its places are out; until then nobody has one.
          if (!judoka.some((j) => j.place === "1")) continue;
          for (const j of judoka.filter(isBelgian)) {
            const place = j.place ? Number(j.place) : null;
            await run.rows.result({
              competitionId,
              person: person(j),
              event: eventName(category),
              date: j.date_from,
              place,
              status: place === null ? "eliminated" : "finished",
              performance: record(j),
              sourceRef: `${c.id_competition}/${category.category}/${category.gender}/${j.id_person}`,
              rawCopyId: fetched.rawCopyId,
            });
          }
        }
      }
      if (endDate >= today) {
        // Each judoka in the weight class the list names them in, as the results name it.
        const entered = categories.flatMap((category) =>
          Object.values(category.persons)
            .filter(isBelgian)
            .map((j) => ({ ...person(j), events: [eventName(category)] })),
        );
        await run.rows.entrants(competitionId, entered, fetched.rawCopyId);
      }
    }
  },
};

async function competitions(run: SourceRun, from: string, to: string) {
  const all: (IjfCompetition & { rawCopyId: string })[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    const page = await run.fetch(`${API}?params[action]=competition.get_list&params[year]=${year}`);
    all.push(...(JSON.parse(page.text) as IjfCompetition[]).map((c) => ({ ...c, rawCopyId: page.rawCopyId })));
  }
  return all;
}

function person(j: IjfCompetitor): Person {
  return {
    name: `${j.given_name} ${j.family_name}`,
    dateOfBirth: j.birth_date && j.birth_date !== "1970-01-01" ? j.birth_date : null,
    nationality: j.country_short,
    ifId: { scheme: "ijf", value: j.id_person },
  };
}

const isBelgian = (j: IjfCompetitor) => j.country_short === "BEL";

/** "2 won · 1 lost": judo has no mark, so the contest record stands in for one. */
function record(j: IjfCompetitor): string | null {
  if (j.contests_won === null || j.contests_lost === null) return null;
  return `${j.contests_won} won · ${j.contests_lost} lost`;
}

/** YYYY-MM-DD of an instant in UTC. */
function isoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Men -73 kg": a weight class as the results and the entry list name it. */
function eventName(category: { gender: string; category: string }): string {
  return `${category.gender === "male" ? "Men" : "Women"} ${category.category} kg`;
}
