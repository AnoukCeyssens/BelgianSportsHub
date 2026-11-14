// World Triathlon through its API (api.triathlon.org/v1, documented at
// developers.triathlon.org; research/summer-sport-sources). Every request
// needs the free API key of a registered app, sent in an `apikey` header; the
// owner sets it as the WORLD_TRIATHLON_API_KEY Worker secret. Without it the
// source counts as blocked (Assisted). World Triathlon's terms ask for written
// permission for automated extraction; ask for it together with the key.
//
// One run, kept small and polite:
// 1. the events from a week before the last run (a year back on the first run)
//    to two weeks ahead: one request per 100 events;
// 2. for each qualification-relevant one (the Games, World Championships and
//    Championship Series, World Cups, continental championships), its programs;
// 3. the results of each Elite Men / Elite Women race and each senior relay
//    held since the window start, Belgian rows only; the start list of each
//    individual race still to come.
// Senior relays (mixed relay) go to Belgium's relay Team (ADR 0001), with the
// team members the result credits as its roster. Rankings wait for rankings
// ingest (#33).
// The API gives only a year of birth, so a Belgian not yet known by World
// Triathlon ID waits in the merge queue.
import { SourceBlocked, type CompetitionKind, type Person, type ResultStatus, type SourceAdapter, type SourceRun } from "../source-adapter";
import { addDays, isoDate } from "./dates";

const API = "https://api.triathlon.org/v1";
export const WORLD_TRIATHLON_KEY = "WORLD_TRIATHLON_API_KEY";
const SPORT = "Triathlon";
const FIRST_RUN_LOOKBACK_DAYS = 365;
/** Events last a few days and results can be corrected after: look a week back. */
const LOOKBACK_DAYS = 7;
const ENTRY_LIST_HORIZON_DAYS = 14;
const ELITE_RACES = new Set(["Elite Men", "Elite Women"]);
const RELAY = /Relay/i;

/** Event categories of qualification-relevant senior competitions, by World Triathlon's category name. */
const RELEVANT_CATEGORY = /World Championships|World Triathlon (Championship )?Series|World Cup|Continental Championship|Major Games|Olympic/i;
const CHAMPIONSHIP_CATEGORY = /World Championships|Continental Championship/i;
const NOT_SENIOR = /Junior|Youth|U23|Age.?Group|Para/i;

type Category = { cat_name: string };
type TriEvent = {
  event_id: number;
  event_title: string;
  event_venue: string | null;
  event_date: string;
  event_finish_date: string;
  event_country_noc: string | null;
  event_categories: Category[];
};
type EventPage = { current_page: number; last_page: number; data: TriEvent[] };
type Program = { prog_id: number; prog_name: string; prog_date: string; results: boolean; team: boolean };
type TriAthlete = { athlete_id: number; athlete_title: string; athlete_noc: string };
type TriResult = TriAthlete & { result_id: number; position: number | string | null; total_time: string | null };
type TriTeamResult = {
  team_noc: string;
  team_members: TriAthlete[];
  result_id: number;
  position: number | string | null;
  total_time: string | null;
};

export const worldTriathlon: SourceAdapter = {
  async run(run) {
    const key = run.secret(WORLD_TRIATHLON_KEY);
    if (!key) throw new SourceBlocked(`World Triathlon needs an API key: set the ${WORLD_TRIATHLON_KEY} secret`);
    const get = async <T>(url: string) => {
      const fetched = await run.fetch(url, { headers: { apikey: key } });
      return { body: JSON.parse(fetched.text) as { data: T } & Record<string, unknown>, rawCopyId: fetched.rawCopyId };
    };

    const today = isoDate(run.now);
    const from = run.since ? addDays(isoDate(run.since), -LOOKBACK_DAYS) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    const until = addDays(today, ENTRY_LIST_HORIZON_DAYS);

    for (const event of await events(get, from, until)) {
      const kind = competitionKind(event);
      if (!kind) continue;
      const competitionId = await run.rows.competition({
        name: event.event_title,
        sport: SPORT,
        kind,
        startDate: event.event_date,
        endDate: event.event_finish_date,
        city: event.event_venue,
        country: event.event_country_noc,
        venueZone: null,
        sourceRef: String(event.event_id),
        rawCopyId: event.rawCopyId,
      });

      const programs = await get<Program[]>(`${API}/events/${event.event_id}/programs?is_race=true`);
      for (const program of programs.body.data) {
        const race = `${API}/events/${event.event_id}/programs/${program.prog_id}`;
        if (program.team) {
          if (!RELAY.test(program.prog_name) || NOT_SENIOR.test(program.prog_name)) continue;
          if (program.results && program.prog_date >= from && program.prog_date <= today) {
            const results = await get<{ results: TriTeamResult[] }>(`${race}/results`);
            await writeTeamResults(run, competitionId, program, results.body.data.results, results.rawCopyId);
          }
          continue;
        }
        if (!ELITE_RACES.has(program.prog_name)) continue;
        if (program.results && program.prog_date >= from && program.prog_date <= today) {
          const results = await get<{ results: TriResult[] }>(`${race}/results`);
          await writeResults(run, competitionId, program, results.body.data.results, results.rawCopyId);
        } else if (program.prog_date >= today) {
          const entries = await get<{ entries: TriAthlete[] }>(`${race}/entries`);
          const people = entries.body.data.entries.filter((a) => a.athlete_noc === "BEL").map(person);
          await run.rows.entrants(competitionId, people, entries.rawCopyId);
        }
      }
    }
  },
};

async function events(
  get: <T>(url: string) => Promise<{ body: { data: T } & Record<string, unknown>; rawCopyId: string }>,
  from: string,
  until: string,
) {
  const all: (TriEvent & { rawCopyId: string })[] = [];
  for (let page = 1, last = 1; page <= last; page++) {
    const url = `${API}/events?start_date=${from}&end_date=${until}&per_page=100&order=asc${page > 1 ? `&page=${page}` : ""}`;
    const { body, rawCopyId } = await get<TriEvent[]>(url);
    all.push(...body.data.map((e) => ({ ...e, rawCopyId })));
    last = (body as unknown as EventPage).last_page ?? 1;
  }
  return all;
}

async function writeResults(run: SourceRun, competitionId: string, program: Program, results: TriResult[], rawCopyId: string) {
  for (const r of results) {
    if (r.athlete_noc !== "BEL") continue;
    const status = resultStatus(r.position);
    if (!status) continue;
    await run.rows.result({
      competitionId,
      person: person(r),
      event: program.prog_name,
      date: program.prog_date,
      place: typeof r.position === "number" ? r.position : null,
      status,
      performance: status === "finished" ? r.total_time : null,
      sourceRef: String(r.result_id),
      rawCopyId,
    });
  }
}

async function writeTeamResults(run: SourceRun, competitionId: string, program: Program, results: TriTeamResult[], rawCopyId: string) {
  for (const r of results) {
    if (r.team_noc !== "BEL") continue;
    const status = resultStatus(r.position);
    if (!status) continue;
    await run.rows.teamResult({
      competitionId,
      nationality: r.team_noc,
      event: program.prog_name,
      date: program.prog_date,
      place: typeof r.position === "number" ? r.position : null,
      status,
      performance: status === "finished" ? r.total_time : null,
      sourceRef: String(r.result_id),
      rawCopyId,
      roster: r.team_members.map(person),
    });
  }
}

/** A numeric position is a finish; DNS is not a performance; a lapped athlete is out of the race. */
function resultStatus(position: TriResult["position"]): ResultStatus | null {
  if (typeof position === "number") return "finished";
  switch (String(position).toUpperCase()) {
    case "DNF":
      return "DNF";
    case "DSQ":
      return "DSQ";
    case "LAP":
      return "eliminated";
    default:
      return null;
  }
}

function competitionKind(event: TriEvent): CompetitionKind | null {
  if (NOT_SENIOR.test(event.event_title)) return null;
  const categories = event.event_categories.map((c) => c.cat_name);
  if (!categories.some((c) => RELEVANT_CATEGORY.test(c))) return null;
  if (/Olympic Games/i.test(event.event_title) && !/Youth/i.test(event.event_title)) return "games";
  return categories.some((c) => CHAMPIONSHIP_CATEGORY.test(c)) ? "championship" : "circuit";
}

function person(a: TriAthlete): Person {
  return {
    name: a.athlete_title,
    dateOfBirth: null,
    nationality: a.athlete_noc,
    ifId: { scheme: "world-triathlon", value: String(a.athlete_id) },
  };
}
