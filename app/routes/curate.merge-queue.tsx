import { asc, eq } from "drizzle-orm";
import { Form, redirect } from "react-router";
import { cloudflareContext, dbFrom } from "~/context";
import { EXTERNAL_ID_SCHEMES, schema } from "~/db/client";
import { normaliseName } from "~/domain";
import { formatDate } from "~/format";
import { resolveMergeQueueItem, type Resolution } from "~/ingest/merge-queue";
import type { Route } from "./+types/curate.merge-queue";

// Owner-only (under /curate). Spec #20, stories 4 and 6: identities that
// ingest could not match wait here until the owner links them to an Athlete,
// creates a new Athlete, or marks them "not an Athlete". The Run sheet (#24)
// builds its Merge queue step on resolveMergeQueueItem().

export function meta() {
  return [{ title: "Merge queue · BelgianSportsHub" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const [items, athletes] = await Promise.all([
    db.select().from(schema.mergeQueueItem).where(eq(schema.mergeQueueItem.status, "open")).orderBy(asc(schema.mergeQueueItem.createdAt)),
    db
      .select({ id: schema.athlete.id, name: schema.athlete.name, sport: schema.athlete.sport, dateOfBirth: schema.athlete.dateOfBirth })
      .from(schema.athlete)
      .orderBy(asc(schema.athlete.name)),
  ]);
  return {
    items: items.map((item) => {
      // Candidates: Athletes sharing a name part or the date of birth.
      const parts = new Set(normaliseName(item.name).split(" "));
      const candidates = athletes.filter(
        (a) =>
          (item.dateOfBirth !== null && a.dateOfBirth === item.dateOfBirth) ||
          normaliseName(a.name)
            .split(" ")
            .some((p) => parts.has(p)),
      );
      return { ...item, candidates };
    }),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const form = await request.formData();
  const itemId = String(form.get("item"));
  const kind = String(form.get("resolution"));
  const resolution: Resolution =
    kind === "link" ? { kind: "link", athleteId: String(form.get("athlete")) } : kind === "create" ? { kind: "create" } : { kind: "not-an-athlete" };
  await resolveMergeQueueItem(context.get(cloudflareContext).env.DB, itemId, resolution);
  return redirect("/curate/merge-queue", 303);
}

export default function MergeQueue({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  return (
    <>
      <h1>Merge queue</h1>
      <p className="meta">Incoming identities that match no Athlete. Link each one, create an Athlete, or mark it not an Athlete.</p>
      {items.length === 0 ? (
        <p className="sub">Nothing to resolve.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Incoming</th>
              <th>Resolve</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <b>{item.name}</b>
                  <div className="sub">
                    {[
                      item.sport,
                      item.dateOfBirth ? `born ${formatDate(item.dateOfBirth)}` : null,
                      `${EXTERNAL_ID_SCHEMES[item.scheme as keyof typeof EXTERNAL_ID_SCHEMES] ?? item.scheme} ${item.value}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </td>
                <td>
                  {item.candidates.length > 0 ? (
                    <Form method="post">
                      <input type="hidden" name="item" value={item.id} />
                      <input type="hidden" name="resolution" value="link" />
                      <select name="athlete" aria-label={`Athlete to link ${item.name} to`}>
                        {item.candidates.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.dateOfBirth ? ` (${formatDate(a.dateOfBirth)})` : ""} · {a.sport}
                          </option>
                        ))}
                      </select>{" "}
                      <button type="submit">Link</button>
                    </Form>
                  ) : null}
                  <Form method="post">
                    <input type="hidden" name="item" value={item.id} />
                    <button type="submit" name="resolution" value="create">
                      Create Athlete
                    </button>{" "}
                    <button type="submit" name="resolution" value="not-an-athlete">
                      Not an Athlete
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
