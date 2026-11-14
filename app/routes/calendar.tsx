import { Link } from "react-router";
import { lastDayOf, monthGrid, shiftMonth } from "~/calendar/month-grid";
import { feedUrl } from "~/calendar/feed";
import { participationsBetween, participationText } from "~/calendar/participations";
import { sportColour } from "~/calendar/sport-colours";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import { BELGIAN_ZONE, onCalendar } from "~/domain";
import { formatDay, formatDayRange } from "~/format";
import type { Route } from "./+types/calendar";

// Spec #20, stories 35–38, 40 and 53; ticket #29. A month grid with arrows:
// each competition with a confirmed or likely Belgian Participation is a bar
// across its days, one colour per sport; Championships and the Games always
// show, bold and outlined. A legend and the month's list sit below.

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData ? monthTitle(loaderData.month) : "Calendar"} · Calendar · BelgianSportsHub` }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BELGIAN_ZONE }).format(now());
  const asked = new URL(request.url).searchParams.get("month");
  const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : today.slice(0, 7);
  const weeks = monthGrid(month, [], today);
  const from = weeks[0].monday;
  const to = weeks.at(-1)!.days[6].date;
  const shown = (await participationsBetween(dbFrom(context), from, to))
    .filter((c) => onCalendar(c.kind, c.participation.status))
    .map((c) => ({ ...c, colour: sportColour(c.sport) }));
  const inMonth = shown.filter((c) => c.startDate <= lastDayOf(month) && c.endDate >= `${month}-01`);
  return {
    month,
    previous: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    weeks: monthGrid(month, shown, today),
    list: inMonth,
    sports: [...new Set(inMonth.map((c) => c.sport))].sort().map((sport) => ({ sport, colour: sportColour(sport) })),
    feed: feedUrl(context.get(cloudflareContext).env, new URL(request.url).origin),
  };
}

function monthTitle(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Calendar({ loaderData }: Route.ComponentProps) {
  const { month, previous, next, weeks, list, sports, feed } = loaderData;
  return (
    <>
      <div className="mhead">
        <Link to={`/calendar?month=${previous}`} aria-label="Previous month">
          ‹
        </Link>
        <h1>{monthTitle(month)}</h1>
        <Link to={`/calendar?month=${next}`} aria-label="Next month">
          ›
        </Link>
      </div>
      <div className="dow" aria-hidden="true">
        {DOW.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      {weeks.map((w) => (
        <div className="week" aria-label={`Week of ${formatDay(w.monday)}`} key={w.monday}>
          {w.days.map((d, i) => (
            <div
              className={["dn", d.inMonth ? null : "out", d.today ? "today" : null].filter(Boolean).join(" ")}
              style={{ gridColumn: i + 1 }}
              key={d.date}
            >
              {Number(d.date.slice(8))}
            </div>
          ))}
          <div role="list" aria-label="Competitions" className="bars">
          {w.bars.map((b) => (
            <div
              role="listitem"
              className={["ev", b.item.kind === "circuit" ? null : "champ", b.continuesBefore ? "cl" : null, b.continuesAfter ? "cr" : null]
                .filter(Boolean)
                .join(" ")}
              title={b.item.name}
              style={{ background: b.item.colour, gridColumn: `${b.fromCol + 1} / ${b.toCol + 2}`, gridRow: b.lane + 2 }}
              key={b.item.id}
            >
              {b.continuesBefore ? "← " : ""}
              {b.item.kind === "circuit" ? b.item.name : <strong>{b.item.name}</strong>}
            </div>
          ))}
          </div>
        </div>
      ))}

      <div className="legend" aria-label="Legend">
        {sports.map((s) => (
          <span className="chip" key={s.sport}>
            <span className="dot" style={{ background: s.colour }}></span>
            {s.sport}
          </span>
        ))}
        <span className="chip champ">Bold = Championship or the Games</span>
      </div>
      {feed ? (
        <p className="note subscribe">
          <a href={feed.replace(/^https?:/, "webcal:")}>Subscribe in your calendar app</a>
          <span className="sub">
            {" "}
            or add this address by URL: <code>{feed}</code>. Keep it to yourself: anyone with it can read the calendar.
          </span>
        </p>
      ) : null}

      <h2>This month</h2>
      {list.length > 0 ? (
        <table>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="when">{formatDayRange(c.startDate, c.endDate)}</td>
                <td>
                  <span className="dot" style={{ background: c.colour }}></span>
                  {c.kind === "circuit" ? c.name : <b>{c.name}</b>}
                  <div className="sub">{`${c.sport} · ${participationText(c)}`}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">No competitions with a Belgian Participation this month.</p>
      )}
    </>
  );
}
