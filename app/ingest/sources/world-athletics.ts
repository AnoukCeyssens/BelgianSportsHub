// World Athletics through the JSON its own site renders into each page
// (`__NEXT_DATA__` on worldathletics.org; research/summer-sport-sources). The
// GraphQL backend behind it needs a POST with the site's key, so the adapter
// reads the server-rendered pages instead: plain GETs, no contract.
//
// One run:
// 1. the calendar of each top ranking category (OW, DF, GW, GL) for the
//    competitions ending since the last run (a year back on the first run)
//    up to two weeks ahead: four requests;
// 2. for each Championship, the Games or the named top series (Diamond League,
//    Combined Events Tour Gold) that has results: the results page of every
//    day since the last run; Belgian rows only.
// Any sanctioned meet counts towards the standards, but only the
// Championships and the named top series are ingested (spec #20, story 95);
// the rest arrives through the world rankings. A relay is Belgium's relay
// Team for the event (ADR 0001): its result is the final it ran, or the round
// it went out in, and its roster everyone the day's races credit (heats-only
// runners included).
// Entry lists are not published in structured form, so there is no Upcoming.
import type { CompetitionKind, Person, ResultStatus, SourceAdapter, SourceRun } from "../source-adapter";

const SITE = "https://worldathletics.org";
const SPORT = "Athletics";
const FIRST_RUN_LOOKBACK_DAYS = 365;
const CALENDAR_HORIZON_DAYS = 14;

/** The calendar's ranking categories that hold the Games, the Championships and the top series. */
const TOP_CATEGORIES = { OW: 4, DF: 11, GW: 5, GL: 6 } as const;
const TOP = new Set<string>(Object.keys(TOP_CATEGORIES));

type CalendarEvent = {
  id: number;
  name: string;
  venue: string;
  rankingCategory: string;
  competitionGroup: string | null;
  startDate: string;
  endDate: string;
  hasApiResults: boolean;
};

type ResultsPage = {
  eventTitles: {
    /** The level of this group of events; a meeting also stages lower-level and youth events. */
    rankingCategory: string;
    events: {
      event: string;
      eventId: number;
      isRelay: boolean;
      races: { race: string; results: RaceResult[] }[];
    }[];
  }[];
};

type RaceResult = {
  competitor: {
    id: string;
    name: string;
    urlSlug: string | null;
    birthDate: string | null;
    /** A relay team's runners in that race. */
    teamMembers?: { id: number; name: string; urlSlug: string | null }[] | null;
  };
  mark: string;
  nationality: string;
  /** "1.", or "" when unplaced. */
  place: string;
  /** "Q" or "q" when through to the next round. */
  qualified: string | null;
};

export const worldAthletics: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    const horizon = addDays(today, CALENDAR_HORIZON_DAYS);

    for (const c of await calendar(run, windowStart, horizon)) {
      const kind = competitionKind(c);
      if (!kind || c.endDate < windowStart) continue;
      const venue = c.venue.match(/(?:^|, )([^,]+) \(([A-Z]{3})\)$/);
      const competitionId = await run.rows.competition({
        name: c.name,
        sport: SPORT,
        kind,
        startDate: c.startDate,
        endDate: c.endDate,
        city: venue?.[1] ?? null,
        country: venue?.[2] ?? null,
        venueZone: null,
        sourceRef: String(c.id),
        rawCopyId: c.rawCopyId,
      });
      if (!c.hasApiResults) continue;

      // Days already read on an earlier run are not read again.
      for (let day = 1, date = c.startDate; date <= c.endDate && date <= today; day++, date = addDays(date, 1)) {
        if (date < windowStart) continue;
        const fetched = await run.fetch(`${SITE}/competition/calendar-results/results/${c.id}?day=${day}`);
        const page = nextData<{ calendarEventsResults: ResultsPage }>(fetched.text).calendarEventsResults;
        for (const group of page.eventTitles) {
          if (!TOP.has(group.rankingCategory)) continue;
          for (const e of group.events) {
            if (e.isRelay) {
              await relay(run, { competitionId, calendarId: c.id, date, rawCopyId: fetched.rawCopyId }, e);
              continue;
            }
            for (const race of e.races) {
              for (const r of race.results) {
                const p = person(r);
                const status = statusOf(race.race, r);
                if (!p || !status || p.nationality !== "BEL") continue;
                await run.rows.result({
                  competitionId,
                  person: p,
                  event: e.event,
                  date,
                  place: status === "finished" ? placeOf(r.place) : null,
                  status,
                  performance: /^[0-9]/.test(r.mark) ? r.mark : null,
                  // Later rounds of the same event overwrite earlier ones.
                  sourceRef: `${c.id}/${e.eventId}/${p.ifId.value}`,
                  rawCopyId: fetched.rawCopyId,
                });
              }
            }
          }
        }
      }
    }
  },
};

type RelayContext = { competitionId: string; calendarId: number; date: string; rawCopyId: string };

/**
 * Belgium's relay in one event on one day: the final it ran, otherwise the
 * round it ran (a relay round does not say who went through, so it stays
 * "eliminated" without a place until the final overwrites it). Everyone a
 * race credits is on the roster.
 */
async function relay(run: SourceRun, ctx: RelayContext, e: ResultsPage["eventTitles"][number]["events"][number]) {
  const ran = e.races.flatMap((race) =>
    race.results.filter((r) => r.nationality === "BEL" && r.mark !== "DNS").map((r) => ({ race: race.race, r })),
  );
  if (ran.length === 0) return;
  const { race, r } = ran.find((x) => /^Final\b/.test(x.race)) ?? ran[ran.length - 1];
  const status = relayStatus(race, r);
  const roster = new Map<string, Person>();
  for (const { r: row } of ran) {
    for (const m of row.competitor.teamMembers ?? []) {
      const p = person({ ...row, competitor: { id: String(m.id), name: m.name, urlSlug: m.urlSlug, birthDate: null } });
      if (p) roster.set(p.ifId.value, p);
    }
  }
  await run.rows.teamResult({
    competitionId: ctx.competitionId,
    nationality: "BEL",
    event: e.event,
    date: ctx.date,
    place: status === "finished" ? placeOf(r.place) : null,
    status,
    performance: /^[0-9]/.test(r.mark) ? r.mark : null,
    // Later rounds of the same event overwrite earlier ones.
    sourceRef: `${ctx.calendarId}/${e.eventId}/BEL`,
    rawCopyId: ctx.rawCopyId,
    roster: [...roster.values()],
  });
}

function relayStatus(race: string, r: RaceResult): ResultStatus {
  if (r.mark === "DNF") return "DNF";
  if (r.mark === "DQ" || r.mark === "DSQ") return "DSQ";
  return /^Final\b/.test(race) ? "finished" : "eliminated";
}

async function calendar(run: SourceRun, from: string, to: string) {
  const all: (CalendarEvent & { rawCopyId: string })[] = [];
  for (const id of Object.values(TOP_CATEGORIES)) {
    const fetched = await run.fetch(`${SITE}/competition/calendar-results?startDate=${from}&endDate=${to}&rankingCategoryId=${id}`);
    const events = nextData<{ initialEvents: { results: CalendarEvent[] } }>(fetched.text).initialEvents.results;
    all.push(...events.map((e) => ({ ...e, rawCopyId: fetched.rawCopyId })));
  }
  return all;
}

/**
 * OW: the Games and the Worlds. DF: the Diamond League Final. GW and GL hold
 * the other Championships (World Series, area Championships) and the named
 * top series, next to label road races and cross-country tours, which are
 * left out.
 */
function competitionKind(c: CalendarEvent): CompetitionKind | null {
  const group = c.competitionGroup ?? "";
  if (c.rankingCategory === "OW") return /Olympic Games/i.test(c.name) ? "games" : "championship";
  if (c.rankingCategory === "DF" || group.includes("Diamond League")) return "circuit";
  if (c.rankingCategory === "GW" && group.includes("Championships")) return "championship";
  if (c.rankingCategory === "GL" && /Area Senior (Outdoor|Indoor) Championships/.test(group)) return "championship";
  if (c.rankingCategory === "GL" && group.includes("Combined Events Tour – Gold")) return "circuit";
  return null;
}

/** A Belgian's place counts once they are out or the event is over; a round they went through is not their result. */
function statusOf(race: string, r: RaceResult): ResultStatus | null {
  if (r.qualified) return null;
  if (r.mark === "DNS") return null;
  if (r.mark === "DNF") return "DNF";
  if (r.mark === "DQ" || r.mark === "DSQ") return "DSQ";
  return /^Final\b/.test(race) ? "finished" : "eliminated";
}

function placeOf(place: string): number | null {
  const n = Number.parseInt(place, 10);
  return Number.isNaN(n) ? null : n;
}

/** The World Athletics athlete ID is the number that ends the profile slug, e.g. "belgium/nafissatou-thiam-14428253". */
function person(r: RaceResult): Person | null {
  const id = r.competitor.urlSlug?.match(/-(\d+)$/)?.[1] ?? (/^\d+$/.test(r.competitor.id) ? r.competitor.id : null);
  if (!id) return null;
  return {
    name: r.competitor.name,
    dateOfBirth: dateOfBirth(r.competitor.birthDate),
    nationality: r.nationality,
    ifId: { scheme: "world-athletics", value: id },
  };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "19 AUG 1994" → "1994-08-19"; a bare year is no date of birth. */
function dateOfBirth(text: string | null): string | null {
  const m = text?.match(/^(\d{2}) ([A-Z]{3}) (\d{4})$/);
  if (!m || !MONTHS.includes(m[2])) return null;
  return `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1]}`;
}

function nextData<T>(html: string): T {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("World Athletics page without __NEXT_DATA__ (format changed?)");
  return (JSON.parse(m[1]) as { props: { pageProps: T } }).props.pageProps;
}

function isoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
