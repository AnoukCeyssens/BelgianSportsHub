// Recorded fie.org pages, ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import berneResults from "./berne-385-results.html?raw";
import berneResultsMeta from "./berne-385-results.html.meta.json";
import berneTeamResults from "./berne-559-results.html?raw";
import berneTeamResultsMeta from "./berne-559-results.html.meta.json";
import berne from "./berne.html?raw";
import berneMeta from "./berne.html.meta.json";
import competitions from "./competitions.html?raw";
import competitionsMeta from "./competitions.html.meta.json";
import wuxiResults from "./wuxi-92-results.html?raw";
import wuxiResultsMeta from "./wuxi-92-results.html.meta.json";
import takamatsuCompetitions from "./takamatsu-competitions.html?raw";
import takamatsuCompetitionsMeta from "./takamatsu-competitions.html.meta.json";
import takamatsu from "./takamatsu.html?raw";
import takamatsuMeta from "./takamatsu.html.meta.json";
import takamatsuMenResults from "./takamatsu-135-results.html?raw";
import takamatsuMenResultsMeta from "./takamatsu-135-results.html.meta.json";
import takamatsuWomenResults from "./takamatsu-129-results.html?raw";
import takamatsuWomenResultsMeta from "./takamatsu-129-results.html.meta.json";
import takamatsuMenTeamResults from "./takamatsu-205-results.html?raw";
import takamatsuMenTeamResultsMeta from "./takamatsu-205-results.html.meta.json";
import takamatsuWomenTeamResults from "./takamatsu-563-results.html?raw";
import takamatsuWomenTeamResultsMeta from "./takamatsu-563-results.html.meta.json";
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
 *   Belgian women in Wuxi, none in the top 24;
 * - the results page of the Berne men's épée team event (recorded later that
 *   day, while it was not decided yet: no ranking).
 */
export const fieBerneRun: RecordedResponse[] = [
  { ...competitionsMeta, body: competitions },
  { ...berneMeta, body: berne },
  { ...berneResultsMeta, body: berneResults },
  { ...berneTeamResultsMeta, body: berneTeamResults },
  { ...wuxiMeta, body: wuxi },
  { ...wuxiResultsMeta, body: wuxiResults },
];
export const FIE_BERNE_RUN = { now: "2026-11-14T12:00:00.000Z", lastSuccessAt: "2026-11-13T04:00:00.000Z" };

/**
 * The daily run on Monday 19 Oct 2026 after a run on 18 Oct at 04:00 UTC,
 * once the Takamatsu City foil World Cup (15–18 Oct) had ended (recorded on
 * 14 Nov 2026):
 * - the competitions page (trimmed to Takamatsu);
 * - the Takamatsu tournament page: men's and women's individual and team events;
 * - the four results pages (trimmed to the top 3 and Belgium): Stef De Greef
 *   8th in the men's individual foil (three more Belgians out in the table of
 *   128), no Belgian woman, Belgium 16th in the men's team event (the page
 *   names the nations only, not the fencers), no Belgian women's team.
 */
export const fieTakamatsuRun: RecordedResponse[] = [
  { ...takamatsuCompetitionsMeta, body: takamatsuCompetitions },
  { ...takamatsuMeta, body: takamatsu },
  { ...takamatsuMenResultsMeta, body: takamatsuMenResults },
  { ...takamatsuWomenResultsMeta, body: takamatsuWomenResults },
  { ...takamatsuMenTeamResultsMeta, body: takamatsuMenTeamResults },
  { ...takamatsuWomenTeamResultsMeta, body: takamatsuWomenTeamResults },
];
export const FIE_TAKAMATSU_RUN = { now: "2026-10-19T04:00:00.000Z", lastSuccessAt: "2026-10-18T04:00:00.000Z" };
