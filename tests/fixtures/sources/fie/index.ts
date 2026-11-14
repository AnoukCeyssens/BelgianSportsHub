// Recorded fie.org pages, ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import berneResults from "./berne-385-results.html?raw";
import berneResultsMeta from "./berne-385-results.html.meta.json";
import berne from "./berne.html?raw";
import berneMeta from "./berne.html.meta.json";
import competitions from "./competitions.html?raw";
import competitionsMeta from "./competitions.html.meta.json";
import wuxiResults from "./wuxi-92-results.html?raw";
import wuxiResultsMeta from "./wuxi-92-results.html.meta.json";
import wuxi from "./wuxi.html?raw";
import wuxiMeta from "./wuxi.html.meta.json";

/**
 * The daily run on Saturday 14 Nov 2026 around 12:00 UTC, after a run on
 * 13 Nov at 04:00 UTC:
 * - the competitions page (trimmed to four tournaments): the Berne men's épée
 *   World Cup (12–14 Nov), the Wuxi women's épée World Cup (13–15 Nov), the
 *   Boston junior and cadet World Cup and the Orléans Grand Prix (from 3 Dec);
 * - the Berne and Wuxi tournament pages, each with an individual event (decided)
 *   and a team event (still to come);
 * - the results of both individual events (trimmed): the top of the ranking,
 *   the pool ranking and the table, with nine Belgian men in Berne and two
 *   Belgian women in Wuxi, none in the top 24.
 */
export const fieBerneRun: RecordedResponse[] = [
  { ...competitionsMeta, body: competitions },
  { ...berneMeta, body: berne },
  { ...berneResultsMeta, body: berneResults },
  { ...wuxiMeta, body: wuxi },
  { ...wuxiResultsMeta, body: wuxiResults },
];
export const FIE_BERNE_RUN = { now: "2026-11-14T12:00:00.000Z", lastSuccessAt: "2026-11-13T04:00:00.000Z" };
