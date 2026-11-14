// World Aquatics through the undocumented JSON backend of its own site
// (api.worldaquatics.com/fina; research/summer-sport-sources). Anonymous GETs,
// no contract.
//
// One run:
// 1. the World Aquatics competitions ending since the last run (a year back
//    on the first run) up to two weeks ahead: one request;
// 2. for each Championship, the Games or World Cup leg that has started: its
//    disciplines, then the results of each discipline whose every heat is
//    official; Belgian rows only.
// Swim times count from any sanctioned meet, but only the Championships and
// the named top series are ingested (spec #20, story 95). European
// Championships are run by European Aquatics, not here. Relays, synchronised
// diving, duets and teams are Teams (ADR 0001): a relay or an artistic
// swimming team is Belgium's Team for the event, each synchro pair or duet its
// own Team; the roster is whoever the result credits, reserves left out. No
// structured entry lists, so there is no Upcoming.
// A competition holds several Olympic sports (the Worlds: swimming, diving,
// artistic swimming, marathon swimming, water polo): each gets its own
// competition row, source ref "<id>/<discipline code>", so every sport has its
// own Championship (qualification target, Phases, calendar colour). High
// diving is not on the Olympic programme and is left out.
import type { CompetitionInput, CompetitionKind, Person, ResultStatus, SourceAdapter, SourceRun } from "../source-adapter";

export const API = "https://api.worldaquatics.com/fina";
/** World Aquatics discipline codes of the Olympic sports (app/domain/sports.ts names). */
export const SPORT_OF_CODE: Record<string, string> = {
  SW: "Swimming",
  DV: "Diving",
  SY: "Artistic swimming",
  OW: "Marathon swimming",
  WP: "Water polo",
};
const FIRST_RUN_LOOKBACK_DAYS = 365;
/** The list is asked from this many days before the window, so a competition that started earlier but is still running comes along. */
const LIST_LEAD_DAYS = 14;
/** Competitions starting within this many days are listed already, for the calendar. */
const CALENDAR_HORIZON_DAYS = 14;

export type Competition = {
  id: number;
  name: string;
  venueDateFrom: string;
  venueDateTo: string;
  /** Missing while the host is not known. */
  location?: { countryCode?: string | null; city?: string | null };
  competitionType: { name: string };
  series: unknown[];
  /** Discipline codes held there ("SW", "DV", …). */
  disciplines?: string[];
};

type Events = {
  /** "25m" for short course. */
  PoolConfiguration: string | null;
  Sports: { Code: string; DisciplineList: { Id: string; DisciplineName: string; HeatList: { ResultStatus: string }[] }[] }[];
};

type DisciplineResults = {
  DisciplineName: string;
  Heats: { Name: string; IsSummary: boolean; Date: string; UtcDateTime: string; Results: SwimResult[] }[];
};

type SwimResult = {
  PersonId: string;
  /** Relays: each swimmer's leg. */
  SubResults?: { PersonId: string; FirstName: string; LastName: string; NAT: string }[] | null;
  /** Synchro, duets and teams: the athletes, by GMS ID only. */
  Competitors?: { GmsId: string; FirstName: string; LastName: string; NAT: string; Reserve?: boolean }[] | null;
  /** Judged events. */
  TotalPoints?: string | null;
  FirstName: string;
  LastName: string;
  NAT: string;
  /** The overall place in the discipline, the same in every round the athlete swam. */
  Rank: number | null;
  Time: string | null;
  /** "DNS", "DSQ", "DNF" when there is no result. */
  ScoringAbbr?: string | null;
};

/** Relays, synchronised diving, duets and teams: their results are Team results. */
const TEAM_EVENT = /relay|synchro|duet|team/i;

export const worldAquatics: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);

    for (const c of await competitions(run, windowStart, addDays(today, CALENDAR_HORIZON_DAYS))) {
      const kind = competitionKind(c.competitionType.name);
      if (!kind || c.venueDateTo.slice(0, 10) < windowStart) continue;
      const competitionIds = new Map<string, string>();
      for (const { code, ...input } of competitionInputs(c, kind)) competitionIds.set(code, await run.rows.competition(input));
      if (competitionIds.size === 0 || c.venueDateFrom.slice(0, 10) > today) continue;

      const listed = await run.fetch(`${API}/competitions/${c.id}/events`);
      const events = JSON.parse(listed.text) as Events;
      const course = events.PoolConfiguration === "25m" ? " (25m)" : "";
      for (const sport of events.Sports) {
        const competitionId = competitionIds.get(sport.Code);
        if (!competitionId) continue;
        // At the Games every sport's rows are the one Games competition: each result names its sport.
        const sportName = SPORT_OF_CODE[sport.Code];
        for (const discipline of sport.DisciplineList) {
          if (discipline.HeatList.length === 0 || discipline.HeatList.some((h) => h.ResultStatus !== "OFFICIAL")) continue;
          const fetched = await run.fetch(`${API}/events/${discipline.Id}`);
          const body = JSON.parse(fetched.text) as DisciplineResults;
          if (TEAM_EVENT.test(discipline.DisciplineName)) {
            await teamResults(
              run,
              { competitionId, sport: sportName, competitionRef: c.id, disciplineId: discipline.Id, event: `${body.DisciplineName}${course}`, rawCopyId: fetched.rawCopyId },
              body,
            );
            continue;
          }
          for (const [personId, { heat, r }] of lastSwims(body)) {
            const status = statusOf(r);
            if (!status) continue;
            await run.rows.result({
              competitionId,
              person: person(r),
              event: `${body.DisciplineName}${course}`,
              sport: sportName,
              date: heat.Date,
              place: status === "finished" ? r.Rank : null,
              status,
              performance: status === "finished" ? r.Time : null,
              sourceRef: `${c.id}/${discipline.Id}/${personId}`,
              rawCopyId: fetched.rawCopyId,
            });
          }
        }
      }
    }
  },
};

type TeamContext = { competitionId: string; sport: string; competitionRef: number; disciplineId: string; event: string; rawCopyId: string };

/**
 * Each Belgian Team's last swim or routine in the discipline (a final over a
 * heat), with everyone it credits across rounds as the roster: relay swimmers
 * by World Aquatics person ID, artistic swimmers and divers by GMS ID (their
 * rows carry no person ID). Reserves are left out.
 */
async function teamResults(run: SourceRun, ctx: TeamContext, body: DisciplineResults) {
  const teams = new Map<string, { heat: DisciplineResults["Heats"][number]; r: SwimResult; roster: Map<string, Person> }>();
  for (const heat of body.Heats) {
    if (heat.IsSummary) continue;
    for (const r of heat.Results) {
      if (r.NAT !== "BEL") continue;
      const members = teamMembers(r);
      // A relay is one Team whatever its swimmers; a duet or synchro pair is told apart by its members.
      const key = r.SubResults ? "relay" : members.map((m) => m.ifId.value).toSorted().join("+");
      const seen = teams.get(key);
      const roster = seen?.roster ?? new Map<string, Person>();
      for (const m of statusOf(r) ? members : []) roster.set(m.ifId.value, m);
      if (!seen || heat.UtcDateTime > seen.heat.UtcDateTime) teams.set(key, { heat, r, roster });
    }
  }
  for (const [key, { heat, r, roster }] of teams) {
    const status = statusOf(r);
    if (!status || roster.size === 0) continue;
    await run.rows.teamResult({
      competitionId: ctx.competitionId,
      sport: ctx.sport,
      nationality: "BEL",
      event: ctx.event,
      // Technical and free routines are one event for the Team: the duet stays the same partnership.
      teamEvent: ctx.event.replace(/ (Technical|Free|Acrobatic)\b/, ""),
      date: heat.Date,
      place: status === "finished" ? r.Rank : null,
      status,
      performance: status === "finished" ? (r.Time ?? r.TotalPoints ?? null) : null,
      sourceRef: `${ctx.competitionRef}/${ctx.disciplineId}/BEL/${key}`,
      rawCopyId: ctx.rawCopyId,
      roster: [...roster.values()],
    });
  }
}

function teamMembers(r: SwimResult): Person[] {
  if (r.SubResults) return r.SubResults.filter((m) => m.NAT === "BEL").map(person);
  return (r.Competitors ?? [])
    .filter((m) => m.NAT === "BEL" && !m.Reserve)
    .map((m) => ({
      name: `${m.FirstName} ${m.LastName}`,
      dateOfBirth: null,
      nationality: m.NAT,
      ifId: { scheme: "world-aquatics-gms", value: m.GmsId },
    }));
}

async function competitions(run: SourceRun, from: string, to: string) {
  return competitionList(run, addDays(from, -LIST_LEAD_DAYS), to);
}

/** The World Aquatics competitions held between two dates. */
export async function competitionList(run: SourceRun, from: string, to: string) {
  const url = `${API}/competitions?pageSize=100&venueDateFrom=${from}T00:00:00%2B00:00&venueDateTo=${to}T23:59:59%2B00:00&group=FINA&sort=dateFrom,asc`;
  const fetched = await run.fetch(url);
  const body = JSON.parse(fetched.text) as { content: Competition[] };
  return body.content.map((c) => ({ ...c, rawCopyId: fetched.rawCopyId }));
}

/**
 * A listed competition as competition rows, one per Olympic sport held there
 * (shared with the timetable source, which writes as this one). A list entry
 * without disciplines is taken from its type ("Diving World Cup").
 */
export function competitionInputs(c: Competition & { rawCopyId: string }, kind: CompetitionKind): (CompetitionInput & { code: string })[] {
  const city = c.location?.city || null;
  const codes = c.disciplines ?? Object.keys(SPORT_OF_CODE).filter((code) => typeOf(code).test(c.competitionType.name));
  return codes
    .filter((code) => SPORT_OF_CODE[code])
    .map((code) => ({
      code,
      // World Cup legs share one name; the city tells them apart.
      name: c.series.length > 0 && city ? `${c.name}, ${city}` : c.name,
      sport: SPORT_OF_CODE[code],
      kind,
      startDate: c.venueDateFrom.slice(0, 10),
      endDate: c.venueDateTo.slice(0, 10),
      city,
      country: c.location?.countryCode || null,
      venueZone: null,
      sourceRef: `${c.id}/${code}`,
      series: seriesOf(c, code),
      rawCopyId: c.rawCopyId,
    }));
}

function typeOf(code: string): RegExp {
  return { SW: /swimming/i, DV: /diving/i, SY: /artistic/i, OW: /open water/i, WP: /water polo/i }[code] ?? /$^/;
}

/**
 * The recurring competition (GLOSSARY "Participation": previous edition): the
 * Worlds per course and sport, a World Cup leg per sport and city, the Games.
 */
function seriesOf(c: Competition, code: string): string | null {
  const type = c.competitionType.name;
  const sport = SPORT_OF_CODE[code].toLowerCase().replace(/ /g, "-");
  if (/^Olympic Games/i.test(type)) return "olympic-games";
  if (/Championships/i.test(type)) return `world-aquatics:world-championships${/25m/.test(type) ? "-25m" : ""}:${sport}`;
  const city = c.location?.city;
  if (/World Cup/i.test(type) && city) return `world-aquatics:world-cup:${sport}:${city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return null;
}

/** The Games, the World Championships (long and short course) and the World Cups; not Grand Prix, youth or masters events. */
export function competitionKind(type: string): CompetitionKind | null {
  if (/youth|junior|masters/i.test(type)) return null;
  if (/^Olympic Games/i.test(type)) return "games";
  // The long-course Worlds are typed plain "World Championships".
  if (/^World (Aquatics |Swimming )?Championships/i.test(type)) return "championship";
  if (/^(Swimming|Diving|Open Water Swimming|Artistic Swimming) World Cup$/i.test(type)) return "circuit";
  return null;
}

/** Each Belgian's latest swim in the discipline (a final over a heat); the summary rows repeat the heats. */
function lastSwims(body: DisciplineResults) {
  const latest = new Map<string, { heat: DisciplineResults["Heats"][number]; r: SwimResult }>();
  for (const heat of body.Heats) {
    if (heat.IsSummary) continue;
    for (const r of heat.Results) {
      if (r.NAT !== "BEL") continue;
      const seen = latest.get(r.PersonId);
      if (!seen || heat.UtcDateTime > seen.heat.UtcDateTime) latest.set(r.PersonId, { heat, r });
    }
  }
  return latest;
}

function statusOf(r: SwimResult): ResultStatus | null {
  if (r.ScoringAbbr === "DNS") return null;
  if (r.ScoringAbbr === "DSQ" || r.ScoringAbbr === "DQ") return "DSQ";
  if (r.ScoringAbbr === "DNF") return "DNF";
  return r.Rank === null && r.Time === null && !r.TotalPoints ? null : "finished";
}

function person(r: { PersonId: string; FirstName: string; LastName: string; NAT: string }): Person {
  return {
    name: `${r.FirstName} ${r.LastName}`,
    dateOfBirth: null,
    nationality: r.NAT,
    ifId: { scheme: "world-aquatics", value: r.PersonId },
  };
}

function isoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
