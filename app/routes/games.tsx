import { asc, eq } from "drizzle-orm";
import { data, Link } from "react-router";
import { sportColour } from "~/calendar/sport-colours";
import { now } from "~/clock";
import { PhaseBar } from "~/competition/phase-bar";
import { gamesPhaseInputs } from "~/competition/phase-inputs";
import { loadPhasePanel, PhasePanel } from "~/competition/phase-panels";
import { cloudflareContext, dbFrom } from "~/context";
import { schema } from "~/db/client";
import { belgianDate, chosenSports, combinedPhaseInputs, currentPhase, PHASE_LABELS, PHASES, phaseToShow, toggledSports, type Phase } from "~/domain";
import { formatDayRange } from "~/format";
import { isOwner } from "~/owner";
import type { Route } from "./+types/games";

// Spec #20, stories 41–43, 49 and 50; ticket #35. The Games tab (`/games`)
// opens the next Games (LA 2028, then French Alps 2030); `/games/:id` shows a
// given one. The same Phase bar and panels as a Championship, plus
// combinable sport chips (`?sport=A,B`, All sports by default) that filter
// every phase. Each sport is in its own phase: with chips chosen, the page
// opens on the phase of those sports together; with All sports, on the Games'
// own phase (Live from the first day in any sport, After once the last sport
// has ended).

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.games?.name ?? "Games"} · BelgianSportsHub` }];
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const at = now();
  const c = schema.competition;
  const all = await db.select().from(c).where(eq(c.kind, "games")).orderBy(asc(c.startDate));
  const upcoming = all.filter((g) => g.endDate >= belgianDate(at));
  const games = params.competitionId ? all.find((g) => g.id === params.competitionId) : upcoming[0];
  if (params.competitionId && !games) throw data("No such Games", { status: 404 });
  const others = upcoming.filter((g) => g.id !== games?.id).map((g) => ({ id: g.id, name: g.name }));
  if (!games) return { games: null, others };

  const search = new URL(request.url).searchParams;
  const { whole, sports } = await gamesPhaseInputs(db, games);
  const names = sports.map((s) => s.sport);
  const chosen = chosenSports(search.get("sport"), names);
  const inView = chosen.length > 0 ? sports.filter((s) => chosen.includes(s.sport)) : sports;
  const current = currentPhase(chosen.length > 0 ? combinedPhaseInputs(inView.map((s) => s.inputs)) : whole, at);
  const shown = phaseToShow(search.get("phase"), current);

  const base = `/games/${games.id}`;
  const withQuery = (sport: string | null, phase: Phase | null, day: string | null = null) => {
    const query = new URLSearchParams();
    if (sport) query.set("sport", sport);
    if (phase) query.set("phase", phase);
    if (day) query.set("day", day);
    return query.size > 0 ? `${base}?${query}` : base;
  };
  const chosenQuery = chosen.length > 0 ? chosen.join(",") : null;
  return {
    games: {
      id: games.id,
      name: games.name,
      city: games.city,
      startDate: games.startDate,
      endDate: games.endDate,
    },
    others,
    current,
    shown,
    // A Live day's link: `{day}` stands for its date.
    dayHref: withQuery(chosenQuery, shown === current ? null : shown, "{day}"),
    phaseHrefs: Object.fromEntries(PHASES.map((p) => [p, withQuery(chosenQuery, p === current ? null : p)])) as Record<Phase, string>,
    chips: [
      { sport: "All sports", on: chosen.length === 0, href: base, colour: null },
      ...names.map((sport) => ({
        sport,
        on: chosen.includes(sport),
        href: withQuery(toggledSports(chosen, sport, names), null),
        colour: sportColour(sport),
      })),
    ],
    sports: inView.map((s) => ({
      sport: s.sport,
      days: formatDayRange(s.firstDay, s.lastDay),
      phase: PHASE_LABELS[currentPhase(s.inputs, at)],
      colour: sportColour(s.sport),
    })),
    panel: await loadPhasePanel(db, games, shown, at, { sports: names, chosen }, search.get("day")),
    owner: isOwner(request, context.get(cloudflareContext).env),
  };
}

export default function Games({ loaderData }: Route.ComponentProps) {
  if (!loaderData.games) {
    return (
      <>
        <h1>Games</h1>
        <p className="meta">LA 2028 and French Alps 2030, phase by phase.</p>
        <p className="sub">No Games dates recorded yet.</p>
      </>
    );
  }
  const { games, others, current, shown, phaseHrefs, dayHref, chips, sports, panel, owner } = loaderData;
  return (
    <>
      <h1>{games.name}</h1>
      <p className="meta">{[games.city, `${formatDayRange(games.startDate, games.endDate)} ${games.endDate.slice(0, 4)}`].filter(Boolean).join(" · ")}</p>
      {others.length > 0 ? (
        <p className="sub">
          {"Also: "}
          {others.map((o, i) => (
            <span key={o.id}>
              {i > 0 ? " · " : null}
              <Link to={`/games/${o.id}`}>{o.name}</Link>
            </span>
          ))}
        </p>
      ) : null}
      <PhaseBar current={current} shown={shown} href={(phase) => phaseHrefs[phase]} />
      {chips.length > 1 ? (
        <nav className="chips" aria-label="Sports">
          {chips.map((chip) => (
            <Link key={chip.sport} to={chip.href} className={chip.on ? "chip on" : "chip"} aria-pressed={chip.on}>
              {chip.colour ? <span className="dot" style={{ background: chip.colour }}></span> : null}
              {chip.sport}
            </Link>
          ))}
        </nav>
      ) : null}
      {sports.length > 0 ? (
        <table aria-label="Sports by phase">
          <tbody>
            {sports.map((s) => (
              <tr key={s.sport}>
                <td>
                  <span className="dot" style={{ background: s.colour }}></span>
                  {s.sport}
                </td>
                <td className="when">{s.days}</td>
                <td className="n">{s.phase}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <PhasePanel data={panel} dayHref={(day) => dayHref.replace(encodeURIComponent("{day}"), day)} />
      {owner && (shown === "standards" || shown === "qualification") ? (
        <p className="sub">
          <Link to={`/curate/games/${games.id}/standards`}>Record standards</Link>
        </p>
      ) : null}
    </>
  );
}
