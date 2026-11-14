// World Triathlon API runs (api.triathlon.org/v1), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import entriesEliteWomen from "./entries-elite-women.json?raw";
import entriesEliteWomenMeta from "./entries-elite-women.json.meta.json";
import events from "./events.json?raw";
import eventsMeta from "./events.json.meta.json";
import eventsRefused from "./events-refused.json?raw";
import eventsRefusedMeta from "./events-refused.json.meta.json";
import programs from "./programs.json?raw";
import programsMeta from "./programs.json.meta.json";
import resultsMixedRelay from "./results-mixed-relay.json?raw";
import resultsMixedRelayMeta from "./results-mixed-relay.json.meta.json";
import resultsEliteMen from "./results-elite-men.json?raw";
import resultsEliteMenMeta from "./results-elite-men.json.meta.json";

/**
 * The daily run on 14 Nov 2026 after a run on 13 Nov, BUILT BY HAND from the
 * documented response shapes (no API key was available to record one; see
 * each `.meta.json`). Made-up World Cup in "Exampleton" (8–15 Nov):
 * - the events from 6 to 28 Nov: the World Cup and an age-group event;
 * - the World Cup's races: Elite Men (8 Nov, results), Elite Women (15 Nov,
 *   start list), a mixed relay and a U23 race;
 * - Elite Men results: Jules Voorbeeld (BEL) 14th, Arno Specimen (BEL) DNF,
 *   Noah Absent (BEL) DNS, a British winner;
 * - Mixed Relay results (9 Nov): Belgium 6th (Lotte Voorbeeld, Jules
 *   Voorbeeld, Mira Exemplaar, Arno Specimen), Great Britain 1st;
 * - Elite Women start list: Lotte Voorbeeld (BEL) and a Spaniard.
 */
export const triathlonWorldCupRun: RecordedResponse[] = [
  { ...eventsMeta, body: events },
  { ...programsMeta, body: programs },
  { ...resultsEliteMenMeta, body: resultsEliteMen },
  { ...resultsMixedRelayMeta, body: resultsMixedRelay },
  { ...entriesEliteWomenMeta, body: entriesEliteWomen },
];
export const TRIATHLON_WORLD_CUP_RUN = { now: "2026-11-14T04:00:00.000Z", lastSuccessAt: "2026-11-13T04:00:00.000Z" };

/** The same run's first request as api.triathlon.org really answers it without a valid key (recorded). */
export const triathlonRefusedRun: RecordedResponse[] = [{ ...eventsRefusedMeta, body: eventsRefused }];
