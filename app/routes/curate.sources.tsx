import { asc, eq } from "drizzle-orm";
import { Form, redirect } from "react-router";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import { schema } from "~/db/client";
import { sourceHealth, type SourceTier } from "~/domain";
import { formatInstant } from "~/format";
import type { IngestJob } from "~/ingest/queue";
import type { Route } from "./+types/curate.sources";

// Owner-only (under /curate). Spec #20, story 97: one health row per source,
// so silent breakage is visible. "Fetch now" queues one run straight away
// (also clearing a block, i.e. retrying). The Run sheet's Source health step
// (#24) adds the action cards.

export function meta() {
  return [{ title: "Sources · BelgianSportsHub" }];
}

const TIER_LABEL: Record<SourceTier, string> = { automatic: "Automatic", assisted: "Assisted", manual: "Manual" };

export async function loader({ context, request }: Route.LoaderArgs) {
  const sources = await dbFrom(context).select().from(schema.source).orderBy(asc(schema.source.name));
  const at = now();
  return {
    queued: new URL(request.url).searchParams.get("queued"),
    sources: sources.map((s) => ({ ...s, health: sourceHealth({ ...s, tier: s.tier as SourceTier }, at) })),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const key = String((await request.formData()).get("source"));
  const { env } = context.get(cloudflareContext);
  await dbFrom(context).update(schema.source).set({ blockedAt: null, blockedReason: null }).where(eq(schema.source.key, key));
  const job: IngestJob = { kind: "fetch-source", source: key };
  await env.INGEST.send(job);
  return redirect(`/curate/sources?queued=${encodeURIComponent(key)}`, 303);
}

export default function Sources({ loaderData }: Route.ComponentProps) {
  const { sources, queued } = loaderData;
  return (
    <>
      <h1>Sources</h1>
      <p className="meta">Every source with its tier, cadence and health. A source is stale after missing twice its cadence.</p>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Tier</th>
            <th>Last fetched</th>
            <th>Last change</th>
            <th>Health</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.key}>
              <td>
                {s.name}
                <div className="sub">every {s.cadenceDays === 1 ? "day" : `${s.cadenceDays} days`}</div>
              </td>
              <td>{TIER_LABEL[s.health.tier]}</td>
              <td className="sub">{formatInstant(s.lastSuccessAt)}</td>
              <td className="sub">{formatInstant(s.lastChangeAt)}</td>
              <td>
                {s.health.blocked ? "blocked" : s.health.stale ? "stale" : s.lastError ? "failing" : "ok"}
                {s.blockedReason || s.lastError ? <div className="sub">{s.blockedReason ?? s.lastError}</div> : null}
              </td>
              <td>
                {s.tier === "automatic" ? (
                  <Form method="post">
                    <button type="submit" name="source" value={s.key}>
                      Fetch now
                    </button>
                  </Form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {queued ? <p className="note">Queued a run of {queued}. Health updates when it finishes.</p> : null}
    </>
  );
}
