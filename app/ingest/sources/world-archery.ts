// World Archery through its public API (api.worldarchery.org/v3;
// research/summer-sport-sources). Anonymous GETs, documented at /v3/API/.
//
// One run, kept small and polite:
// 1. Belgium's individual and team outdoor results in competitions from two
//    weeks before the last run (a year back on the first run) to today: two
//    requests (COUNTRYRESULTS, already filtered to BEL by the API). A team
//    result goes to Belgium's default Team for the event (ADR 0001), with the
//    archers it names as the roster;
// 2. outdoor competitions running now or starting within two weeks: one
//    request; for each European or world event among them, its Belgian entries
//    as the entry list behind Upcoming.
// Senior recurve and compound only (the Olympic and LA28 divisions); para,
// youth and masters categories are left out. The API gives no date of birth,
// so a Belgian not yet known by World Archery ID waits in the merge queue.
import type { CompetitionKind, Person, SourceAdapter, SourceRun } from "../source-adapter";
import { addDays, isoDate } from "./dates";

const API = "https://api.worldarchery.org/v3";
const SPORT = "Archery";
const SCHEME = "world-archery";
const FIRST_RUN_LOOKBACK_DAYS = 365;
/** Results appear when a competition ends; a week-long event that started before the last run still counts. */
const RESULTS_LOOKBACK_DAYS = 14;
const ENTRY_LIST_HORIZON_DAYS = 14;
const OUTDOOR = 1;

/** Senior categories and how a result names its event. */
const EVENT_BY_CATEGORY: Record<string, string> = {
  RM: "Recurve Men",
  RW: "Recurve Women",
  CM: "Compound Men",
  CW: "Compound Women",
};

/** Senior team categories (three archers; mixed teams two) and how a Team result names its event. */
const TEAM_EVENT_BY_CATEGORY: Record<string, string> = {
  RM: "Recurve Men Team",
  RW: "Recurve Women Team",
  CM: "Compound Men Team",
  CW: "Compound Women Team",
  RX: "Recurve Mixed Team",
  CX: "Compound Mixed Team",
};

/**
 * World Archery competition levels that are qualification-relevant: the
 * Games, World Championships, the World Cup, multisport continental games
 * (European Games), continental championships and international circuits.
 * "Other International Event" (level 8) counts only for Olympic qualification
 * tournaments.
 */
const KIND_BY_LEVEL: Record<number, CompetitionKind> = {
  1: "games",
  2: "championship",
  3: "circuit",
  5: "circuit",
  6: "championship",
  7: "circuit",
};
const OTHER_INTERNATIONAL_EVENT = 8;
const QUALIFICATION_TOURNAMENT = /qualif/i;

/**
 * Sub-levels whose entry lists can name Belgians: the Summer Games, the World
 * Championships, World Cup stages and final, the European Games, the European
 * Outdoor Championships and the European Grand Prix. Youth, para, masters and
 * other continents' events are not worth a request.
 */
const ENTRY_LIST_SUBLEVELS = new Set([1, 4, 12, 13, 22, 32, 46]);

type WaAthlete = { Id: string | number; FName: string; GName: string; WNameOrd: boolean; NOC: string };
type Page<T> = { items: T[] };
type CountryResult = {
  Rnk: number | null;
  WaId: number;
  FName: string;
  GName: string;
  WNameOrd: boolean;
  NOC: string;
  Id: number;
  ComLevel: number;
  Name: string;
  Country: string;
  Cat: string;
  IsTeam: number;
  DFrom: string;
  DTo: string;
};
type TeamCountryResult = Omit<CountryResult, "WaId" | "FName" | "GName" | "WNameOrd"> & {
  Members: { WaId: number; FName: string; GName: string; WNameOrd: boolean }[];
};
type WaCompetition = {
  ID: number;
  Name: string;
  Place: string;
  Country: string;
  DFrom: string;
  DTo: string;
  ComLevel: number;
  ComSubLevel: number;
  IsCancelled: boolean;
};
type Entry = { Athlete: WaAthlete; CatInd: { Code: string }[] };

export const worldArchery: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const from = run.since ? addDays(isoDate(run.since), -RESULTS_LOOKBACK_DAYS) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    await results(run, from, today);
    await teamResults(run, from, today);
    await entryLists(run, today);
  },
};

async function results(run: SourceRun, from: string, today: string) {
  const fetched = await run.fetch(
    `${API}/COUNTRYRESULTS/?Noc=BEL&IndividualTeam=1&DisciplineId=${OUTDOOR}&StartDate=${from}&EndDate=${today}&RBP=All`,
  );
  const competitionIds = new Map<number, string>();
  for (const r of (JSON.parse(fetched.text) as Page<CountryResult>).items) {
    const event = EVENT_BY_CATEGORY[r.Cat];
    const kind = competitionKind(r.ComLevel, r.Name);
    if (r.IsTeam || r.NOC !== "BEL" || !event || !kind) continue;
    let competitionId = competitionIds.get(r.Id);
    if (!competitionId) {
      competitionId = await run.rows.competition({
        name: r.Name,
        sport: SPORT,
        kind,
        startDate: r.DFrom,
        endDate: r.DTo,
        city: null,
        country: r.Country || null,
        venueZone: null,
        sourceRef: String(r.Id),
        rawCopyId: fetched.rawCopyId,
      });
      competitionIds.set(r.Id, competitionId);
    }
    await run.rows.result({
      competitionId,
      person: person({ Id: r.WaId, FName: r.FName, GName: r.GName, WNameOrd: r.WNameOrd, NOC: r.NOC }),
      event,
      // The API gives the final ranking only, decided at the end of the competition.
      date: r.DTo,
      place: r.Rnk,
      status: "finished",
      performance: null,
      sourceRef: `${r.Id}/${r.Cat}/${r.WaId}`,
      rawCopyId: fetched.rawCopyId,
    });
  }
}

async function teamResults(run: SourceRun, from: string, today: string) {
  const fetched = await run.fetch(
    `${API}/COUNTRYRESULTS/?Noc=BEL&IndividualTeam=2&DisciplineId=${OUTDOOR}&StartDate=${from}&EndDate=${today}&RBP=All`,
  );
  for (const r of (JSON.parse(fetched.text) as Page<TeamCountryResult>).items) {
    const event = TEAM_EVENT_BY_CATEGORY[r.Cat];
    const kind = competitionKind(r.ComLevel, r.Name);
    if (r.NOC !== "BEL" || !event || !kind) continue;
    const competitionId = await run.rows.competition({
      name: r.Name,
      sport: SPORT,
      kind,
      startDate: r.DFrom,
      endDate: r.DTo,
      city: null,
      country: r.Country || null,
      venueZone: null,
      sourceRef: String(r.Id),
      rawCopyId: fetched.rawCopyId,
    });
    await run.rows.teamResult({
      competitionId,
      nationality: r.NOC,
      event,
      date: r.DTo,
      place: r.Rnk,
      status: "finished",
      performance: null,
      sourceRef: `${r.Id}/${r.Cat}/team`,
      rawCopyId: fetched.rawCopyId,
      roster: r.Members.map((m) => person({ Id: m.WaId, FName: m.FName, GName: m.GName, WNameOrd: m.WNameOrd, NOC: r.NOC })),
    });
  }
}

async function entryLists(run: SourceRun, today: string) {
  const fetched = await run.fetch(
    `${API}/COMPETITIONS/?DisciplineId=${OUTDOOR}&StartDate=${today}&EndDate=${addDays(today, ENTRY_LIST_HORIZON_DAYS)}&RBP=All`,
  );
  for (const c of (JSON.parse(fetched.text) as Page<WaCompetition>).items) {
    const kind = competitionKind(c.ComLevel, c.Name);
    if (!kind || c.IsCancelled || c.DTo < today) continue;
    if (!ENTRY_LIST_SUBLEVELS.has(c.ComSubLevel) && c.ComLevel !== OTHER_INTERNATIONAL_EVENT) continue;
    const competitionId = await run.rows.competition({
      name: c.Name,
      sport: SPORT,
      kind,
      startDate: c.DFrom,
      endDate: c.DTo,
      city: c.Place || null,
      country: c.Country || null,
      venueZone: null,
      sourceRef: String(c.ID),
      rawCopyId: fetched.rawCopyId,
    });
    const entries = await run.fetch(`${API}/ENTRIES/?CompId=${c.ID}&Noc=BEL&RBP=All`);
    const people = (JSON.parse(entries.text) as Page<Entry>).items
      .filter((e) => e.Athlete.NOC === "BEL" && e.CatInd.some((cat) => cat.Code in EVENT_BY_CATEGORY))
      .map((e) => person(e.Athlete));
    await run.rows.entrants(competitionId, people, entries.rawCopyId);
  }
}

function competitionKind(level: number, name: string): CompetitionKind | null {
  if (level === OTHER_INTERNATIONAL_EVENT) return QUALIFICATION_TOURNAMENT.test(name) ? "circuit" : null;
  return KIND_BY_LEVEL[level] ?? null;
}

/** WNameOrd marks names written family name first. */
function person(a: WaAthlete): Person {
  return {
    name: a.WNameOrd ? `${a.FName} ${a.GName}` : `${a.GName} ${a.FName}`,
    dateOfBirth: null,
    nationality: a.NOC,
    ifId: { scheme: SCHEME, value: String(a.Id) },
  };
}
