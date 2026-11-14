import { data, Link } from "react-router";
import { sportColour } from "~/calendar/sport-colours";
import { referenceResults, type ReferenceEntry } from "~/competition/reference-games";
import { cloudflareContext, dbFrom } from "~/context";
import { REFERENCE_GAMES, TRACKED_GAMES } from "~/domain";
import { formatDay, formatDayRange, placeText } from "~/format";
import { isOwner } from "~/owner";
import type { Route } from "./+types/reference";

// Spec #20, stories 24 and 119; ticket #46. Paris 2024 and Milano-Cortina
// 2026 as read-only reference pages: Belgian results per sport, each linked
// to its Athlete (inactive ones included). History only: no Phases, so no
// qualification, Selection or Expectations.

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.games.name ?? "Reference Games"} · BelgianSportsHub` }];
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const games = REFERENCE_GAMES.find((g) => g.key === params.key);
  if (!games) throw data("No such reference Games", { status: 404 });
  return {
    games: { key: games.key, name: games.name, city: games.city, startDate: games.startDate, endDate: games.endDate },
    /** The cycle it is the baseline for. */
    next: TRACKED_GAMES.find((g) => g.series === games.series)?.name ?? null,
    others: REFERENCE_GAMES.filter((g) => g.key !== games.key).map((g) => ({ key: g.key, name: g.name })),
    sports: (await referenceResults(dbFrom(context), games)).map((s) => ({ ...s, colour: sportColour(s.sport) })),
    owner: await isOwner(request, context.get(cloudflareContext).env),
  };
}

export default function Reference({ loaderData }: Route.ComponentProps) {
  const { games, next, others, sports, owner } = loaderData;
  return (
    <>
      <h1>{games.name}</h1>
      <p className="meta">{`${games.city} · ${formatDayRange(games.startDate, games.endDate)} ${games.endDate.slice(0, 4)} · Reference`}</p>
      <p className="sub">
        {`Belgian results, kept as history${next ? ` and as the baseline for the ${next} cycle` : ""}.`}
        {others.map((o) => (
          <span key={o.key}>
            {" Also: "}
            <Link to={`/reference/${o.key}`}>{o.name}</Link>
          </span>
        ))}
      </p>
      {sports.length === 0 ? <p className="sub">No Belgian results recorded yet.</p> : null}
      {sports.map((s) => (
        <section key={s.sport} className="sport" aria-label={s.sport}>
          <h2>
            <span className="dot" style={{ background: s.colour }}></span>
            {s.sport}
          </h2>
          <table>
            <tbody>
              {s.results.map((r) => (
                <tr key={`${r.event}-${r.entry.kind}-${r.entry.id}`}>
                  <td className="when">{formatDay(r.date)}</td>
                  <td>
                    {r.event}
                    <div className="sub">
                      <Entry entry={r.entry} />
                    </div>
                  </td>
                  <td className="n">
                    <b>{placeText(r.place, r.status)}</b>
                  </td>
                  <td className="n">{r.performance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {owner ? (
        <p className="sub">
          <Link to={`/curate/reference/${games.key}`}>Enter a result by hand</Link>
        </p>
      ) : null}
    </>
  );
}

/** An Athlete, or a Team followed by the Athletes its result credits; each links to its page. */
function Entry({ entry }: { entry: ReferenceEntry }) {
  if (entry.kind === "athlete") return <Link to={`/athletes/${entry.id}`}>{entry.name}</Link>;
  return (
    <>
      <Link to={`/teams/${entry.id}`}>{entry.name}</Link>
      {entry.roster.map((m) => (
        <span key={m.id}>
          {" · "}
          <Link to={`/athletes/${m.id}`}>{m.name}</Link>
        </span>
      ))}
    </>
  );
}
