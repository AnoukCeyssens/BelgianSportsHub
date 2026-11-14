import { Fragment } from "react";
import { and, asc, eq, gte } from "drizzle-orm";
import { data, Link } from "react-router";
import { now } from "~/clock";
import { dbFrom } from "~/context";
import { DERIVED_ID_SCHEMES, EXTERNAL_ID_LINKS, EXTERNAL_ID_SCHEMES, isExternalIdScheme, schema } from "~/db/client";
import { athleteMedals, BELGIAN_ZONE } from "~/domain";
import { formatDate, formatDay, medalsText, placeText } from "~/format";
import { activeFactsOf, activeStatuses } from "~/roster/active";
import { ActiveStatusLine, factBehind } from "~/roster/status-line";
import { qualificationOf, type TargetKey } from "~/qualification/entries";
import { QualificationSection } from "~/qualification/qualification-section";
import type { Route } from "./+types/athlete";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.athlete.name ?? "Athlete"} · BelgianSportsHub` }];
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const athlete = await db.query.athlete.findFirst({ where: eq(schema.athlete.id, params.athleteId) });
  if (!athlete) throw data("No such Athlete", { status: 404 });
  const externalIds = await db
    .select({ scheme: schema.athleteExternalId.scheme, value: schema.athleteExternalId.value })
    .from(schema.athleteExternalId)
    .where(eq(schema.athleteExternalId.athleteId, athlete.id));
  const competition = schema.competition;
  const columns = {
    date: schema.result.date,
    event: schema.result.event,
    place: schema.result.place,
    status: schema.result.status,
    performance: schema.result.performance,
    competitionId: competition.id,
    competition: competition.name,
    kind: competition.kind,
  };
  const own = await db
    .select(columns)
    .from(schema.result)
    .innerJoin(competition, eq(schema.result.competitionId, competition.id))
    .where(eq(schema.result.athleteId, athlete.id));
  // Team results: every result of a Team whose roster at that competition credits the Athlete.
  const roster = schema.rosterMember;
  const asTeam = await db
    .selectDistinct({ ...columns, teamId: schema.team.id, team: schema.team.name })
    .from(roster)
    .innerJoin(schema.result, and(eq(schema.result.teamId, roster.teamId), eq(schema.result.competitionId, roster.competitionId)))
    .innerJoin(schema.team, eq(schema.team.id, roster.teamId))
    .innerJoin(competition, eq(schema.result.competitionId, competition.id))
    .where(eq(roster.athleteId, athlete.id));
  const results = [...own.map((r) => ({ ...r, teamId: null, team: null })), ...asTeam].toSorted(
    (a, b) => b.date.localeCompare(a.date) || a.event.localeCompare(b.event),
  );
  const medals = athleteMedals(
    results.map((r) => ({
      competitionId: r.competitionId,
      competitionKind: r.kind,
      event: r.event,
      place: r.place,
      status: r.status,
      entry: r.teamId ? { kind: "team" as const, teamId: r.teamId, roster: [athlete.id] } : { kind: "athlete" as const, athleteId: athlete.id },
    })),
    athlete.id,
  );
  // Upcoming: competitions not over yet (in Belgium) whose entry list names the Athlete.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BELGIAN_ZONE }).format(now());
  const upcoming = await db
    .select({
      startDate: competition.startDate,
      endDate: competition.endDate,
      competition: competition.name,
      kind: competition.kind,
      city: competition.city,
    })
    .from(schema.entrant)
    .innerJoin(competition, eq(schema.entrant.competitionId, competition.id))
    .where(and(eq(schema.entrant.athleteId, athlete.id), gte(competition.endDate, today)))
    .orderBy(asc(competition.startDate));
  const status = (await activeStatuses(db, now(), { athleteIds: [athlete.id] })).athletes.get(athlete.id)!;
  const fact = factBehind(status, await activeFactsOf(db, { athleteId: athlete.id }));
  const target: TargetKey = new URL(request.url).searchParams.get("target") === "championship" ? "championship" : "olympics";
  const qualification = await qualificationOf(db, { athleteId: athlete.id, sport: athlete.sport }, now());
  return { athlete, externalIds: sortedExternalIds(externalIds), results, upcoming, medals: medalsText(medals), status, fact, target, qualification };
}

const SCHEME_ORDER = Object.keys(EXTERNAL_ID_SCHEMES);
/** The Athlete's IDs a reader can look up, in display order; derived matching keys (UCI name + date of birth) are left out. */
function sortedExternalIds(ids: { scheme: string; value: string }[]) {
  const rank = (s: string) => (SCHEME_ORDER.includes(s) ? SCHEME_ORDER.indexOf(s) : SCHEME_ORDER.length);
  return ids
    .filter((x) => !(isExternalIdScheme(x.scheme) && DERIVED_ID_SCHEMES.has(x.scheme)))
    .toSorted((a, b) => rank(a.scheme) - rank(b.scheme) || a.scheme.localeCompare(b.scheme))
    .map((x) => ({
      label: isExternalIdScheme(x.scheme) ? EXTERNAL_ID_SCHEMES[x.scheme] : x.scheme,
      value: x.value,
      href: (isExternalIdScheme(x.scheme) ? EXTERNAL_ID_LINKS[x.scheme] : undefined)?.replace("$1", encodeURIComponent(x.value)) ?? null,
    }));
}

/** Championships and the Games stand out in bold. */
function CompetitionName({ name, kind }: { name: string; kind: string }) {
  return kind === "circuit" ? <>{name}</> : <b>{name}</b>;
}

/** "2014 (European Championships)": the year of the first senior international performance, and where. */
function athleteSince(isoDate: string, competition: string | null) {
  const year = isoDate.slice(0, 4);
  return competition ? `${year} (${competition})` : year;
}

export default function Athlete({ loaderData }: Route.ComponentProps) {
  const { athlete, externalIds, results, upcoming, medals, status, fact, target, qualification } = loaderData;
  const facts = [
    athlete.sport,
    athlete.dateOfBirth ? `born ${formatDate(athlete.dateOfBirth)}` : null,
    athlete.athleteSince ? `Athlete since ${athleteSince(athlete.athleteSince, athlete.athleteSinceCompetition)}` : null,
  ].filter(Boolean);
  return (
    <>
      <h1>{athlete.name}</h1>
      <div className="meta">{facts.join(" · ")}</div>
      {externalIds.length > 0 ? (
        <div className="sub">
          {externalIds.map((x, i) => (
            <Fragment key={`${x.label}-${x.value}`}>
              {i > 0 ? " · " : null}
              {x.href ? <a href={x.href}>{`${x.label} ${x.value}`}</a> : `${x.label} ${x.value}`}
            </Fragment>
          ))}
        </div>
      ) : null}
      {medals ? <div className="sub">{medals}</div> : null}
      <ActiveStatusLine status={status} fact={fact} editHref={`/curate/athletes/${athlete.id}/status`} />
      {athlete.note ? <p className="note">{athlete.note}</p> : null}

      <QualificationSection
        targets={qualification}
        shown={target}
        href={(key) => (key === "olympics" ? `/athletes/${athlete.id}` : `/athletes/${athlete.id}?target=${key}`)}
      />

      <h2>Upcoming</h2>
      {upcoming.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Competition</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((u) => (
              <tr key={`${u.startDate}-${u.competition}`}>
                <td>
                  {u.endDate === u.startDate ? formatDay(u.startDate) : `${formatDay(u.startDate)}–${formatDay(u.endDate)}`}
                  <div className="sub">{u.startDate.slice(0, 4)}</div>
                </td>
                <td>
                  <CompetitionName name={u.competition} kind={u.kind} />
                  {u.city ? <div className="sub">{u.city}</div> : null}
                </td>
                <td className="sub">Entered</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">No upcoming competitions.</p>
      )}

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
              <tr key={`${r.date}-${r.competition}-${r.event}`}>
                <td>
                  {formatDay(r.date)}
                  <div className="sub">{r.date.slice(0, 4)}</div>
                </td>
                <td>
                  <CompetitionName name={r.competition} kind={r.kind} />
                  <div className="sub">
                    {r.event}
                    {r.teamId ? (
                      <>
                        {" · "}
                        <Link to={`/teams/${r.teamId}`}>{r.team}</Link>
                      </>
                    ) : null}
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
      ) : (
        <p className="sub">No results yet.</p>
      )}
    </>
  );
}
