// World Athletics Championship timetables (spec #20, story 62; ticket #39;
// research/session-schedules), from the timetable page of worldathletics.org
// (its `__NEXT_DATA__`): every event round with its start time, published
// about 13 months ahead. It writes as the World Athletics results source, so
// the timetable lands on the same competition.
//
// One run:
// 1. the OW calendar (the Worlds, indoor and outdoor) from today to 400 days
//    ahead: one request;
// 2. for each Championship not over yet, its timetable page: one request.
// Times are the venue's clock (the page labels them UTC, but they are not:
// the marathon starts at "07:00"); the zone comes from the host country.
// Qualification in groups A and B is one round, from group A's start.
// Combined events are one event whose rounds are their disciplines.
import { venueZoneOf } from "~/domain";
import type { SourceAdapter, TimetableRoundInput } from "../source-adapter";
import { addDays, isoDate } from "./dates";
import { type CalendarEvent, categoryCalendar, competitionInput, competitionKind, nextData, SITE, venueOf } from "./world-athletics";

const HORIZON_DAYS = 400;
const SEX: Record<string, string> = { M: "Men's", W: "Women's", X: "Mixed" };
const COMBINED = /^(Decathlon|Heptathlon|Pentathlon)$/;

type Phase = {
  phaseName: string;
  /** Venue-local, despite the Z. */
  phaseDateAndTime: string;
  sexCode: string;
  discipline: { name: string };
};

export const worldAthleticsTimetables: SourceAdapter = {
  writesAs: "world-athletics",
  async run(run) {
    const today = isoDate(run.now);
    for (const c of await categoryCalendar(run, "OW", today, addDays(today, HORIZON_DAYS))) {
      if (competitionKind(c) !== "championship" || c.endDate < today || !c.wasUrl) continue;
      const competitionId = await run.rows.competition(competitionInput(c, "championship"));
      const url = `${SITE}${timetablePath(c)}`;
      const fetched = await run.fetch(url);
      const phases = nextData<{ eventTimetable: Phase[] | null }>(fetched.text).eventTimetable ?? [];
      const venue = venueOf(c);
      await run.rows.timetable({
        competitionId,
        version: null,
        publishedOn: null,
        sourceUrl: url,
        venueZone: venueZoneOf(venue.country, venue.city),
        rounds: rounds(phases),
        rawCopyId: fetched.rawCopyId,
      });
    }
  },
};

function timetablePath(c: CalendarEvent): string {
  return `${c.wasUrl!.replace(/\/timetable$/, "")}/timetable`;
}

/** One round per event and phase, in time order (the earliest group's start). */
function rounds(phases: Phase[]): TimetableRoundInput[] {
  const byRound = new Map<string, TimetableRoundInput>();
  for (const p of [...phases].sort((a, b) => a.phaseDateAndTime.localeCompare(b.phaseDateAndTime))) {
    const sex = SEX[p.sexCode] ?? "";
    const combined = COMBINED.test(p.phaseName);
    const event = `${sex} ${combined ? p.phaseName : p.discipline.name}`.trim();
    const round = combined ? p.discipline.name : p.phaseName;
    const key = `${event}\n${round}`;
    if (byRound.has(key)) continue;
    byRound.set(key, { date: p.phaseDateAndTime.slice(0, 10), start: p.phaseDateAndTime.slice(11, 16), end: null, session: null, event, round });
  }
  return [...byRound.values()];
}
