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
import tokyoCalendarDf from "./tokyo-calendar-df.html?raw";
import tokyoCalendarDfMeta from "./tokyo-calendar-df.html.meta.json";
import tokyoCalendarGl from "./tokyo-calendar-gl.html?raw";
import tokyoCalendarGlMeta from "./tokyo-calendar-gl.html.meta.json";
import tokyoCalendarGw from "./tokyo-calendar-gw.html?raw";
import tokyoCalendarGwMeta from "./tokyo-calendar-gw.html.meta.json";
import tokyoCalendarOw from "./tokyo-calendar-ow.html?raw";
import tokyoCalendarOwMeta from "./tokyo-calendar-ow.html.meta.json";
import tokyoDay1 from "./tokyo-day-1.html?raw";
import tokyoDay1Meta from "./tokyo-day-1.html.meta.json";

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

/**
 * The run on Saturday 13 Sep 2025 at 22:00 UTC, after a run on 12 Sep, at the
 * end of day 1 of the World Championships in Tokyo (13–21 Sep):
 * - the calendars of 11 to 27 Sep in the OW, DF, GW and GL categories: the
 *   Worlds and the Berlin Marathon (a label road race);
 * - the Worlds' day 1 results (trimmed to the events with a Belgian, each race
 *   to Belgium and the winner): the mixed 4x400m relay, where Belgium won its
 *   heat (Jonathan Sacoor, Imke Vervaet, Dylan Borlée, Helena Ponette) and took
 *   bronze in the final (Alexander Doom in for Sacoor), plus individual heats.
 */
export const waTokyoDay1Run: RecordedResponse[] = [
  { ...tokyoCalendarOwMeta, body: tokyoCalendarOw },
  { ...tokyoCalendarDfMeta, body: tokyoCalendarDf },
  { ...tokyoCalendarGwMeta, body: tokyoCalendarGw },
  { ...tokyoCalendarGlMeta, body: tokyoCalendarGl },
  { ...tokyoDay1Meta, body: tokyoDay1 },
];
export const WA_TOKYO_DAY_1_RUN = { now: "2025-09-13T22:00:00.000Z", lastSuccessAt: "2025-09-12T22:00:00.000Z" };
