// World Archery Championship schedules (spec #20, story 62; ticket #39;
// research/session-schedules), from the documented SCHEDULE endpoint of its
// public API (api.worldarchery.org/v3/API/Schedule): timed blocks, each
// naming the categories and phases shot in it. It writes as the World
// Archery results source, so the schedule lands on the same competition.
//
// One run:
// 1. the outdoor competitions of the next 400 days: one request;
// 2. for each senior World or European Championships not over yet, its
//    schedule: one request. (On 14 Nov 2026 the endpoint answered an empty
//    list for every competition probed; it is stored as soon as it fills.)
// Senior recurve and compound categories only, named as the results source
// names them. A phase shot over several blocks (1/48 eliminations) is one
// round, from its first block. Times are the venue's clock (the offset in
// each start); the zone comes from the host country, else from that offset.
import { venueZoneOf } from "~/domain";
import type { SourceAdapter, TimetableRoundInput } from "../source-adapter";
import { addDays, isoDate } from "./dates";
import { API, competitionInput, competitionKind, competitionList, ENTRY_LIST_SUBLEVELS, EVENT_BY_CATEGORY, TEAM_EVENT_BY_CATEGORY } from "./world-archery";

const HORIZON_DAYS = 400;
const QUALIFICATION_ROUND = -10;

type ScheduleBlock = {
  /** Venue clock with its offset, "2017-05-17T09:00:00+08:00". */
  DTStart: string;
  DTEnd: string;
  C: { Cat: string; Team: boolean; Phase: string | number }[];
};

export const worldArcheryTimetables: SourceAdapter = {
  writesAs: "world-archery",
  async run(run) {
    const today = isoDate(run.now);
    const listed = await competitionList(run, today, addDays(today, HORIZON_DAYS));
    for (const c of listed.competitions) {
      if (competitionKind(c.ComLevel, c.Name) !== "championship" || c.IsCancelled || c.DTo < today || !ENTRY_LIST_SUBLEVELS.has(c.ComSubLevel)) continue;
      const input = competitionInput(c, "championship", listed.rawCopyId);
      const competitionId = await run.rows.competition(input);
      const url = `${API}/SCHEDULE/?CompId=${c.ID}&RBP=All`;
      const fetched = await run.fetch(url);
      const blocks = (JSON.parse(fetched.text) as { items: ScheduleBlock[] }).items;
      await run.rows.timetable({
        competitionId,
        version: null,
        publishedOn: null,
        sourceUrl: url,
        venueZone: venueZoneOf(input.country, input.city) ?? zoneOfOffset(blocks[0]?.DTStart ?? ""),
        rounds: rounds(blocks),
        rawCopyId: fetched.rawCopyId,
      });
    }
  },
};

function rounds(blocks: ScheduleBlock[]): TimetableRoundInput[] {
  const byRound = new Map<string, TimetableRoundInput>();
  for (const block of [...blocks].sort((a, b) => a.DTStart.localeCompare(b.DTStart))) {
    for (const c of block.C) {
      const event = (c.Team ? TEAM_EVENT_BY_CATEGORY : EVENT_BY_CATEGORY)[c.Cat];
      if (!event) continue;
      const round = phaseName(Number(c.Phase));
      const key = `${event}\n${round}`;
      if (byRound.has(key)) continue;
      byRound.set(key, { date: block.DTStart.slice(0, 10), start: block.DTStart.slice(11, 16), end: block.DTEnd.slice(11, 16) || null, session: null, event, round });
    }
  }
  return [...byRound.values()];
}

/** World Archery phase codes: the qualification round, then 1/n eliminations down to the medal matches. */
function phaseName(phase: number): string {
  if (phase === QUALIFICATION_ROUND) return "Qualification round";
  if (phase === 0) return "Gold medal match";
  if (phase === 1) return "Bronze medal match";
  if (phase === 2) return "Semifinal";
  if (phase === 4) return "Quarterfinal";
  return `1/${phase} elimination`;
}

/** "…T09:00:00-05:00" → "Etc/GMT+5" (IANA's Etc zones count the other way); half hours have no Etc zone. */
function zoneOfOffset(start: string): string | null {
  const m = start.match(/([+-])(\d{2}):00$/);
  if (!m) return null;
  const hours = Number(m[2]);
  return hours === 0 ? "UTC" : `Etc/GMT${m[1] === "+" ? "-" : "+"}${hours}`;
}
