// Recorded ISU Results API runs (api.isuresults.eu), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import events from "./events.json?raw";
import eventsMeta from "./events.json.meta.json";
import wc1Competitions from "./wc1-competitions.json?raw";
import wc1CompetitionsMeta from "./wc1-competitions.json.meta.json";
import wc1Results7 from "./wc1-results-7.json?raw";
import wc1Results7Meta from "./wc1-results-7.json.meta.json";
import wc1Results8 from "./wc1-results-8.json?raw";
import wc1Results8Meta from "./wc1-results-8.json.meta.json";
import wc1Results12 from "./wc1-results-12.json?raw";
import wc1Results12Meta from "./wc1-results-12.json.meta.json";
import wc1Competitors from "./wc1-competitors.json?raw";
import wc1CompetitorsMeta from "./wc1-competitors.json.meta.json";
import wc2Competitors from "./wc2-competitors.json?raw";
import wc2CompetitorsMeta from "./wc2-competitors.json.meta.json";
import events202601 from "./events-2026-01.json?raw";
import events202601Meta from "./events-2026-01.json.meta.json";
import events202511 from "./events-2025-11.json?raw";
import events202511Meta from "./events-2025-11.json.meta.json";
import wc1At2025Competitions from "./wc1-2025-competitions.json?raw";
import wc1At2025CompetitionsMeta from "./wc1-2025-competitions.json.meta.json";
import wc1At2025Results17 from "./wc1-2025-results-17.json?raw";
import wc1At2025Results17Meta from "./wc1-2025-results-17.json.meta.json";
import wc1At2025Results24 from "./wc1-2025-results-24.json?raw";
import wc1At2025Results24Meta from "./wc1-2025-results-24.json.meta.json";
import events20260227 from "./events-2026-02-27.json?raw";
import events20260227Meta from "./events-2026-02-27.json.meta.json";
import worlds2026Schedule from "./worlds-2026-schedule.json?raw";
import worlds2026ScheduleMeta from "./worlds-2026-schedule.json.meta.json";
import worlds2026Competitors from "./worlds-2026-competitors.json?raw";
import worlds2026CompetitorsMeta from "./worlds-2026-competitors.json.meta.json";
import europeans2027Schedule from "./europeans-2027-schedule.json?raw";
import europeans2027ScheduleMeta from "./europeans-2027-schedule.json.meta.json";
import worlds2027Schedule from "./worlds-2027-schedule.json?raw";
import worlds2027ScheduleMeta from "./worlds-2027-schedule.json.meta.json";

/**
 * The daily run on Saturday 14 Nov 2026 around 12:00 UTC, during World Cup #1
 * (Beijing, 13–15 Nov), after a successful run on 13 Nov at 08:00 UTC:
 * - the senior events ending on or after 12 Nov (World Cup #1 to the 2027 Worlds);
 * - World Cup #1's competitions (trimmed): 3 official before the last run,
 *   7, 8 and 12 official since, 16 live, 28 not yet skated;
 * - results of 7 (Fran Vanhoutte 17th in the 1000m Women), 8 (no Belgian) and
 *   12 (Indra Medard 18th in the 1500m Men Division B);
 * - competitors of World Cup #1 (trimmed; Medard, Bart Swings, Vanhoutte) and
 *   of World Cup #2 (Tokyo, from 20 Nov; none published yet);
 * - the schedules of the 2027 Europeans and Worlds (none published yet).
 */
export const isuWorldCup1Run: RecordedResponse[] = [
  { ...eventsMeta, body: events },
  { ...wc1CompetitionsMeta, body: wc1Competitions },
  { ...wc1Results7Meta, body: wc1Results7 },
  { ...wc1Results8Meta, body: wc1Results8 },
  { ...wc1Results12Meta, body: wc1Results12 },
  { ...wc1CompetitorsMeta, body: wc1Competitors },
  { ...wc2CompetitorsMeta, body: wc2Competitors },
  { ...europeans2027ScheduleMeta, body: europeans2027Schedule },
  { ...worlds2027ScheduleMeta, body: worlds2027Schedule },
];
export const ISU_WORLD_CUP_1_RUN = { now: "2026-11-14T12:00:00.000Z", lastSuccessAt: "2026-11-13T08:00:00.000Z" };

/**
 * The daily run on 6 Jan 2026 after a run on 5 Jan: the events list (trimmed)
 * holds the U.S. Olympic Team Trials (a national event, ended 5 Jan) and the
 * Milano Cortina Olympic Games (from 6 Feb). Nothing else is fetched.
 */
export const isuJanuary2026Run: RecordedResponse[] = [{ ...events202601Meta, body: events202601 }];
export const ISU_JANUARY_2026_RUN = { now: "2026-01-06T04:00:00.000Z", lastSuccessAt: "2026-01-05T04:00:00.000Z" };

/**
 * The daily run on Monday 17 Nov 2025 after a run on 16 Nov at 04:00 UTC,
 * once World Cup #1 (Salt Lake City, 14–16 Nov 2025) had ended:
 * - the senior events ending on or after 15 Nov (trimmed to World Cup #1);
 * - its competitions (trimmed): 16 official before the last run, and the two
 *   team pursuits 17 and 24 skated since;
 * - Team Pursuit Women Division B (trimmed): Belgium 2nd (Fran Vanhoutte,
 *   Isabelle Van Elst, Sandrine Tas), behind Kazakhstan;
 * - Team Pursuit Men (trimmed): Belgium 7th (Bart Swings, Indra Medard,
 *   Mathias Vosté, Daan Van Der Elst), behind the United States.
 */
export const isuTeamPursuitRun: RecordedResponse[] = [
  { ...events202511Meta, body: events202511 },
  { ...wc1At2025CompetitionsMeta, body: wc1At2025Competitions },
  { ...wc1At2025Results17Meta, body: wc1At2025Results17 },
  { ...wc1At2025Results24Meta, body: wc1At2025Results24 },
];
export const ISU_TEAM_PURSUIT_RUN = { now: "2025-11-17T04:00:00.000Z", lastSuccessAt: "2025-11-16T04:00:00.000Z" };

/**
 * The daily run on Sunday 1 Mar 2026 at 04:00 UTC, after a run on 28 Feb,
 * before the Allround and Sprint World Championships (Heerenveen, 5–8 Mar):
 * - the senior events ending on or after 27 Feb (the 2026 Worlds to the 2027 Worlds);
 * - the 2026 Worlds' schedule (16 races, UTC start times) and its
 *   competitors (trimmed to the first one and the Belgians);
 * - the schedules of the 2027 Europeans and Worlds (none published yet).
 */
export const isuWorlds2026Run: RecordedResponse[] = [
  { ...events20260227Meta, body: events20260227 },
  { ...worlds2026ScheduleMeta, body: worlds2026Schedule },
  { ...worlds2026CompetitorsMeta, body: worlds2026Competitors },
  { ...europeans2027ScheduleMeta, body: europeans2027Schedule },
  { ...worlds2027ScheduleMeta, body: worlds2027Schedule },
];
export const ISU_WORLDS_2026_RUN = { now: "2026-03-01T04:00:00.000Z", lastSuccessAt: "2026-02-28T04:00:00.000Z" };
