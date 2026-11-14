// Recorded FIVB VIS runs for beach volleyball, ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import teams8938 from "./teams-8938.xml?raw";
import teams8938Meta from "./teams-8938.xml.meta.json";
import teams8939 from "./teams-8939.xml?raw";
import teams8939Meta from "./teams-8939.xml.meta.json";
import teams8954 from "./teams-8954.xml?raw";
import teams8954Meta from "./teams-8954.xml.meta.json";
import tournaments from "./tournaments-2026-08-11.xml?raw";
import tournamentsMeta from "./tournaments-2026-08-11.xml.meta.json";

/**
 * The daily run on 13 Aug 2026 after a run on 12 Aug, during the European
 * Championships in Stare Jabłonki (12–16 Aug):
 * - the tournaments from 11 to 27 Aug (trimmed): both EuroBeachVolley draws,
 *   BPT Futures Busan (women), a CAVB continental championship, a CAVB U18
 *   event and a Spanish national tour event;
 * - team lists of the men's Euros (Kyan Vercauteren / Joppe Van Langendonck
 *   for Belgium), the women's Euros (no Belgian pair) and Busan (no Belgian pair).
 */
export const beachEurosRun: RecordedResponse[] = [
  { ...tournamentsMeta, body: tournaments },
  { ...teams8938Meta, body: teams8938 },
  { ...teams8939Meta, body: teams8939 },
  { ...teams8954Meta, body: teams8954 },
];
export const BEACH_EUROS_RUN = { now: "2026-08-13T04:00:00.000Z", lastSuccessAt: "2026-08-12T04:00:00.000Z" };
