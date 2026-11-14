// Recorded World Archery API runs (api.worldarchery.org/v3), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import timetableCompetitions from "./timetable-competitions.json?raw";
import timetableCompetitionsMeta from "./timetable-competitions.json.meta.json";
import medellinSchedule from "./medellin-schedule.json?raw";
import medellinScheduleMeta from "./medellin-schedule.json.meta.json";
import medellinScheduleBuilt from "./medellin-schedule-built.json?raw";
import medellinScheduleBuiltMeta from "./medellin-schedule-built.json.meta.json";

/**
 * The timetable run (#39) on Saturday 14 Nov 2026 at 04:00 UTC:
 * - the outdoor competitions of the next 400 days (trimmed): the World
 *   Championships in Medellín (20–27 Sep 2027), the youth, para and Asian
 *   youth Championships and the World Cup Final, which have no timetable here;
 * - Medellín's schedule: not published yet.
 */
export const archeryTimetableRun: RecordedResponse[] = [
  { ...timetableCompetitionsMeta, body: timetableCompetitions },
  { ...medellinScheduleMeta, body: medellinSchedule },
];
export const ARCHERY_TIMETABLE_RUN = { now: "2026-11-14T04:00:00.000Z" };

/** The same run once Medellín's schedule is out: built by hand from the API documentation's example (see its meta). */
export const archeryPublishedTimetableRun: RecordedResponse[] = [
  { ...timetableCompetitionsMeta, body: timetableCompetitions },
  { ...medellinScheduleBuiltMeta, body: medellinScheduleBuilt },
];
import firstRunResults from "./bel-results-first-run.json?raw";
import firstRunResultsMeta from "./bel-results-first-run.json.meta.json";
import firstRunTeamResults from "./bel-team-results-first-run.json?raw";
import firstRunTeamResultsMeta from "./bel-team-results-first-run.json.meta.json";
import julyTeamResults from "./bel-team-results-2026-06-16.json?raw";
import julyTeamResultsMeta from "./bel-team-results-2026-06-16.json.meta.json";
import novemberCompetitions from "./competitions-from-2026-11-14.json?raw";
import novemberCompetitionsMeta from "./competitions-from-2026-11-14.json.meta.json";
import julyResults from "./bel-results-2026-06-16.json?raw";
import julyResultsMeta from "./bel-results-2026-06-16.json.meta.json";
import julyCompetitions from "./competitions-from-2026-07-01.json?raw";
import julyCompetitionsMeta from "./competitions-from-2026-07-01.json.meta.json";
import madridEntries from "./madrid-entries-bel.json?raw";
import madridEntriesMeta from "./madrid-entries-bel.json.meta.json";
import rankingsRM from "./rankings-RM.json?raw";
import rankingsRMMeta from "./rankings-RM.json.meta.json";
import rankingsRW from "./rankings-RW.json?raw";
import rankingsRWMeta from "./rankings-RW.json.meta.json";
import rankingsCM from "./rankings-CM.json?raw";
import rankingsCMMeta from "./rankings-CM.json.meta.json";
import rankingsCW from "./rankings-CW.json?raw";
import rankingsCWMeta from "./rankings-CW.json.meta.json";
import teamRankingsRM from "./team-rankings-RM.json?raw";
import teamRankingsRMMeta from "./team-rankings-RM.json.meta.json";
import teamRankingsRW from "./team-rankings-RW.json?raw";
import teamRankingsRWMeta from "./team-rankings-RW.json.meta.json";
import teamRankingsCM from "./team-rankings-CM.json?raw";
import teamRankingsCMMeta from "./team-rankings-CM.json.meta.json";
import teamRankingsCW from "./team-rankings-CW.json?raw";
import teamRankingsCWMeta from "./team-rankings-CW.json.meta.json";
import teamRankingsRX from "./team-rankings-RX.json?raw";
import teamRankingsRXMeta from "./team-rankings-RX.json.meta.json";
import teamRankingsCX from "./team-rankings-CX.json?raw";
import teamRankingsCXMeta from "./team-rankings-CX.json.meta.json";

/**
 * The first run, on 14 Nov 2026 (no earlier success, so one year back):
 * - Belgium's individual outdoor results from 14 Nov 2025: 70 rows, among them
 *   World Cup stages, the European Championships (Antalya) and Grand Prix, but
 *   also para, U18/U21 and "Other International Event" rows that are left out;
 * - Belgium's team outdoor results from 14 Nov 2025 (recorded with #27): 16
 *   rows with their archers, among them the recurve men 8th and the compound
 *   men 11th at the European Championships and three World Cup stages, plus
 *   U18/U21 and "Other International Event" rows;
 * - outdoor competitions from 14 to 28 Nov: national events and the Asia Cup
 *   in Hangzhou, none a European or world event, so no entry list is fetched;
 * - the world rankings issued 9 Nov 2026, Belgians only (ticket #33): recurve
 *   men (Jarno De Smedt 53rd, 89.75 pts, …), recurve women, compound men
 *   (Julien Fraipont 64th, …) and women; Belgium's teams 22nd (recurve men),
 *   43rd (compound men) and 65th (recurve mixed), none in the other three.
 */
export const archeryFirstRun: RecordedResponse[] = [
  { ...firstRunResultsMeta, body: firstRunResults },
  { ...firstRunTeamResultsMeta, body: firstRunTeamResults },
  { ...novemberCompetitionsMeta, body: novemberCompetitions },
  { ...rankingsRMMeta, body: rankingsRM },
  { ...rankingsRWMeta, body: rankingsRW },
  { ...rankingsCMMeta, body: rankingsCM },
  { ...rankingsCWMeta, body: rankingsCW },
  { ...teamRankingsRMMeta, body: teamRankingsRM },
  { ...teamRankingsRWMeta, body: teamRankingsRW },
  { ...teamRankingsCMMeta, body: teamRankingsCM },
  { ...teamRankingsCWMeta, body: teamRankingsCW },
  { ...teamRankingsRXMeta, body: teamRankingsRX },
  { ...teamRankingsCXMeta, body: teamRankingsCX },
];
export const ARCHERY_FIRST_RUN = { now: "2026-11-14T04:00:00.000Z" };

/**
 * The daily run on 1 Jul 2026 after a run on 30 Jun:
 * - Belgium's results from 16 Jun (two weeks back): para series rows only, and
 *   no team results (recorded with #27);
 * - outdoor competitions from 1 to 15 Jul (trimmed), with World Cup stage 4
 *   in Madrid (7–12 Jul) among them;
 * - Madrid's Belgian entries: Julien Fraipont, Mick Fleurinck, Jarno De Smedt …
 */
export const archeryJuly2026Run: RecordedResponse[] = [
  { ...julyResultsMeta, body: julyResults },
  { ...julyCompetitionsMeta, body: julyCompetitions },
  { ...madridEntriesMeta, body: madridEntries },
  { ...julyTeamResultsMeta, body: julyTeamResults },
];
export const ARCHERY_JULY_2026_RUN = { now: "2026-07-01T04:00:00.000Z", lastSuccessAt: "2026-06-30T04:00:00.000Z" };
