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

/**
 * The daily run on Saturday 14 Nov 2026 around 12:00 UTC, during World Cup #1
 * (Beijing, 13–15 Nov), after a successful run on 13 Nov at 08:00 UTC:
 * - the senior events ending on or after 12 Nov (World Cup #1 to the 2027 Worlds);
 * - World Cup #1's competitions (trimmed): 3 official before the last run,
 *   7, 8 and 12 official since, 16 live, 28 not yet skated;
 * - results of 7 (Fran Vanhoutte 17th in the 1000m Women), 8 (no Belgian) and
 *   12 (Indra Medard 18th in the 1500m Men Division B);
 * - competitors of World Cup #1 (trimmed; Medard, Bart Swings, Vanhoutte) and
 *   of World Cup #2 (Tokyo, from 20 Nov; none published yet).
 */
export const isuWorldCup1Run: RecordedResponse[] = [
  { ...eventsMeta, body: events },
  { ...wc1CompetitionsMeta, body: wc1Competitions },
  { ...wc1Results7Meta, body: wc1Results7 },
  { ...wc1Results8Meta, body: wc1Results8 },
  { ...wc1Results12Meta, body: wc1Results12 },
  { ...wc1CompetitorsMeta, body: wc1Competitors },
  { ...wc2CompetitorsMeta, body: wc2Competitors },
];
export const ISU_WORLD_CUP_1_RUN = { now: "2026-11-14T12:00:00.000Z", lastSuccessAt: "2026-11-13T08:00:00.000Z" };

/**
 * The daily run on 6 Jan 2026 after a run on 5 Jan: the events list (trimmed)
 * holds the U.S. Olympic Team Trials (a national event, ended 5 Jan) and the
 * Milano Cortina Olympic Games (from 6 Feb). Nothing else is fetched.
 */
export const isuJanuary2026Run: RecordedResponse[] = [{ ...events202601Meta, body: events202601 }];
export const ISU_JANUARY_2026_RUN = { now: "2026-01-06T04:00:00.000Z", lastSuccessAt: "2026-01-05T04:00:00.000Z" };
