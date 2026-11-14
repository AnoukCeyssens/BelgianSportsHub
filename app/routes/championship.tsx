import { Link } from "react-router";
import { participationsBetween, participationText } from "~/calendar/participations";
import { sportColour } from "~/calendar/sport-colours";
import { now } from "~/clock";
import { currentPhasesOf } from "~/competition/phase-inputs";
import { dbFrom } from "~/context";
import { belgianDate, PHASE_LABELS } from "~/domain";
import { formatDayRange } from "~/format";
import type { Route } from "./+types/championship";

// Spec #20, stories 41, 53 and 54; ticket #31. The Championship tab lists the
// Championships that have not ended yet and have a confirmed or likely
// Belgian Participation, soonest first, each with its current Phase.

/** How far ahead the list looks: the next two Olympic cycles' worth of title events. */
const LOOK_AHEAD_YEARS = 4;

export function meta() {
  return [{ title: "Championship · BelgianSportsHub" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const at = now();
  const today = belgianDate(at);
  const until = `${Number(today.slice(0, 4)) + LOOK_AHEAD_YEARS}${today.slice(4)}`;
  const championships = (await participationsBetween(db, today, until)).filter(
    (c) => c.kind === "championship" && c.participation.status !== "none",
  );
  const phases = await currentPhasesOf(
    db,
    championships.map((c) => c.id),
    at,
  );
  return {
    year: today.slice(0, 4),
    championships: championships.map((c) => ({
      id: c.id,
      name: c.name,
      sport: c.sport,
      startDate: c.startDate,
      endDate: c.endDate,
      colour: sportColour(c.sport),
      participation: participationText(c),
      phase: PHASE_LABELS[phases.get(c.id)!],
    })),
  };
}

export default function Championship({ loaderData }: Route.ComponentProps) {
  const { year, championships } = loaderData;
  return (
    <>
      <h1>Championship</h1>
      <p className="meta">Upcoming Europeans and Worlds with a Belgian Participation.</p>
      {championships.length > 0 ? (
        <table aria-label="Upcoming Championships">
          <tbody>
            {championships.map((c) => (
              <tr key={c.id}>
                <td className="when">
                  {formatDayRange(c.startDate, c.endDate)}
                  {c.endDate.slice(0, 4) !== year ? ` ${c.endDate.slice(0, 4)}` : null}
                </td>
                <td>
                  <span className="dot" style={{ background: c.colour }}></span>
                  <Link to={`/championship/${c.id}`}>
                    <b>{c.name}</b>
                  </Link>
                  <div className="sub">{`${c.sport} · ${c.participation} · ${c.phase}`}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">No upcoming Championship with a Belgian Participation.</p>
      )}
    </>
  );
}
