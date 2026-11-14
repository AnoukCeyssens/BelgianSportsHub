import { Fragment } from "react";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { data } from "react-router";
import { now } from "~/clock";
import { dbFrom } from "~/context";
import { EXTERNAL_ID_LINKS, EXTERNAL_ID_SCHEMES, schema } from "~/db/client";
import { BELGIAN_ZONE } from "~/domain";
import { formatDate, formatDay, placeText } from "~/format";
import type { Route } from "./+types/athlete";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.athlete.name ?? "Athlete"} · BelgianSportsHub` }];
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const athlete = await db.query.athlete.findFirst({ where: eq(schema.athlete.id, params.athleteId) });
  if (!athlete) throw data("No such Athlete", { status: 404 });
  const externalIds = await db
    .select({ scheme: schema.athleteExternalId.scheme, value: schema.athleteExternalId.value })
    .from(schema.athleteExternalId)
    .where(eq(schema.athleteExternalId.athleteId, athlete.id));
  const competition = schema.competition;
  const results = await db
    .select({
      date: schema.result.date,
      event: schema.result.event,
      place: schema.result.place,
      status: schema.result.status,
      performance: schema.result.performance,
      competition: competition.name,
      kind: competition.kind,
    })
    .from(schema.result)
    .innerJoin(competition, eq(schema.result.competitionId, competition.id))
    .where(eq(schema.result.athleteId, athlete.id))
    .orderBy(desc(schema.result.date), asc(schema.result.event));
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
  return { athlete, externalIds: sortedExternalIds(externalIds), results, upcoming };
}

const SCHEME_ORDER = Object.keys(EXTERNAL_ID_SCHEMES);
function sortedExternalIds(ids: { scheme: string; value: string }[]) {
  const rank = (s: string) => (SCHEME_ORDER.includes(s) ? SCHEME_ORDER.indexOf(s) : SCHEME_ORDER.length);
  return ids
    .toSorted((a, b) => rank(a.scheme) - rank(b.scheme) || a.scheme.localeCompare(b.scheme))
    .map((x) => ({
      label: EXTERNAL_ID_SCHEMES[x.scheme as keyof typeof EXTERNAL_ID_SCHEMES] ?? x.scheme,
      value: x.value,
      href: EXTERNAL_ID_LINKS[x.scheme]?.replace("$1", encodeURIComponent(x.value)) ?? null,
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
  const { athlete, externalIds, results, upcoming } = loaderData;
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
      {athlete.note ? <p className="note">{athlete.note}</p> : null}

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
                  <div className="sub">{r.event}</div>
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
