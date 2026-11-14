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
// 3. once a week, after Monday's issue (the first run after Monday noon UTC):
//    the world rankings, Belgians only, per senior category (WORLDRANKINGS
//    with Country=BEL): one ranking snapshot per known archer, and per team
//    category one for Belgium's default Team (ticket #33).
// Senior recurve and compound only (the Olympic and LA28 divisions); para,
// youth and masters categories are left out. The API gives no date of birth,
// so a Belgian not yet known by World Archery ID waits in the merge queue.
import { seriesKey } from "~/domain";
import type { CompetitionInput, CompetitionKind, Person, SourceAdapter, SourceRun } from "../source-adapter";
import { addDays, isoDate } from "./dates";

export const API = "https://api.worldarchery.org/v3";
const SPORT = "Archery";
const SCHEME = "world-archery";
const FIRST_RUN_LOOKBACK_DAYS = 365;
/** Results appear when a competition ends; a week-long event that started before the last run still counts. */
const RESULTS_LOOKBACK_DAYS = 14;
const ENTRY_LIST_HORIZON_DAYS = 14;
export const OUTDOOR = 1;

/** Senior categories and how a result names its event. */
export const EVENT_BY_CATEGORY: Record<string, string> = {
  RM: "Recurve Men",
  RW: "Recurve Women",
  CM: "Compound Men",
  CW: "Compound Women",
};

/** Senior team categories (three archers; mixed teams two) and how a Team result names its event. */
export const TEAM_EVENT_BY_CATEGORY: Record<string, string> = {
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
export const ENTRY_LIST_SUBLEVELS = new Set([1, 4, 12, 13, 22, 32, 46]);

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
export type WaCompetition = {
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
    if (rankingsIssuedSince(run)) await worldRankings(run);
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
        series: archerySeries(r.Name, kind),
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
      series: archerySeries(r.Name, kind),
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
  const fetched = await competitionList(run, today, addDays(today, ENTRY_LIST_HORIZON_DAYS));
  for (const c of fetched.competitions) {
    const kind = competitionKind(c.ComLevel, c.Name);
    if (!kind || c.IsCancelled || c.DTo < today) continue;
    if (!ENTRY_LIST_SUBLEVELS.has(c.ComSubLevel) && c.ComLevel !== OTHER_INTERNATIONAL_EVENT) continue;
    const competitionId = await run.rows.competition(competitionInput(c, kind, fetched.rawCopyId));
    const entries =await run.fetch(`${API}/ENTRIES/?CompId=${c.ID}&Noc=BEL&RBP=All`);
    const people = (JSON.parse(entries.text) as Page<Entry>).items
      .filter((e) => e.Athlete.NOC === "BEL" && e.CatInd.some((cat) => cat.Code in EVENT_BY_CATEGORY))
      .map((e) => person(e.Athlete));
    await run.rows.entrants(competitionId, people, entries.rawCopyId);
  }
}

/** A listed competition as a competition row (shared with the timetable source, which writes as this one). */
export function competitionInput(c: WaCompetition, kind: CompetitionKind, rawCopyId: string): CompetitionInput {
  return {
    name: c.Name,
    sport: SPORT,
    kind,
    startDate: c.DFrom,
    endDate: c.DTo,
    city: c.Place || null,
    country: c.Country || null,
    venueZone: null,
    sourceRef: String(c.ID),
    series: archerySeries(c.Name, kind),
    rawCopyId,
  };
}

/**
 * The series of a World Archery competition, from its name only (the results
 * rows carry no venue, and every writer of a competition must agree): a World
 * Cup stage keeps the host city its name starts with, not its stage number
 * (which changes from season to season).
 */
export function archerySeries(name: string, kind: CompetitionKind): string {
  return seriesKey({ source: "world-archery", name: name.replace(/\bstage\s*\d+\b/i, ""), kind, sport: SPORT, city: null });
}

/** The outdoor competitions held between two dates. */
export async function competitionList(run: SourceRun, from: string, to: string) {
  const fetched = await run.fetch(`${API}/COMPETITIONS/?DisciplineId=${OUTDOOR}&StartDate=${from}&EndDate=${to}&RBP=All`);
  return { competitions: (JSON.parse(fetched.text) as Page<WaCompetition>).items, rawCopyId: fetched.rawCopyId };
}

export function competitionKind(level: number, name: string): CompetitionKind | null {
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

type Ranked = {
  Rnk: number;
  Cat: string;
  Points: number | null;
  RnkDtIssued: string;
  Athlete?: { Id: string; FName: string; GName: string; WNameOrd: boolean; NOC: string };
  Team?: { NOC: string };
};

/** World rankings are issued on Mondays: fetch them on the first run after Monday noon (UTC), or on the first run ever. */
function rankingsIssuedSince(run: SourceRun): boolean {
  if (!run.since) return true;
  const day = run.now.getUTCDay();
  const monday = new Date(Date.UTC(run.now.getUTCFullYear(), run.now.getUTCMonth(), run.now.getUTCDate() - ((day + 6) % 7), 12));
  return run.since < monday && run.now >= monday;
}

async function worldRankings(run: SourceRun) {
  for (const [cat, event] of Object.entries(EVENT_BY_CATEGORY)) {
    const fetched = await run.fetch(`${API}/WORLDRANKINGS/?CatCode=${cat}&Country=BEL&RBP=All`);
    for (const r of (JSON.parse(fetched.text) as { items: Ranked[] }).items) {
      if (!r.Athlete || r.Athlete.NOC !== "BEL") continue;
      await run.rows.ranking({
        ranking: `World Archery world ranking · ${event}`,
        sport: SPORT,
        asOf: r.RnkDtIssued,
        position: r.Rnk,
        points: r.Points === null ? null : String(r.Points),
        person: person(r.Athlete),
        rawCopyId: fetched.rawCopyId,
      });
    }
  }
  for (const [cat, event] of Object.entries(TEAM_EVENT_BY_CATEGORY)) {
    const fetched = await run.fetch(`${API}/WORLDRANKINGS/?CatCode=${cat}&Country=BEL&Team=true&RBP=All`);
    for (const r of (JSON.parse(fetched.text) as { items: Ranked[] }).items) {
      if (r.Team?.NOC !== "BEL") continue;
      const teamId = await run.rows.team({ sport: SPORT, event, members: null, rawCopyId: fetched.rawCopyId });
      await run.rows.ranking({
        ranking: `World Archery world ranking · ${event}`,
        sport: SPORT,
        asOf: r.RnkDtIssued,
        position: r.Rnk,
        points: r.Points === null ? null : String(r.Points),
        teamId,
        rawCopyId: fetched.rawCopyId,
      });
    }
  }
}
