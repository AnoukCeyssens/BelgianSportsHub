import { asc } from "drizzle-orm";
import { Link } from "react-router";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import type { Route } from "./+types/athletes";

export function meta() {
  return [{ title: "Athletes · BelgianSportsHub" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const athletes = await dbFrom(context)
    .select({ id: schema.athlete.id, name: schema.athlete.name, sport: schema.athlete.sport })
    .from(schema.athlete)
    .orderBy(asc(schema.athlete.name));
  return { athletes };
}

export default function Athletes({ loaderData }: Route.ComponentProps) {
  const { athletes } = loaderData;
  return (
    <>
      <h1>Athletes</h1>
      <h2>Roster</h2>
      {athletes.length === 0 ? (
        <p className="sub">No Athletes yet.</p>
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
