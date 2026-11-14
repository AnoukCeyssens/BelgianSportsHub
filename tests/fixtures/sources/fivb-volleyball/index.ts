// Recorded FIVB VIS runs for volleyball, ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import players1470 from "./players-1470.xml?raw";
import players1470Meta from "./players-1470.xml.meta.json";
import players1471 from "./players-1471.xml?raw";
import players1471Meta from "./players-1471.xml.meta.json";
import ranking1471 from "./ranking-1471.xml?raw";
import ranking1471Meta from "./ranking-1471.xml.meta.json";
import tournaments from "./tournaments-2026-09-06.xml?raw";
import tournamentsMeta from "./tournaments-2026-09-06.xml.meta.json";

/**
 * The daily run on 8 Sep 2026 after a run on 7 Sep, the day before the men's
 * EuroVolley (9–26 Sep):
 * - the tournaments ending from 6 Sep (trimmed): both EuroVolley draws (the
 *   women's ended on 6 Sep), the NORCECA men's championship, a test
 *   tournament, the 2027 World Cup and VNL, a national league and an
 *   age-group championship;
 * - player registrations of the men's EuroVolley (trimmed; Seppe Baetens,
 *   Martijn Colson, Pieter Coolman, Eliot De Vleeschhauwer for Belgium) and
 *   the women's (trimmed; four Belgians);
 * - the final ranking of the women's EuroVolley (trimmed, recorded later, on
 *   14 Nov 2026): Türkiye 1st, Belgium 9th.
 */
export const volleyballEuroVolleyRun: RecordedResponse[] = [
  { ...tournamentsMeta, body: tournaments },
  { ...players1470Meta, body: players1470 },
  { ...players1471Meta, body: players1471 },
  { ...ranking1471Meta, body: ranking1471 },
];
export const VOLLEYBALL_EUROVOLLEY_RUN = { now: "2026-09-08T04:00:00.000Z", lastSuccessAt: "2026-09-07T04:00:00.000Z" };
