import { and, eq } from "drizzle-orm";
import { data, Link } from "react-router";
import { now } from "~/clock";
import { PhaseBar } from "~/competition/phase-bar";
import { phaseInputsFor } from "~/competition/phase-inputs";
import { loadPhasePanel, PhasePanel } from "~/competition/phase-panels";
import { cloudflareContext, dbFrom } from "~/context";
import { schema } from "~/db/client";
import { currentPhase, phaseToShow } from "~/domain";
import { formatDayRange } from "~/format";
import { isOwner } from "~/owner";
import type { Route } from "./+types/championship.$competitionId";

// Spec #20, stories 41–46; ticket #31. A Championship's page: the five-step
// Phase bar, one phase shown at a time, opening on the current phase (marked
// "now"); earlier phases stay reachable with `?phase=`. Each phase's content
// comes from app/competition/phase-panels.tsx.

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.name ?? "Championship"} · BelgianSportsHub` }];
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const c = schema.competition;
  const [competition] = await db
    .select()
    .from(c)
    .where(and(eq(c.id, params.competitionId), eq(c.kind, "championship")));
  if (!competition) throw data("No such Championship", { status: 404 });
  const at = now();
  const inputs = (await phaseInputsFor(db, [competition])).get(competition.id)!;
  const current = currentPhase(inputs, at);
  const search = new URL(request.url).searchParams;
  const shown = phaseToShow(search.get("phase"), current);
  return {
    id: competition.id,
    name: competition.name,
    sport: competition.sport,
    city: competition.city,
    startDate: competition.startDate,
    endDate: competition.endDate,
    current,
    shown,
    panel: await loadPhasePanel(db, competition, shown, at, undefined, search.get("day")),
    owner: isOwner(request, context.get(cloudflareContext).env),
  };
}

export default function ChampionshipPage({ loaderData }: Route.ComponentProps) {
  const { id, name, sport, city, startDate, endDate, current, shown, panel, owner } = loaderData;
  return (
    <>
      <h1>{name}</h1>
      <p className="meta">{[sport, city, `${formatDayRange(startDate, endDate)} ${endDate.slice(0, 4)}`].filter(Boolean).join(" · ")}</p>
      <PhaseBar current={current} shown={shown} href={(phase) => (phase === current ? `/championship/${id}` : `/championship/${id}?phase=${phase}`)} />
      <PhasePanel data={panel} dayHref={(day) => `/championship/${id}?${shown === current ? "" : `phase=${shown}&`}day=${day}`} />
      {owner && (shown === "standards" || shown === "qualification") ? (
        <p className="sub">
          <Link to={`/curate/championships/${id}/standards`}>Record standards</Link>
        </p>
      ) : null}
    </>
  );
}
