// Recorded Judobase runs (data.ijf.org), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import abidjan from "./abidjan-competitors.json?raw";
import abidjanMeta from "./abidjan-competitors.json.meta.json";
import competitions2026 from "./competitions-2026.json?raw";
import competitions2026Meta from "./competitions-2026.json.meta.json";
import hongKong from "./hong-kong-competitors.json?raw";
import hongKongMeta from "./hong-kong-competitors.json.meta.json";
import rome from "./rome-competitors.json?raw";
import romeMeta from "./rome-competitors.json.meta.json";
import zagreb from "./zagreb-competitors.json?raw";
import zagrebMeta from "./zagreb-competitors.json.meta.json";

/**
 * The daily run on Saturday 14 Nov 2026 around 12:00 UTC, on day 2 of the
 * Zagreb Grand Prix (13–15 Nov), after a successful run on 13 Nov at 04:00 UTC:
 * - the 2026 competition list (trimmed to those from 15 Oct): Grand Slams,
 *   Grand Prix, continental Opens, but also an EJU training camp and Kata;
 * - Zagreb's competitors (trimmed): day 1's categories are decided (Olivier
 *   Naert out in the -60 kg, Lois Petit and Victoria Sibille in the -48 kg),
 *   day 2's are not (Ray Marinx and Abdul Malik Umayev still in the -73 kg);
 * - the competitors of the Abidjan African Open (15 Nov, no Belgian), the
 *   Rome European Open (28–29 Nov; Lien Meeuwssen, Karel Foubert and others)
 *   and the Hong Kong Asian Open (28–29 Nov, no Belgian).
 */
export const ijfZagrebRun: RecordedResponse[] = [
  { ...competitions2026Meta, body: competitions2026 },
  { ...zagrebMeta, body: zagreb },
  { ...abidjanMeta, body: abidjan },
  { ...romeMeta, body: rome },
  { ...hongKongMeta, body: hongKong },
];
export const IJF_ZAGREB_RUN = { now: "2026-11-14T12:00:00.000Z", lastSuccessAt: "2026-11-13T04:00:00.000Z" };
