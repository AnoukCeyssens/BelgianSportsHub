import { Fragment } from "react";
import { eq } from "drizzle-orm";
import { data } from "react-router";
import { dbFrom } from "~/context";
import { EXTERNAL_ID_LINKS, EXTERNAL_ID_SCHEMES, schema } from "~/db/client";
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
  return { athlete, externalIds: sortedExternalIds(externalIds) };
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

/** "19 Aug 1994" from "1994-08-19". */
function formatDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2014 (European Championships)": the year of the first senior international performance, and where. */
function athleteSince(isoDate: string, competition: string | null) {
  const year = isoDate.slice(0, 4);
  return competition ? `${year} (${competition})` : year;
}

export default function Athlete({ loaderData }: Route.ComponentProps) {
  const { athlete, externalIds } = loaderData;
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

      <h2>Results</h2>
      <p className="sub">No results yet.</p>
    </>
  );
}
