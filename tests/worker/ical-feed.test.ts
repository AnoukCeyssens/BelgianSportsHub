import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fixClock } from "../support/clock";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntrant, seedParticipationCuration, seedResult } from "../support/seed";
import { getWithSecrets } from "../support/worker";

// Spec #20, story 39 and "Calendar export"; ticket #30: a read-only iCal
// subscription feed of the calendar behind a secret token, because calendar
// apps can't pass Cloudflare Access.
const NOW = "2026-11-14T12:00:00.000Z";
const TOKEN = "k3Y9-feed-token-for-tests";
const secrets = { ICAL_FEED_TOKEN: TOKEN };

/** The feed's events, each as its unfolded properties. */
function events(ics: string) {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  return [...unfolded.matchAll(/BEGIN:VEVENT\r\n(.*?)END:VEVENT/gs)].map((m) =>
    Object.fromEntries(
      m[1]
        .split("\r\n")
        .filter(Boolean)
        .map((line) => {
          const i = line.indexOf(":");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    ),
  );
}

describe("iCal feed", () => {
  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
  });

  it("holds the Calendar's competitions as all-day events: confirmed or likely Participation, plus Championships and the Games", async () => {
    const tas = await seedAthlete(env.DB, { name: "Sandrine Tas", sport: "Speed skating" });
    const calgary = await seedCompetition(env.DB, {
      name: "Speed Skating World Cup, Calgary",
      sport: "Speed skating",
      startDate: "2026-11-20",
      endDate: "2026-11-22",
      city: "Calgary",
    });
    await seedEntrant(env.DB, calgary, tas);

    const desmet = await seedAthlete(env.DB, { name: "Hanne Desmet", sport: "Short track speed skating" });
    const montreal2025 = await seedCompetition(env.DB, {
      name: "Short Track World Tour, Montréal",
      sport: "Short track speed skating",
      startDate: "2025-11-14",
      endDate: "2025-11-16",
      series: "isu-st:world-tour:montreal",
    });
    await seedResult(env.DB, montreal2025, desmet, { date: "2025-11-15" });
    await seedCompetition(env.DB, {
      name: "Short Track World Tour, Montréal",
      sport: "Short track speed skating",
      startDate: "2026-11-13",
      endDate: "2026-11-15",
      series: "isu-st:world-tour:montreal",
    });

    await seedCompetition(env.DB, {
      name: "European Short Course Swimming Championships",
      sport: "Swimming",
      kind: "championship",
      startDate: "2026-12-01",
      endDate: "2026-12-06",
    });
    await seedCompetition(env.DB, { name: "Olympic Games LA28", sport: "Olympic Games", kind: "games", startDate: "2028-07-14", endDate: "2028-07-30" });

    // Not on the Calendar: no Belgian, or a likely one the owner dropped.
    await seedCompetition(env.DB, { name: "Alpine World Cup, Gurgl", sport: "Alpine skiing", startDate: "2026-11-22" });
    const dropped = await seedCompetition(env.DB, { name: "BWF World Tour Finals", sport: "Badminton", startDate: "2026-11-25", endDate: "2026-11-29" });
    await seedParticipationCuration(env.DB, dropped, { addedAt: "2026-10-01T10:00:00.000Z", decision: "dropped", checkedAt: "2026-11-07T10:00:00.000Z" });

    const res = await getWithSecrets(`/ical/${TOKEN}.ics`, secrets);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    const ics = await res.text();
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("\r\nX-WR-CALNAME:Belgian Participation · BelgianSportsHub\r\n");
    expect(ics).toContain("\r\nX-WR-TIMEZONE:Europe/Brussels\r\n");

    const shown = events(ics);
    // Last year's Montréal leg is still in the feed (it reaches a year back): a Belgian result confirms it.
    expect(shown.map((e) => `${e["DTSTART;VALUE=DATE"]} ${e.SUMMARY}`)).toEqual([
      "20251114 Short Track World Tour\\, Montréal",
      "20261113 Short Track World Tour\\, Montréal",
      "20261120 Speed Skating World Cup\\, Calgary",
      "20261201 European Short Course Swimming Championships",
      "20280714 Olympic Games LA28",
    ]);
    expect(shown[0].DESCRIPTION).toBe("Short track speed skating · Confirmed · Hanne Desmet");
    expect(shown[2]).toEqual({
      UID: `${calgary}@belgiansportshub`,
      DTSTAMP: "20261114T120000Z",
      "DTSTART;VALUE=DATE": "20261120",
      "DTEND;VALUE=DATE": "20261123",
      SUMMARY: "Speed Skating World Cup\\, Calgary",
      LOCATION: "Calgary",
      DESCRIPTION: "Speed skating · Confirmed · Sandrine Tas",
      URL: "https://bsh.test/calendar?month=2026-11",
    });
    expect(shown[1].DESCRIPTION).toBe("Short track speed skating · Likely: Belgian Entry at the previous edition");
    expect(shown[3].DESCRIPTION).toBe("Swimming · Championship · No Belgian Participation known yet");
    expect(shown[4]["DTEND;VALUE=DATE"]).toBe("20280731");
    expect(shown[4].DESCRIPTION).toBe("Olympic Games · the Games · No Belgian Participation known yet");
  });

  it("gives a wrong or missing token no data", async () => {
    await seedCompetition(env.DB, { name: "European Short Course Swimming Championships", sport: "Swimming", kind: "championship", startDate: "2026-12-01" });

    for (const [path, set] of [
      ["/ical/wrong-token.ics", secrets],
      ["/ical/.ics", secrets],
      [`/ical/${TOKEN}`, secrets],
      ["/ical", secrets],
      [`/ical/${TOKEN}.ics`, {}], // the feed is off until the owner sets the secret
      ["/ical/.ics", { ICAL_FEED_TOKEN: "" }],
    ] as const) {
      const res = await getWithSecrets(path, set);
      expect(res.status, path).toBe(404);
      const body = await res.text();
      expect(body, path).not.toContain("Swimming");
      expect(body, path).not.toContain("VCALENDAR");
    }
  });

  it("serves the feed on a deployed copy to a calendar app, which carries no Access identity", async () => {
    const res = await getWithSecrets(`/ical/${TOKEN}.ics`, secrets, { deployed: true });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("BEGIN:VCALENDAR");
  });

  it("shows the subscribe link below the calendar grid", async () => {
    const html = await (await getWithSecrets("/calendar", secrets)).text();

    const legend = html.indexOf('aria-label="Legend"');
    const link = html.indexOf(`href="webcal://bsh.test/ical/${TOKEN}.ics"`);
    expect(link).toBeGreaterThan(legend);
    expect(legend).toBeGreaterThan(-1);
    expect(html).toContain(`https://bsh.test/ical/${TOKEN}.ics`);
  });

  it("shows no subscribe link while the feed is off", async () => {
    const html = await (await getWithSecrets("/calendar", {})).text();

    expect(html).not.toContain("webcal://");
  });
});
