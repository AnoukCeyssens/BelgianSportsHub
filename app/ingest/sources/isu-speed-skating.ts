// ISU speed skating through the open ISU Results API (api.isuresults.eu;
// research/winter-sport-sources). Anonymous GETs, documented OpenAPI schema.
//
// One run, kept small and polite:
// 1. the senior events ending since the last run (a year back on the first
//    run), upcoming ones included: one request;
// 2. for each qualification-relevant event that has started: its competitions,
//    then the results of each competition that became official since the last
//    run; Belgian rows only;
// 3. for each such event running now or starting within two weeks: its
//    competitors list, as the entry list behind Upcoming.
// Team results (team pursuit, team sprint) go to Belgium's Team for the event,
// with the skaters the result credits as its roster.
import type { CompetitionKind, Person, ResultStatus, SourceAdapter, SourceRun } from "../source-adapter";

const API = "https://api.isuresults.eu";
const SPORT = "Speed skating";
const FIRST_RUN_LOOKBACK_DAYS = 365;
const ENTRY_LIST_HORIZON_DAYS = 14;

/**
 * ISU event tags of qualification-relevant senior competitions: the Games,
 * Championships and the World Cup. "national" events (e.g. Olympic trials)
 * and junior events are left out.
 */
const KIND_BY_TAG: [tag: string, kind: CompetitionKind][] = [
  ["olympic", "games"],
  ["world", "championship"],
  ["european", "championship"],
  ["four-continents", "championship"],
  ["world-cup", "circuit"],
  ["final", "circuit"],
];

type IsuSkater = { id: number; firstName: string; lastName: string; country: string; dateOfBirth: string | null };
type IsuEvent = {
  isuId: string;
  name: string;
  start: string;
  end: string;
  tags: string[];
  isCancelled: boolean;
  track: { city: string; country: string; timeZone: string } | null;
};
type Page<T> = { next: string | null; results: T[] };
type IsuCompetition = {
  scheduleNumber: number;
  title: string;
  start: string;
  isOfficial: boolean;
  lastUpdate: string | null;
  resultsUrl: string;
};
type IsuResult = {
  id: number;
  type: "ind" | "ms" | "team";
  /** Individual results. */
  competitor?: { skater?: IsuSkater };
  /** Team results. */
  team?: IsuTeam;
  rank: number | null;
  status: number | null;
  time: string | null;
  sprintPoints?: number | null;
};
type IsuCompetitor = { skater?: IsuSkater };
type IsuTeam = { country: string; members: { member: { skater?: IsuSkater } }[] };

/** ISU result status codes; DNS (4) and Withdrawn (5) are not performances. */
const STATUS: Record<number, ResultStatus | null> = { 0: "finished", 1: "eliminated", 2: "DNF", 3: "DSQ", 4: null, 5: null };

export const isuSpeedSkating: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);

    for (const event of await events(run, windowStart)) {
      const kind = competitionKind(event);
      if (!kind || event.isCancelled) continue;
      const competitionId = await run.rows.competition({
        name: event.name,
        sport: SPORT,
        kind,
        startDate: event.start,
        endDate: event.end,
        city: event.track?.city ?? null,
        country: event.track?.country ?? null,
        venueZone: event.track?.timeZone ?? null,
        sourceRef: event.isuId,
        series: series(event, kind),
        rawCopyId: event.rawCopyId,
      });

      if (event.start <= today) await results(run, event, competitionId);
      if (event.end >= today && event.start <= addDays(today, ENTRY_LIST_HORIZON_DAYS)) {
        const competitors = await run.fetch(`${API}/events/${event.isuId}/competitors/`);
        const people = (JSON.parse(competitors.text) as IsuCompetitor[]).flatMap((c) => (c.skater ? [person(c.skater)] : []));
        await run.rows.entrants(competitionId, people.filter(isBelgian), competitors.rawCopyId);
      }
    }
  },
};

async function events(run: SourceRun, endGte: string) {
  const all: (IsuEvent & { rawCopyId: string })[] = [];
  let url: string | null = `${API}/events/?category=senior&endGte=${endGte}&pageSize=200`;
  while (url) {
    const page = await run.fetch(url);
    const body = JSON.parse(page.text) as Page<IsuEvent>;
    all.push(...body.results.map((e) => ({ ...e, rawCopyId: page.rawCopyId })));
    url = body.next;
  }
  return all;
}

async function results(run: SourceRun, event: IsuEvent, competitionId: string) {
  const list = await run.fetch(`${API}/events/${event.isuId}/competitions/`);
  const competitions = JSON.parse(list.text) as IsuCompetition[];
  for (const c of competitions) {
    if (!c.isOfficial) continue;
    if (run.since && c.lastUpdate && Date.parse(c.lastUpdate) < run.since.getTime()) continue;
    const fetched = await run.fetch(`${API}/events/${event.isuId}/competitions/${c.scheduleNumber}/results/`);
    const date = event.track ? isoDate(new Date(c.start), event.track.timeZone) : c.start.slice(0, 10);
    for (const r of JSON.parse(fetched.text) as IsuResult[]) {
      const status = r.status === null ? "finished" : STATUS[r.status];
      if (!status) continue;
      const common = {
        competitionId,
        event: c.title,
        date,
        place: status === "DNF" || status === "DSQ" ? null : r.rank,
        status,
        performance: performance(r),
        sourceRef: `${event.isuId}/${c.scheduleNumber}/${r.id}`,
        rawCopyId: fetched.rawCopyId,
      };
      if (r.type === "team") {
        if (r.team?.country !== "BEL") continue;
        await run.rows.teamResult({
          ...common,
          nationality: r.team.country,
          // Division B is the same Team: Belgium's team pursuit is one Team whichever division it skates.
          teamEvent: c.title.replace(/ Division [AB]$/, ""),
          roster: r.team.members.flatMap((m) => (m.member.skater ? [person(m.member.skater)] : [])),
        });
        continue;
      }
      const skater = r.competitor?.skater;
      if (!skater) continue;
      const p = person(skater);
      if (!isBelgian(p)) continue;
      await run.rows.result({ ...common, person: p });
    }
  }
}

function competitionKind(event: IsuEvent): CompetitionKind | null {
  if (!event.tags.includes("senior") || event.tags.includes("national") || event.tags.includes("junior")) return null;
  return KIND_BY_TAG.find(([tag]) => event.tags.includes(tag))?.[1] ?? null;
}

/**
 * The Games are one series; a World Cup leg recurs by venue city (sponsor
 * names and leg numbers change every season); a Championship by its name
 * without the ISU and sport words ("ISU Speed Skating European Championships"
 * → "isu:european-championships").
 */
function series(event: IsuEvent, kind: CompetitionKind): string | null {
  if (kind === "games") return "olympic-games";
  if (kind === "circuit") return event.track ? `isu:${event.tags.includes("final") ? "world-cup-final" : "world-cup"}:${slug(event.track.city)}` : null;
  return `isu:${slug(event.name.replace(/\bISU\b|\bSpeed Skating\b/gi, ""))}`;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function person(s: IsuSkater): Person {
  return {
    name: `${s.firstName} ${s.lastName}`,
    dateOfBirth: s.dateOfBirth,
    nationality: s.country,
    ifId: { scheme: "isu", value: String(s.id) },
  };
}

const isBelgian = (p: Person) => p.nationality === "BEL";

/** Mass start is ranked on sprint points first, so they lead when there are any. */
function performance(r: IsuResult): string | null {
  if (r.type === "ms" && r.sprintPoints) return r.time ? `${r.sprintPoints} pts · ${r.time}` : `${r.sprintPoints} pts`;
  return r.time;
}

/** YYYY-MM-DD of an instant in a time zone (UTC by default). */
function isoDate(instant: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
