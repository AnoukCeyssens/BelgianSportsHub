import { asc } from "drizzle-orm";
import { Form, Link } from "react-router";
import { now } from "~/clock";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import { matchesNameSearch } from "~/domain";
import { activeStatuses } from "~/roster/active";
import type { Route } from "./+types/athletes";

export function meta() {
  return [{ title: "Athletes · BelgianSportsHub" }];
}

// Without a search the list shows Active Athletes and Teams only (story 17);
// search covers every Athlete and Team, inactive included (story 24). The
// roster is a few thousand names at most, so matching happens here rather
// than in SQL (SQLite LIKE ignores neither accents nor word starts).
export async function loader({ context, request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const db = dbFrom(context);
  const [roster, teams, statuses] = await Promise.all([
    db
      .select({ id: schema.athlete.id, name: schema.athlete.name, sport: schema.athlete.sport })
      .from(schema.athlete)
      .orderBy(asc(schema.athlete.name)),
    db.select({ id: schema.team.id, name: schema.team.name, sport: schema.team.sport }).from(schema.team).orderBy(asc(schema.team.name)),
    activeStatuses(db, now()),
  ]);
  const shown = <T extends { id: string; name: string }>(rows: T[], active: Map<string, { active: boolean }>) =>
    rows
      .map((row) => ({ ...row, active: active.get(row.id)?.active ?? false }))
      .filter((row) => (q ? matchesNameSearch(row.name, q) : row.active));
  return {
    q,
    athletes: shown(roster, statuses.athletes),
    rosterSize: roster.length,
    teams: shown(teams, statuses.teams),
  };
}

export default function Athletes({ loaderData }: Route.ComponentProps) {
  const { q, athletes, rosterSize, teams } = loaderData;
  return (
    <>
      <h1>Athletes</h1>
      <Form method="get" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Search by name" aria-label="Search Athletes and Teams by name" />
      </Form>
      <h2>Roster</h2>
      {q ? null : <p className="sub">Active only; search to find inactive Athletes and Teams.</p>}
      {athletes.length === 0 ? (
        <p className="sub">{rosterSize === 0 ? "No Athletes yet." : q ? `No Athlete matches “${q}”.` : "No Active Athletes."}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Athlete</th>
              <th>Sport</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/athletes/${a.id}`}>{a.name}</Link>
                </td>
                <td className="meta">{a.active ? a.sport : `${a.sport} · inactive`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {teams.length > 0 ? (
        <>
          <h2>Teams</h2>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Sport</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/teams/${t.id}`}>{t.name}</Link>
                  </td>
                  <td className="meta">{t.active ? t.sport : `${t.sport} · inactive`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}
