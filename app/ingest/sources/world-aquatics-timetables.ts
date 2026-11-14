// World Aquatics Championship schedules (spec #20, story 62; ticket #39;
// research/session-schedules), from the undocumented JSON backend of its site
// (`fina/competitions/{id}/schedule`): one row per event phase with the
// venue's date and time, published about 7 months ahead. It writes as the
// World Aquatics results source, so the schedule lands on the same
// competition.
//
// One run:
// 1. the World Aquatics competitions of the next 400 days: one request;
// 2. for each World Championships (long or short course) not over yet, its
//    schedule: one request.
// Short-course events carry "(25m)" as the results source names them. A phase
// split over two sessions (the slowest heat of a timed final in the morning)
// is one round, from its first start. The zone comes from the host country,
// else from the offset the schedule states.
import { venueZoneOf } from "~/domain";
import type { SourceAdapter, TimetableRoundInput } from "../source-adapter";
import { addDays, isoDate } from "./dates";
import { API, competitionInputs, competitionKind, competitionList } from "./world-aquatics";

const HORIZON_DAYS = 400;
const ROUND: Record<string, string> = { Finals: "Final", Semifinals: "Semifinal" };

type ScheduledPhase = {
  /** Venue-local. */
  Date: string;
  Time: string | null;
  DisciplineName: string;
  PhaseName: string;
  /** The sport's discipline code ("SW", "DV", …). */
  SportCode?: string;
  /** The venue's UTC offset, "08:00:00". */
  TimeZone: string | null;
};

export const worldAquaticsTimetables: SourceAdapter = {
  writesAs: "world-aquatics",
  async run(run) {
    const today = isoDate(run.now);
    for (const c of await competitionList(run, today, addDays(today, HORIZON_DAYS))) {
      if (competitionKind(c.competitionType.name) !== "championship") continue;
      const inputs = competitionInputs(c, "championship");
      if (inputs.length === 0 || inputs[0].endDate < today) continue;
      const competitionIds = new Map<string, string>();
      for (const { code, ...input } of inputs) competitionIds.set(code, await run.rows.competition(input));
      const url = `${API}/competitions/${c.id}/schedule`;
      const fetched = await run.fetch(url);
      const phases = JSON.parse(fetched.text) as ScheduledPhase[];
      const course = /\(25m\)/.test(c.competitionType.name) ? " (25m)" : "";
      // Each sport's rounds go to its own competition row.
      for (const input of inputs) {
        const own = phases.filter((p) => (p.SportCode ?? input.code) === input.code);
        await run.rows.timetable({
          competitionId: competitionIds.get(input.code)!,
          version: null,
          publishedOn: null,
          sourceUrl: url,
          venueZone: venueZoneOf(input.country, input.city) ?? zoneOfOffset(phases[0]?.TimeZone ?? null),
          rounds: rounds(own, course),
          rawCopyId: fetched.rawCopyId,
        });
      }
    }
  },
};

function rounds(phases: ScheduledPhase[], course: string): TimetableRoundInput[] {
  const byRound = new Map<string, TimetableRoundInput>();
  const ordered = [...phases].sort((a, b) => `${a.Date}T${a.Time}`.localeCompare(`${b.Date}T${b.Time}`));
  for (const p of ordered) {
    const event = `${p.DisciplineName}${course}`;
    const round = ROUND[p.PhaseName] ?? p.PhaseName;
    const key = `${event}\n${round}`;
    if (byRound.has(key)) continue;
    byRound.set(key, { date: p.Date.slice(0, 10), start: p.Time ? p.Time.slice(0, 5) : null, end: null, session: null, event, round });
  }
  return [...byRound.values()];
}

/** "08:00:00" → "Etc/GMT-8" (IANA's Etc zones count the other way); half hours have no Etc zone. */
function zoneOfOffset(offset: string | null): string | null {
  const m = offset?.match(/^(-)?(\d{1,2}):00(?::00)?$/);
  if (!m) return null;
  const hours = Number(m[2]);
  if (hours === 0) return "UTC";
  return `Etc/GMT${m[1] ? "+" : "-"}${hours}`;
}
