// Recorded World Rowing API runs (world-rowing-api.soticcloud.net), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import races from "./beach-sprint-finals-races.json?raw";
import racesMeta from "./beach-sprint-finals-races.json.meta.json";
import competitions from "./competitions-2026.json?raw";
import competitionsMeta from "./competitions-2026.json.meta.json";

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
