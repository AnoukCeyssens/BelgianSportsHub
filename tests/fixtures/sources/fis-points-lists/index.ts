// Recorded FIS points-list runs (fis-ski.com), ready for stubOutboundFetch().
// Each run reads the discipline's points-list page, then the newest full list ZIP.
import type { RecordedResponse } from "../../../support/outbound-fetch";
import alpineZip from "./ALFP2027F.zip?bytes";
import alpineZipMeta from "./ALFP2027F.zip.meta.json";
import alpineLists from "./alpine-lists.html?raw";
import alpineListsMeta from "./alpine-lists.html.meta.json";
import snowboardZip from "./SBFP727F.zip?bytes";
import snowboardZipMeta from "./SBFP727F.zip.meta.json";
import snowboardLists from "./snowboard-lists.html?raw";
import snowboardListsMeta from "./snowboard-lists.html.meta.json";

/**
 * The weekly alpine run on Saturday 14 Nov 2026: the newest list is the 20th
 * of 2026/27 (valid 12–18 Nov, races 1 Jul–8 Nov). The ZIP is trimmed to the
 * 18 races with a Belgian result:
 * - World Cup Sölden GS (25 Oct): Sam Maes 20th, 1:46.44;
 * - South American Cup, Ushuaia: Nicolas Hotermans DNF twice;
 * - Australian New Zealand Cup, Mt Hutt and Coronet Peak: Ioannis Bouas 23rd,
 *   17th, 11th, and a DNS;
 * - FIS races, National Junior Races, the NZL National Championships and
 *   Entry League races, which are not senior international competitions.
 */
export const fisAlpineRun: RecordedResponse[] = [
  { ...alpineListsMeta, body: alpineLists },
  { ...alpineZipMeta, body: alpineZip },
];
export const FIS_ALPINE_RUN = { now: "2026-11-14T04:00:00.000Z", lastSuccessAt: "2026-11-07T04:00:00.000Z" };

/** The alpine points-list page alone: what a run fetches when it already has the newest list. */
export const fisAlpineListsOnly: RecordedResponse[] = [{ ...alpineListsMeta, body: alpineLists }];

/**
 * The first snowboard run on Saturday 14 Nov 2026: the newest list is the 7th
 * of 2026/27 (valid 5–25 Nov). The ZIP is trimmed to the 7 races with a
 * Belgian result: the European Cup in Antwerp (24 Oct, Men's Street Style:
 * Joewen Frijns 1st, Ward Van Tittelboom 21st, Seth Van de Vliet 23rd, Terje
 * Meulemans 25th) and FIS races in Landgraaf.
 */
export const fisSnowboardRun: RecordedResponse[] = [
  { ...snowboardListsMeta, body: snowboardLists },
  { ...snowboardZipMeta, body: snowboardZip },
];
export const FIS_SNOWBOARD_RUN = { now: "2026-11-14T04:00:00.000Z" };
