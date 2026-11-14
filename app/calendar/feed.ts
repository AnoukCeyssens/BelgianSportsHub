// The iCal subscription feed (spec #20, story 39 and "Calendar export"; ticket
// #30). Calendar apps can't pass Cloudflare Access, so the feed lives at
// /ical/<token>.ics, which an Access Bypass policy lets through (that path
// only), and the Worker answers only when <token> is the ICAL_FEED_TOKEN
// secret. Without the secret the feed is off. Rotating the secret
// (`wrangler secret put ICAL_FEED_TOKEN --env live`) cuts off every old link.
import type { Db } from "~/db/client";
import { BELGIAN_ZONE, icalFeed, onCalendar } from "~/domain";
import { participationsBetween, participationText } from "./participations";

/** Path prefix the Access Bypass policy covers. */
export const FEED_PATH = "/ical/";

/** How far back and ahead the feed reaches: last season's results to the next Winter Games. */
const DAYS_BACK = 365;
const YEARS_AHEAD = 4;

type FeedEnv = { ICAL_FEED_TOKEN?: string };

/** The secret token, or null while the feed is off. */
export function feedToken(env: Env): string | null {
  const token = (env as Env & FeedEnv).ICAL_FEED_TOKEN?.trim();
  return token ? token : null;
}

/** The feed's https address for `origin`, or null while the feed is off. */
export function feedUrl(env: Env, origin: string): string | null {
  const token = feedToken(env);
  return token ? `${origin}${FEED_PATH}${encodeURIComponent(token)}.ics` : null;
}

/** Whether `file` (the path's last segment, "<token>.ics") names the feed. Compared in constant time. */
export async function isFeedFile(env: Env, file: string): Promise<boolean> {
  const token = feedToken(env);
  if (!token || !file.endsWith(".ics")) return false;
  // Equal-length digests, compared without an early exit.
  const [a, b] = await Promise.all([digest(file.slice(0, -".ics".length)), digest(token)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** The Calendar's competitions (as the Calendar tab shows them) as iCal text. */
export async function calendarFeed(db: Db, origin: string, now: Date): Promise<string> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BELGIAN_ZONE }).format(now);
  const from = shiftDays(today, -DAYS_BACK);
  const to = `${Number(today.slice(0, 4)) + YEARS_AHEAD}${today.slice(4)}`;
  const shown = (await participationsBetween(db, from, to)).filter((c) => onCalendar(c.kind, c.participation.status));
  return icalFeed(
    {
      name: "Belgian Participation · BelgianSportsHub",
      timeZone: BELGIAN_ZONE,
      refreshHours: 12,
      events: shown.map((c) => ({
        uid: `${c.id}@belgiansportshub`,
        startDate: c.startDate,
        endDate: c.endDate,
        summary: c.name,
        location: c.city,
        description: [c.sport, KIND_TEXT[c.kind], participationText(c)].filter(Boolean).join(" · "),
        url: `${origin}/calendar?month=${c.startDate.slice(0, 7)}`,
      })),
    },
    now,
  );
}

const KIND_TEXT = { championship: "Championship", games: "the Games", circuit: null } as const;

function shiftDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
