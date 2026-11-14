// Recorded OWGR runs (apiweb.owgr.com), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import rankings from "./belgium-rankings.json?raw";
import rankingsMeta from "./belgium-rankings.json.meta.json";

/**
 * The weekly run on Saturday 14 Nov 2026: the current ranking filtered to
 * Belgium, 38 golfers: Thomas Detry 93rd (1.3645 average points), Adrien
 * Dumont de Chassart 219th, Thomas Pieters 292nd, … and amateurs marked "(Am)".
 */
export const owgrRun: RecordedResponse[] = [{ ...rankingsMeta, body: rankings }];
export const OWGR_RUN = { now: "2026-11-14T04:00:00.000Z" };
