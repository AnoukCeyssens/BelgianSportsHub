// World Aquatics through the undocumented JSON backend of its own site
// (api.worldaquatics.com/fina; research/summer-sport-sources). Anonymous GETs,
// no contract.
//
// One run:
// 1. the World Aquatics competitions ending since the last run (a year back
//    on the first run) up to two weeks ahead: one request;
// 2. for each Championship, the Games or World Cup leg that has started: its
//    disciplines, then the results of each individual discipline whose every
//    heat is official; Belgian rows only.
// Swim times count from any sanctioned meet, but only the Championships and
// the named top series are ingested (spec #20, story 95). European
// Championships are run by European Aquatics, not here. Relays, synchronised
// diving, duets and teams wait for Teams (#27). No structured entry lists, so
// there is no Upcoming.
import type { CompetitionKind, Person, ResultStatus, SourceAdapter, SourceRun } from "../source-adapter";

const API = "https://api.worldaquatics.com/fina";
const SPORT = "Aquatics";
const FIRST_RUN_LOOKBACK_DAYS = 365;
/** The list is asked from this many days before the window, so a competition that started earlier but is still running comes along. */
const LIST_LEAD_DAYS = 14;
/** Competitions starting within this many days are listed already, for the calendar. */
const CALENDAR_HORIZON_DAYS = 14;

type Competition = {
  id: number;
  name: string;
  venueDateFrom: string;
  venueDateTo: string;
  location: { countryCode: string | null; city: string | null };
  competitionType: { name: string };
  series: unknown[];
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
  FirstName: string;
  LastName: string;
  NAT: string;
  /** The overall place in the discipline, the same in every round the athlete swam. */
  Rank: number | null;
  Time: string | null;
  /** "DNS", "DSQ", "DNF" when there is no result. */
  ScoringAbbr?: string | null;
};

/** Individual sport disciplines only: relays and pairs or teams wait for Teams (#27). */
const TEAM_EVENT = /relay|synchro|duet|team/i;

export const worldAquatics: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);

    for (const c of await competitions(run, windowStart, addDays(today, CALENDAR_HORIZON_DAYS))) {
      const kind = competitionKind(c.competitionType.name);
      const startDate = c.venueDateFrom.slice(0, 10);
      const endDate = c.venueDateTo.slice(0, 10);
      if (!kind || endDate < windowStart) continue;
      const city = c.location.city || null;
      const competitionId = await run.rows.competition({
        // World Cup legs share one name; the city tells them apart.
        name: c.series.length > 0 && city ? `${c.name}, ${city}` : c.name,
        sport: SPORT,
        kind,
        startDate,
        endDate,
        city,
        country: c.location.countryCode || null,
        venueZone: null,
        sourceRef: String(c.id),
        rawCopyId: c.rawCopyId,
      });
      if (startDate > today) continue;

      const listed = await run.fetch(`${API}/competitions/${c.id}/events`);
      const events = JSON.parse(listed.text) as Events;
      const course = events.PoolConfiguration === "25m" ? " (25m)" : "";
      for (const discipline of events.Sports.flatMap((s) => s.DisciplineList)) {
        if (TEAM_EVENT.test(discipline.DisciplineName)) continue;
        if (discipline.HeatList.length === 0 || discipline.HeatList.some((h) => h.ResultStatus !== "OFFICIAL")) continue;
        const fetched = await run.fetch(`${API}/events/${discipline.Id}`);
        const body = JSON.parse(fetched.text) as DisciplineResults;
        for (const [personId, { heat, r }] of lastSwims(body)) {
          const status = statusOf(r);
          if (!status) continue;
          await run.rows.result({
            competitionId,
            person: person(r),
            event: `${body.DisciplineName}${course}`,
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
  },
};

async function competitions(run: SourceRun, from: string, to: string) {
  const url =
    `${API}/competitions?pageSize=100&venueDateFrom=${addDays(from, -LIST_LEAD_DAYS)}T00:00:00%2B00:00` +
    `&venueDateTo=${to}T23:59:59%2B00:00&group=FINA&sort=dateFrom,asc`;
  const fetched = await run.fetch(url);
  const body = JSON.parse(fetched.text) as { content: Competition[] };
  return body.content.map((c) => ({ ...c, rawCopyId: fetched.rawCopyId }));
}

/** The Games, the World Championships (long and short course) and the World Cups; not Grand Prix, youth or masters events. */
function competitionKind(type: string): CompetitionKind | null {
  if (/youth|junior|masters/i.test(type)) return null;
  if (/^Olympic Games/i.test(type)) return "games";
  if (/^World (Aquatics|Swimming) Championships/i.test(type)) return "championship";
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
  return r.Rank === null && r.Time === null ? null : "finished";
}

function person(r: SwimResult): Person {
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
