import { asc } from "drizzle-orm";
import { Form, Link } from "react-router";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import { matchesNameSearch } from "~/domain";
import type { Route } from "./+types/athletes";

export function meta() {
  return [{ title: "Athletes · BelgianSportsHub" }];
}

// Search covers every Athlete, inactive included (spec #20, story 24). The
// roster is a few thousand names at most, so matching happens here rather
// than in SQL (SQLite LIKE ignores neither accents nor word starts).
export async function loader({ context, request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const roster = await dbFrom(context)
    .select({ id: schema.athlete.id, name: schema.athlete.name, sport: schema.athlete.sport })
    .from(schema.athlete)
    .orderBy(asc(schema.athlete.name));
  return { q, athletes: roster.filter((a) => matchesNameSearch(a.name, q)), rosterSize: roster.length };
}

export default function Athletes({ loaderData }: Route.ComponentProps) {
  const { q, athletes, rosterSize } = loaderData;
  return (
    <>
      <h1>Athletes</h1>
      <Form method="get" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Search by name" aria-label="Search Athletes by name" />
      </Form>
      <h2>Roster</h2>
      {athletes.length === 0 ? (
        <p className="sub">{rosterSize === 0 ? "No Athletes yet." : `No Athlete matches “${q}”.`}</p>
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
                <td className="meta">{a.sport}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
