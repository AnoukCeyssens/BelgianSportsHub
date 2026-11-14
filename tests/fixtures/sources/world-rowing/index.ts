// Recorded World Rowing API runs (world-rowing-api.soticcloud.net), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import races from "./beach-sprint-finals-races.json?raw";
import racesMeta from "./beach-sprint-finals-races.json.meta.json";
import competitions from "./competitions-2026.json?raw";
import competitionsMeta from "./competitions-2026.json.meta.json";
import cup1Races from "./cup-1-races.json?raw";
import cup1RacesMeta from "./cup-1-races.json.meta.json";

/**
 * The daily run on Thursday 22 Oct 2026 at 04:00 UTC, after a run on 21 Oct:
 * - the 2026 competition list: senior Championships and World Cups, but also
 *   U19, U23, masters, indoor and national regattas, and the Youth Olympic
 *   Games (31 Oct – 3 Nov);
 * - all races of the World Rowing Beach Sprint Finals (18–21 Oct; trimmed):
 *   Savin Rodenburg out after the men's solo time trials, the solo medal
 *   races, and a mixed double race.
 */
export const rowingBeachSprintRun: RecordedResponse[] = [
  { ...competitionsMeta, body: competitions },
  { ...racesMeta, body: races },
];
export const ROWING_BEACH_SPRINT_RUN = { now: "2026-10-22T04:00:00.000Z", lastSuccessAt: "2026-10-21T04:00:00.000Z" };

/**
 * The daily run on Monday 1 Jun 2026 at 04:00 UTC, after a run on 31 May, once
 * World Rowing Cup I (29–31 May) had ended:
 * - the 2026 competition list (the same recording as above);
 * - all races of World Rowing Cup I (trimmed): the men's double sculls (Tibo
 *   Vyvey / Aaron Andries 2nd in Final A) and quadruple sculls (Boris
 *   Taeldeman, Lukas Depla, Marlon Colpaert, Dean Laureyns 5th in Final B, so
 *   11th) through every round, and both events' Finals A and B.
 */
export const rowingCup1Run: RecordedResponse[] = [
  { ...competitionsMeta, body: competitions },
  { ...cup1RacesMeta, body: cup1Races },
];
export const ROWING_CUP_1_RUN = { now: "2026-06-01T04:00:00.000Z", lastSuccessAt: "2026-05-31T04:00:00.000Z" };
