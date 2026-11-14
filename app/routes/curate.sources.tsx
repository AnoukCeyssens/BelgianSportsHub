import { asc, eq } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { now } from "~/clock";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import type { SourceTier } from "~/domain";
import { SPORT_LIST_ID, SportOptions, typedSport } from "~/curate/sport-field";
import { SOURCE_ADAPTERS } from "~/ingest/sources";
import type { Route } from "./+types/curate.sources";

// Owner-only (under /curate); #20 review, finding B. Every Source is a row of
// data (conventions "Sources and adapters"): the owner lists them, adds an
// Assisted or Manual one, and edits any one's tier, cadence, sport, ID scheme,
// URL and notes here, without a deploy. Health and "Fetch now" stay in the Run
// sheet's Source health step. `/curate/sources` lists and adds;
// `/curate/sources/:key` edits one.

export function meta() {
  return [{ title: "Sources · BelgianSportsHub" }];
}

const TIERS: Record<SourceTier, string> = { automatic: "Automatic", assisted: "Assisted", manual: "Manual" };
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loader({ context, params }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const sources = await db.select().from(schema.source).orderBy(asc(schema.source.name));
  const editing = params.key ? sources.find((s) => s.key === params.key) : undefined;
  if (params.key && !editing) throw data("No such source", { status: 404 });
  return {
    sources: sources.map((s) => ({ key: s.key, name: s.name, tier: s.tier as SourceTier, cadenceDays: s.cadenceDays, sport: s.sport, idScheme: s.idScheme, url: s.url, notes: s.notes })),
    editing: editing?.key ?? null,
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const refuse = (message: string): never => {
    throw data(message, { status: 400 });
  };

  const tier = field("tier") as SourceTier;
  if (!(tier in TIERS)) refuse("Tier is Automatic, Assisted or Manual");
  const cadenceDays = Number(field("cadenceDays"));
  if (!Number.isInteger(cadenceDays) || cadenceDays < 1) refuse("Cadence is a whole number of days, at least 1");
  const sport = field("sport") ? typedSport(field("sport")) : null;
  const idScheme = field("idScheme") || null;
  if (idScheme !== null && !KEY.test(idScheme)) refuse("The ID scheme is lower-case words joined by hyphens, e.g. world-climbing");
  const url = field("url");
  if (!/^https?:\/\/\S+$/.test(url)) refuse("The URL starts with http:// or https://");
  const notes = field("notes") || null;
  const name = field("name");
  if (!name) refuse("Name the source");

  const db = dbFrom(context);
  const key = params.key ?? field("key");
  // Only a source with an adapter can be fetched automatically.
  if (tier === "automatic" && !SOURCE_ADAPTERS[key]) refuse(`${name} has no adapter: it can be Assisted or Manual`);
  const values = { name, tier, cadenceDays, sport, idScheme, url, notes };

  if (params.key) {
    const existing = await db.query.source.findFirst({ where: eq(schema.source.key, key) });
    if (!existing) throw data("No such source", { status: 404 });
    await db.update(schema.source).set(values).where(eq(schema.source.key, key));
  } else {
    if (!KEY.test(key)) refuse("The key is lower-case words joined by hyphens, e.g. world-climbing");
    const existing = await db.query.source.findFirst({ where: eq(schema.source.key, key) });
    if (existing) refuse(`There is already a source ${key}`);
    await db.insert(schema.source).values({ key, ...values, addedAt: now().toISOString() });
  }
  return redirect("/curate/sources", 303);
}

type SourceRow = Route.ComponentProps["loaderData"]["sources"][number];

export default function Sources({ loaderData }: Route.ComponentProps) {
  const { sources, editing } = loaderData;
  const source = sources.find((s) => s.key === editing);
  if (source) {
    return (
      <>
        <h1>{`Edit ${source.name}`}</h1>
        <p className="meta">
          <Link to="/curate/sources">All sources</Link> · key {source.key}
        </p>
        <SourceForm source={source} />
      </>
    );
  }
  return (
    <>
      <h1>Sources</h1>
      <p className="meta">
        Where each sport's data comes from. Health, failures and "Fetch now" are in the Run sheet's{" "}
        <Link to="/curate/run/source-health">Source health</Link> step.
      </p>
      <table aria-label="Sources">
        <thead>
          <tr>
            <th>Source</th>
            <th>Tier</th>
            <th>Every</th>
            <th>Sport</th>
            <th>ID scheme</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.key}>
              <td>
                {s.url ? <a href={s.url}>{s.name}</a> : s.name}
              </td>
              <td>{TIERS[s.tier]}</td>
              <td>{s.cadenceDays === 1 ? "day" : `${s.cadenceDays} days`}</td>
              <td>{s.sport ?? "several"}</td>
              <td>{s.idScheme ?? s.key}</td>
              <td className="sub">{s.notes ?? ""}</td>
              <td>
                <Link to={`/curate/sources/${s.key}`} aria-label={`Edit ${s.name}`}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Add a source</h2>
      <p className="sub">An Assisted source's tables come in through the paste importer; a Manual one's results are typed by hand.</p>
      <SourceForm source={null} />
    </>
  );
}

function SourceForm({ source }: { source: SourceRow | null }) {
  return (
    <Form method="post" className="standards-form" aria-label={source ? `Edit ${source.name}` : "Add a source"}>
      {source ? null : (
        <label>
          Key
          <input name="key" required placeholder="e.g. world-climbing" />
        </label>
      )}
      <label>
        Name
        <input name="name" required defaultValue={source?.name ?? ""} />
      </label>
      <label>
        Tier
        <select name="tier" defaultValue={source?.tier ?? "assisted"}>
          {(Object.keys(TIERS) as SourceTier[]).map((t) => (
            <option key={t} value={t}>
              {TIERS[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cadence (days)
        <input name="cadenceDays" type="number" min={1} required defaultValue={source?.cadenceDays ?? 7} />
      </label>
      <label>
        Sport (empty when it spans several)
        <input name="sport" list={SPORT_LIST_ID} defaultValue={source?.sport ?? ""} />
        <SportOptions />
      </label>
      <label>
        ID scheme
        <input name="idScheme" defaultValue={source?.idScheme ?? ""} placeholder="the key when empty" />
      </label>
      <label>
        URL
        <input name="url" type="url" required defaultValue={source?.url ?? ""} />
      </label>
      <label>
        Notes
        <textarea name="notes" defaultValue={source?.notes ?? ""} />
      </label>
      <button type="submit">{source ? "Save source" : "Add source"}</button>
    </Form>
  );
}
