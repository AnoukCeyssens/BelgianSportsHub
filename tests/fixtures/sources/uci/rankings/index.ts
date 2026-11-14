// The UCI road world rankings as DataRide served them on Saturday 14 Nov 2026
// (computed Tuesday 10 Nov 2026, season 2027), recorded one request each by
// hand; the individual rankings and the ranking lists are trimmed (see each
// `trimmedByHand`). POSTs carry their form as `requestBody`.
import type { RecordedResponse } from "../../../../support/outbound-fetch";

const bodies = import.meta.glob<string>("./*.json", { query: "?raw", import: "default", eager: true });
const metas = import.meta.glob<Omit<RecordedResponse, "body">>("./*.json.meta.json", { import: "default", eager: true });

const recorded: RecordedResponse[] = Object.entries(bodies)
  .filter(([path]) => !path.endsWith(".meta.json"))
  .map(([path, body]) => ({ ...metas[`${path}.meta.json`], body }));

/**
 * The results half of the same run finds no seasons to look at: these five
 * empty answers are made up (not recorded), only so a rankings test stays on
 * rankings.
 */
const noResultSeasons: RecordedResponse[] = [10, 9, 7, 1, 13].map((id) => ({
  url: `https://dataride.uci.ch/iframe/GetRestrictedResultsDisciplineSeasons/?disciplineId=${id}`,
  body: "[]",
  contentType: "application/json",
}));

/**
 * The first run after Tuesday 10 Nov 2026 noon (UTC): Men Elite (Remco
 * Evenepoel 2nd, Wout van Aert 7th, Jasper Philipsen 8th; Belgium 1st of the
 * nations) and Women Elite (Lotte Kopecky 7th, Shari Bossuyt 32nd, Fleur
 * Moors 37th; Belgium 8th).
 */
export const uciRankingsRun: RecordedResponse[] = [...recorded, ...noResultSeasons];
export const UCI_RANKINGS_RUN = { now: "2026-11-11T04:00:00.000Z", lastSuccessAt: "2026-11-10T04:00:00.000Z" };
