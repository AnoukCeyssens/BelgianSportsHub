import { Fragment } from "react";
import { desc, eq } from "drizzle-orm";
import { data, Link } from "react-router";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import { belgiumMedals } from "~/domain";
import { formatDate, formatDay, medalsText, placeText } from "~/format";
import type { Route } from "./+types/team";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.team.name ?? "Team"} · BelgianSportsHub` }];
}

// A Team's page (ADR 0001; spec #20 stories 12, 13 and 33): its results, each
// with the roster the official result or squad list credits at that competition.
export async function loader({ context, params }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const team = await db.query.team.findFirst({ where: eq(schema.team.id, params.teamId) });
  if (!team) throw data("No such Team", { status: 404 });
  const competition = schema.competition;
  const results = await db
    .select({
      id: schema.result.id,
      date: schema.result.date,
      event: schema.result.event,
      place: schema.result.place,
      status: schema.result.status,
      performance: schema.result.performance,
      competitionId: competition.id,
      competition: competition.name,
      kind: competition.kind,
    })
    .from(schema.result)
    .innerJoin(competition, eq(schema.result.competitionId, competition.id))
    .where(eq(schema.result.teamId, team.id))
    .orderBy(desc(schema.result.date), schema.result.event);
  const roster = schema.rosterMember;
  const members = await db
    .select({
      competitionId: roster.competitionId,
      athleteId: schema.athlete.id,
      athlete: schema.athlete.name,
      queued: schema.mergeQueueItem.name,
    })
    .from(roster)
    .leftJoin(schema.athlete, eq(roster.athleteId, schema.athlete.id))
    .leftJoin(schema.mergeQueueItem, eq(roster.mergeQueueItemId, schema.mergeQueueItem.id))
    .where(eq(roster.teamId, team.id));
  const rosterAt = (competitionId: string) =>
    members
      .filter((m) => m.competitionId === competitionId)
      .map((m) => ({ athleteId: m.athleteId, name: m.athlete ?? m.queued ?? "" }))
      .toSorted((a, b) => a.name.localeCompare(b.name));
  const medals = belgiumMedals(
    results.map((r) => ({
      competitionId: r.competitionId,
      competitionKind: r.kind,
      event: r.event,
      place: r.place,
      status: r.status,
      entry: { kind: "team" as const, teamId: team.id, roster: [] },
    })),
  );
  return {
    team,
    medals: medalsText(medals),
    results: results.map((r) => ({ ...r, roster: rosterAt(r.competitionId) })),
  };
}

/** Championships and the Games stand out in bold. */
function CompetitionName({ name, kind }: { name: string; kind: string }) {
  return kind === "circuit" ? <>{name}</> : <b>{name}</b>;
}

export default function Team({ loaderData }: Route.ComponentProps) {
  const { team, medals, results } = loaderData;
  const facts = [
    team.sport,
    team.event,
    team.kind === "partnership" ? "Partnership" : null,
    team.dissolvedOn ? `dissolved ${formatDate(team.dissolvedOn)}` : null,
  ].filter(Boolean);
  return (
    <>
      <h1>{team.name}</h1>
      <div className="meta">{facts.join(" · ")}</div>
      {medals ? <div className="sub">{medals}</div> : null}

      <h2>Results</h2>
      {results.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Competition</th>
              <th className="n">Place</th>
              <th className="n">Performance</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>
                  {formatDay(r.date)}
                  <div className="sub">{r.date.slice(0, 4)}</div>
                </td>
                <td>
                  <CompetitionName name={r.competition} kind={r.kind} />
                  <div className="sub">{r.event}</div>
                  {r.roster.length > 0 ? (
                    <div className="sub">
                      {r.roster.map((m, i) => (
                        <Fragment key={`${m.athleteId ?? ""}-${m.name}`}>
                          {i > 0 ? ", " : null}
                          {m.athleteId ? <Link to={`/athletes/${m.athleteId}`}>{m.name}</Link> : m.name}
                        </Fragment>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="n">
                  <b>{placeText(r.place, r.status)}</b>
                </td>
                <td className="n">{r.performance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">No results yet.</p>
      )}
    </>
  );
}
