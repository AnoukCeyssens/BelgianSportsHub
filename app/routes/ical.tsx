import { calendarFeed, isFeedFile } from "~/calendar/feed";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import type { Route } from "./+types/ical";

// Spec #20, story 39; ticket #30: the iCal subscription feed, /ical/<token>.ics
// (a resource route: no page). A wrong or missing token gets a bare 404.
export async function loader({ context, params, request }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  if (!(await isFeedFile(env, params.file))) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const ics = await calendarFeed(dbFrom(context), new URL(request.url).origin, now());
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="belgian-sports-hub.ics"',
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
