// A recorded run of UCI DataRide (dataride.uci.ch), ready for stubOutboundFetch().
// Recorded by running the adapter once against the real service, each request
// sent once; the competition lists and results are trimmed by hand (see each
// `trimmedByHand`). POSTs carry their form as `requestBody`.
import type { RecordedResponse } from "../../../support/outbound-fetch";

const bodies = import.meta.glob<string>("./*.json", { query: "?raw", import: "default", eager: true });
const metas = import.meta.glob<Omit<RecordedResponse, "body">>("./*.json.meta.json", { import: "default", eager: true });

/**
 * The daily run on Monday 19 Oct 2026 at 04:00 UTC, after a run on 18 Oct:
 * - road: the 2026 and 2027 seasons; the Tour of Guangxi (WorldTour, ended
 *   18 Oct; Jarno Widar first overall, 24 Belgians) and the African
 *   Championships (from 21 Oct); one-day .Pro and .1 races left out;
 * - track: the World Championships (14–18 Oct): sprint, keirin and omnium,
 *   men and women (Fabio Van den Bossche 2nd in the omnium, Lotte Kopecky
 *   7th, Nicky Degrendele, Zita Gheysens, Lowie Nulens), and the team
 *   events: madison (men 4th, women 7th), team sprint (men 14th, women 12th)
 *   and team pursuit (men 13th, women 10th), recorded on 14 Nov 2026;
 * - mountain bike: nothing in the window; BMX racing: World Cup rounds 9 and
 *   10 (31 Oct, 1 Nov) still to come; BMX freestyle: the Park World Cup
 *   (15–18 Oct, no Belgian).
 */
export const uciRun: RecordedResponse[] = Object.entries(bodies)
  .filter(([path]) => !path.endsWith(".meta.json"))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, body]) => ({ ...metas[`${path}.meta.json`], body }));
export const UCI_RUN = { now: "2026-10-19T04:00:00.000Z", lastSuccessAt: "2026-10-18T04:00:00.000Z" };
