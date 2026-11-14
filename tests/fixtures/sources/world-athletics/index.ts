// Recorded worldathletics.org pages, ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import calendarDf from "./calendar-df.html?raw";
import calendarDfMeta from "./calendar-df.html.meta.json";
import calendarGl from "./calendar-gl.html?raw";
import calendarGlMeta from "./calendar-gl.html.meta.json";
import calendarGw from "./calendar-gw.html?raw";
import calendarGwMeta from "./calendar-gw.html.meta.json";
import calendarOw from "./calendar-ow.html?raw";
import calendarOwMeta from "./calendar-ow.html.meta.json";
import day1 from "./van-damme-day-1.html?raw";
import day1Meta from "./van-damme-day-1.html.meta.json";
import day2 from "./van-damme-day-2.html?raw";
import day2Meta from "./van-damme-day-2.html.meta.json";

/**
 * The daily run on Sunday 6 Sep 2026 at 04:00 UTC, after a run on 5 Sep:
 * - the calendars of 4 Sep to 20 Sep in the OW, DF, GW and GL categories:
 *   the Memorial Van Damme in Brussels (4–5 Sep, the Diamond League Final),
 *   the Ultimate Championship (11–13 Sep), the Road Running Championships
 *   (19–20 Sep) and the Décastar (18–19 Sep, Combined Events Tour Gold);
 * - the Memorial Van Damme's results of day 1 and day 2 (trimmed to the
 *   events with a Belgian): Diamond League finals, the meeting's other
 *   Diamond disciplines, and promotional and U18 races, which do not count.
 */
export const waVanDammeRun: RecordedResponse[] = [
  { ...calendarOwMeta, body: calendarOw },
  { ...calendarDfMeta, body: calendarDf },
  { ...calendarGwMeta, body: calendarGw },
  { ...calendarGlMeta, body: calendarGl },
  { ...day1Meta, body: day1 },
  { ...day2Meta, body: day2 },
];
export const WA_VAN_DAMME_RUN = { now: "2026-09-06T04:00:00.000Z", lastSuccessAt: "2026-09-05T04:00:00.000Z" };
