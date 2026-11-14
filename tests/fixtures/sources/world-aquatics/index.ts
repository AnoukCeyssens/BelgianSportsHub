// Recorded World Aquatics API runs (api.worldaquatics.com/fina), ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import timetableCompetitions from "./timetable-competitions.json?raw";
import timetableCompetitionsMeta from "./timetable-competitions.json.meta.json";
import beijing25mSchedule from "./beijing-25m-schedule.json?raw";
import beijing25mScheduleMeta from "./beijing-25m-schedule.json.meta.json";
import budapestSchedule from "./budapest-schedule.json?raw";
import budapestScheduleMeta from "./budapest-schedule.json.meta.json";

/**
 * The timetable run (#39) on Saturday 14 Nov 2026 at 04:00 UTC:
 * - the World Aquatics competitions of the next 400 days (trimmed): the short
 *   course Worlds in Beijing (1–6 Dec 2026), the Worlds in Budapest (from
 *   26 Jun 2027), and a World Cup, masters and U20 events that have no timetable here;
 * - the Beijing schedule (trimmed to four events; venue-local dates and times)
 *   and the Budapest one (not published yet).
 */
export const aquaticsTimetableRun: RecordedResponse[] = [
  { ...timetableCompetitionsMeta, body: timetableCompetitions },
  { ...beijing25mScheduleMeta, body: beijing25mSchedule },
  { ...budapestScheduleMeta, body: budapestSchedule },
];
export const AQUATICS_TIMETABLE_RUN = { now: "2026-11-14T04:00:00.000Z" };
import events from "./astana-events.json?raw";
import eventsMeta from "./astana-events.json.meta.json";
import m50free from "./astana-m50free.json?raw";
import m50freeMeta from "./astana-m50free.json.meta.json";
import w50free from "./astana-w50free.json?raw";
import w50freeMeta from "./astana-w50free.json.meta.json";
import competitions from "./competitions.json?raw";
import competitionsMeta from "./competitions.json.meta.json";
import dohaCompetitions from "./doha-competitions.json?raw";
import dohaCompetitionsMeta from "./doha-competitions.json.meta.json";
import dohaEvents from "./doha-events.json?raw";
import dohaEventsMeta from "./doha-events.json.meta.json";
import dohaW4x200free from "./doha-w4x200free.json?raw";
import dohaW4x200freeMeta from "./doha-w4x200free.json.meta.json";
import parisCompetitions from "./paris-as-competitions.json?raw";
import parisCompetitionsMeta from "./paris-as-competitions.json.meta.json";
import parisEvents from "./paris-as-events.json?raw";
import parisEventsMeta from "./paris-as-events.json.meta.json";
import parisDuetFree from "./paris-as-duet-free.json?raw";
import parisDuetFreeMeta from "./paris-as-duet-free.json.meta.json";
import parisDuetTechnical from "./paris-as-duet-technical.json?raw";
import parisDuetTechnicalMeta from "./paris-as-duet-technical.json.meta.json";

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

/**
 * The daily run on 16 Feb 2024 after a run on 15 Feb, during the World
 * Championships in Doha (2–18 Feb):
 * - the competitions from 31 Jan to 1 Mar: the Worlds, the Masters
 *   Championships and a Diving World Cup (from 29 Feb);
 * - the Worlds' disciplines (trimmed to the women's 4x200m freestyle relay);
 * - that relay (trimmed): Belgium 15th in the heats (Valentine Dumont, Camille
 *   Henveaux, Lucie Hanquet, Lotte Vanhauwaert), China first in heats and final.
 */
export const aquaticsDohaRun: RecordedResponse[] = [
  { ...dohaCompetitionsMeta, body: dohaCompetitions },
  { ...dohaEventsMeta, body: dohaEvents },
  { ...dohaW4x200freeMeta, body: dohaW4x200free },
];
export const AQUATICS_DOHA_RUN = { now: "2024-02-16T04:00:00.000Z", lastSuccessAt: "2024-02-15T04:00:00.000Z" };

/**
 * The daily run on 30 Mar 2026 after a run on 29 Mar, once the Artistic
 * Swimming World Cup in Paris (27–29 Mar) had ended:
 * - the competitions from 14 Mar to 13 Apr (trimmed): the Paris World Cup, two
 *   water polo World Cups and a Diving Grand Prix;
 * - Paris's disciplines (trimmed to the women's duets);
 * - Women's Duet Technical: Julie Cooninx / Lara Drijkoningen 28th; Women's
 *   Duet Free: Laura Vergnion / Melina Wert 22nd; each with the winning duet
 *   (whose third, reserve swimmer is listed with Reserve: true).
 */
export const aquaticsParisDuetsRun: RecordedResponse[] = [
  { ...parisCompetitionsMeta, body: parisCompetitions },
  { ...parisEventsMeta, body: parisEvents },
  { ...parisDuetTechnicalMeta, body: parisDuetTechnical },
  { ...parisDuetFreeMeta, body: parisDuetFree },
];
export const AQUATICS_PARIS_DUETS_RUN = { now: "2026-03-30T04:00:00.000Z", lastSuccessAt: "2026-03-29T04:00:00.000Z" };
