// Recorded World Aquatics API runs (api.worldaquatics.com/fina), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import events from "./astana-events.json?raw";
import eventsMeta from "./astana-events.json.meta.json";
import m50free from "./astana-m50free.json?raw";
import m50freeMeta from "./astana-m50free.json.meta.json";
import w50free from "./astana-w50free.json?raw";
import w50freeMeta from "./astana-w50free.json.meta.json";
import competitions from "./competitions.json?raw";
import competitionsMeta from "./competitions.json.meta.json";

/**
 * The daily run on Sunday 18 Oct 2026 at 04:00 UTC, after a run on 17 Oct:
 * - the World Aquatics competitions from 2 Oct to 1 Nov: the Swimming World
 *   Cup legs in Baku, Tashkent and Astana (15–17 Oct, short course), a
 *   Diving Grand Prix and the Youth Olympic Games;
 * - Astana's disciplines (trimmed to the 50m freestyle, women and men), all
 *   official;
 * - the women's 50m freestyle (Florine Gaspard 10th, through the heats into
 *   the final) and the men's (trimmed to the final and the heats summary; no
 *   Belgian).
 */
export const aquaticsAstanaRun: RecordedResponse[] = [
  { ...competitionsMeta, body: competitions },
  { ...eventsMeta, body: events },
  { ...w50freeMeta, body: w50free },
  { ...m50freeMeta, body: m50free },
];
export const AQUATICS_ASTANA_RUN = { now: "2026-10-18T04:00:00.000Z", lastSuccessAt: "2026-10-17T04:00:00.000Z" };
