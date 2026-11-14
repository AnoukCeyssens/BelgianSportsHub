// UCI cycling results through DataRide (dataride.uci.ch), the results service
// behind uci.org's results iframes (research/summer-sport-sources). Its grids
// only answer form POSTs, so this adapter asks with `run.fetch(url, { form })`;
// the form is kept with each raw copy. No contract: it can change without notice.
//
// One run, per discipline (road, track, mountain bike, BMX racing, BMX
// freestyle):
// 1. the discipline's seasons (one GET), then the competitions of every season
//    the run's window touches (one POST each);
// 2. for each qualification-relevant competition that ended since the last run
//    (a year back on the first run) and has started: its races, then for each
//    final senior (Elite) race of an Olympic event: its events, and the
//    results of its final classification; Belgian rows only. A track team
//    event (madison, team sprint, team pursuit) is Belgium's Team result
//    (ADR 0001), with every rider the classification credits as its roster.
// Scope (spec #20, story 95): road is an open pro tour, so only the
// Championships, the Games and the UCI's named top series (the men's and
// women's WorldTour) come in; the rest arrives through the UCI rankings
// (#33). Track, mountain bike and BMX keep their Championships, the Games and
// their World Cups. DataRide gives no rider ID, only name and date of birth,
// so the IF ID is the two together. No entry lists, so no Upcoming.
import type { CompetitionKind, Person, ResultStatus, SourceAdapter, SourceRun } from "../source-adapter";

const SITE = "https://dataride.uci.ch";
const SPORT = "Cycling";
const FIRST_RUN_LOOKBACK_DAYS = 365;
const CALENDAR_HORIZON_DAYS = 14;
/** DataRide states dates as midnight in its own zone. */
const DATARIDE_ZONE = "Europe/Zurich";

type Discipline = {
  id: number;
  name: string;
  /** The competition classes that count (UCI class codes). */
  classes: Record<string, CompetitionKind>;
  /** The Olympic race types (DataRide race type codes), team events included. */
  raceTypes: Set<string>;
  /** Further narrows the competitions, where one class mixes Olympic and other formats. */
  competition?: RegExp;
};

/** Track team events: madison, team sprint, team pursuit. DataRide lists each rider on a row; a team's first row carries its rank. */
const TEAM_RACE_TYPES = new Set(["MA", "TS", "TP"]);

const CHAMPIONSHIPS: Record<string, CompetitionKind> = { CM: "championship", CC: "championship", JO: "games", OG: "games" };

const DISCIPLINES: Discipline[] = [
  {
    id: 10,
    name: "Road",
    classes: { ...CHAMPIONSHIPS, "1.UWT": "circuit", "2.UWT": "circuit", "1.WWT": "circuit", "2.WWT": "circuit" },
    raceTypes: new Set(["IRR", "ITT"]),
  },
  { id: 9, name: "Track", classes: { ...CHAMPIONSHIPS, CDM: "circuit" }, raceTypes: new Set(["SP", "KE", "OM", ...TEAM_RACE_TYPES]) },
  {
    id: 7,
    name: "Mountain bike",
    classes: { ...CHAMPIONSHIPS, CDM: "circuit" },
    raceTypes: new Set(["XCO"]),
    competition: /XCO/,
  },
  { id: 1, name: "BMX racing", classes: { ...CHAMPIONSHIPS, CDM: "circuit" }, raceTypes: new Set(["BMX-IND"]) },
  { id: 13, name: "BMX freestyle", classes: { ...CHAMPIONSHIPS, CDM: "circuit" }, raceTypes: new Set(["BFR-PRK"]) },
];

const SENIOR = new Set(["Men Elite", "Women Elite"]);
/** Same class codes, but not senior competition. */
const NOT_SENIOR = /junior|masters|challenge|para/i;

type Season = { Id: number; StartDate: string; EndDate: string };
type Competition = {
  CompetitionId: number;
  CompetitionName: string;
  StartDate: string;
  EndDate: string;
  CountryIsoCode3: string | null;
  ClassCode: string;
};
type Race = { Id: number; RaceName: string; RaceCode: string; CategoryCode: string; RaceTypeCode: string; Date: string };
type RaceEvent = { EventId: number; EventName: string; IsTeamEvent: boolean };
type Result = {
  RankNumber: number | null;
  DisplayName: string;
  BirthDate: string | null;
  NationName: string | null;
  ResultValue: string | null;
  Irm: string | null;
  /** The nation, on a team's first row (every row in a madison); empty on the rows of its other riders. */
  TeamName?: string | null;
};

export const uciCycling: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    const horizon = addDays(today, CALENDAR_HORIZON_DAYS);

    for (const discipline of DISCIPLINES) {
      for (const c of await competitions(run, discipline, windowStart, horizon)) {
        const kind = discipline.classes[c.ClassCode];
        const startDate = dataRideDate(c.StartDate);
        const endDate = dataRideDate(c.EndDate);
        if (!kind || NOT_SENIOR.test(c.CompetitionName) || (discipline.competition && !discipline.competition.test(c.CompetitionName))) continue;
        if (endDate < windowStart || startDate > horizon) continue;
        const competitionId = await run.rows.competition({
          name: c.CompetitionName,
          sport: SPORT,
          kind,
          startDate,
          endDate,
          city: null,
          country: c.CountryIsoCode3 || null,
          venueZone: null,
          sourceRef: `${discipline.id}/${c.CompetitionId}`,
          rawCopyId: c.rawCopyId,
        });
        if (startDate > today) continue;
        await results(run, discipline, c, competitionId, today);
      }
    }
  },
};

async function competitions(run: SourceRun, discipline: Discipline, from: string, to: string) {
  const fetched = await run.fetch(`${SITE}/iframe/GetRestrictedResultsDisciplineSeasons/?disciplineId=${discipline.id}`);
  const seasons = (JSON.parse(fetched.text) as Season[]).filter(
    (s) => dataRideDate(s.StartDate) <= to && dataRideDate(s.EndDate) >= from,
  );
  const all: (Competition & { rawCopyId: string })[] = [];
  for (const season of seasons) {
    const list = await run.fetch(`${SITE}/iframe/Competitions/`, {
      form: {
        disciplineId: String(discipline.id),
        ...page(1000),
        "sort[0][field]": "StartDate",
        "sort[0][dir]": "desc",
        "filter[logic]": "and",
        "filter[filters][0][field]": "RaceTypeId",
        "filter[filters][0][value]": "0",
        "filter[filters][1][field]": "CategoryId",
        "filter[filters][1][value]": "0",
        "filter[filters][2][field]": "SeasonId",
        "filter[filters][2][value]": String(season.Id),
      },
    });
    all.push(...(JSON.parse(list.text) as { data: Competition[] }).data.map((c) => ({ ...c, rawCopyId: list.rawCopyId })));
  }
  return all;
}

async function results(run: SourceRun, discipline: Discipline, c: Competition, competitionId: string, today: string) {
  const listed = await run.fetch(`${SITE}/iframe/Races/`, {
    form: { disciplineId: String(discipline.id), competitionId: String(c.CompetitionId), ...page(100), "sort[0][field]": "Index", "sort[0][dir]": "asc" },
  });
  const races = (JSON.parse(listed.text) as { data: Race[] }).data.filter(
    // "F": the final classification (one-day race, stage race overall, track event); stages are "S".
    (r) => r.RaceCode === "F" && SENIOR.has(r.CategoryCode) && discipline.raceTypes.has(r.RaceTypeCode) && raceDate(r.Date) <= today,
  );
  for (const race of races) {
    const fetchedEvents = await run.fetch(`${SITE}/iframe/Events/`, {
      form: { disciplineId: String(discipline.id), raceId: String(race.Id) },
    });
    const events = JSON.parse(fetchedEvents.text) as RaceEvent[];
    // The general classification; the points, mountains and Olympic ranking classifications are not results.
    const event = events.find((e) => e.EventName === "General Classification") ?? (events.length === 1 ? events[0] : undefined);
    const team = TEAM_RACE_TYPES.has(race.RaceTypeCode);
    if (!event || (event.IsTeamEvent && !team)) continue;
    const fetched = await run.fetch(`${SITE}/iframe/Results/`, {
      form: { disciplineId: String(discipline.id), eventId: String(event.EventId), ...page(1000) },
    });
    const rows = (JSON.parse(fetched.text) as { data: Result[] }).data;
    if (team) {
      for (const t of teams(rows)) {
        const [first] = t.rows;
        if (first.NationName?.trim() !== "BEL") continue;
        const status = statusOf(first);
        if (!status) continue;
        await run.rows.teamResult({
          competitionId,
          nationality: "BEL",
          event: eventName(discipline, race),
          date: raceDate(race.Date),
          place: status === "finished" ? first.RankNumber : null,
          status,
          performance: status === "finished" ? first.ResultValue?.trim() || null : null,
          sourceRef: `${discipline.id}/${c.CompetitionId}/${event.EventId}/BEL`,
          rawCopyId: fetched.rawCopyId,
          roster: t.rows.map(person),
        });
      }
      continue;
    }
    for (const r of rows) {
      if (r.NationName?.trim() !== "BEL") continue;
      const status = statusOf(r);
      if (!status) continue;
      const p = person(r);
      await run.rows.result({
        competitionId,
        person: p,
        event: eventName(discipline, race),
        date: raceDate(race.Date),
        place: status === "finished" ? r.RankNumber : null,
        status,
        performance: status === "finished" ? r.ResultValue?.trim() || null : null,
        sourceRef: `${discipline.id}/${c.CompetitionId}/${event.EventId}/${p.ifId.value}`,
        rawCopyId: fetched.rawCopyId,
      });
    }
  }
}

/** "Track: Men Elite - Sprint"; a stage race's overall result is "Road: Men Elite - General Classification". */
function eventName(discipline: Discipline, race: Race): string {
  const name = race.RaceName === "Final Classification" ? `${race.CategoryCode} - General Classification` : race.RaceName;
  return `${discipline.name}: ${name}`;
}

/**
 * A team event's rows grouped per team: a row naming a team (and its rank)
 * starts one, and the rows after it without a team name are its other riders.
 */
function teams(rows: Result[]) {
  const found: { name: string; rank: number | null; rows: Result[] }[] = [];
  for (const r of rows) {
    const name = r.TeamName?.trim() ?? "";
    const current = found.at(-1);
    if (name && (!current || current.name !== name || current.rank !== r.RankNumber)) found.push({ name, rank: r.RankNumber, rows: [r] });
    else current?.rows.push(r);
  }
  return found;
}

/** Kendo grid paging, as the DataRide pages send it. */
function page(size: number): Record<string, string> {
  return { take: String(size), skip: "0", page: "1", pageSize: String(size) };
}

function statusOf(r: Result): ResultStatus | null {
  const irm = r.Irm?.trim().toUpperCase();
  if (irm === "DNS") return null;
  if (irm === "DSQ" || irm === "DQ") return "DSQ";
  if (irm) return "DNF"; // DNF, OTL, LAP, ABD: did not finish the race
  return r.RankNumber === null ? null : "finished";
}

/** "VAN AERT Wout", born 1994-09-15: DataRide has no rider ID, so name and date of birth stand in for one. */
function person(r: Result): Person {
  const dateOfBirth = r.BirthDate ? dataRideDate(r.BirthDate) : null;
  return {
    name: r.DisplayName.trim(),
    dateOfBirth,
    nationality: "BEL",
    ifId: { scheme: "uci", value: `${r.DisplayName.trim().toUpperCase()} ${dateOfBirth ?? "?"}` },
  };
}

/** "/Date(1790460000000)/" → the date in DataRide's zone. */
function dataRideDate(value: string): string {
  const ms = Number(value.match(/-?\d+/)?.[0]);
  return new Intl.DateTimeFormat("en-CA", { timeZone: DATARIDE_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "27 Sep 2026" → "2026-09-27". */
function raceDate(text: string): string {
  const [day, month, year] = text.split(" ");
  return `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
