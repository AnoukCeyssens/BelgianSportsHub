// Run sheet step 1, Source health (spec #20, stories 97 and 103): the full
// health table of every source, then an action card per problem source:
// retry it now, acknowledge the problem, or keep a blocked source on Assisted.
// "Fetch now" in the table runs any Automatic source straight away (the owner's
// test fetch before a new source counts as Automatic).
import { asc, eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { type Db, schema } from "~/db/client";
import { sourceAttention, sourceHealth, type SourceProblem, type SourceTier } from "~/domain";
import { formatInstant } from "~/format";
import type { IngestJob } from "~/ingest/queue";

const TIER_LABEL: Record<SourceTier, string> = { automatic: "Automatic", assisted: "Assisted", manual: "Manual" };

export async function loadSourceHealth(db: Db, now: Date) {
  const sources = await db.select().from(schema.source).orderBy(asc(schema.source.name));
  const rows = sources.map((s) => {
    const state = { ...s, tier: s.tier as SourceTier };
    return { ...s, health: sourceHealth(state, now), attention: sourceAttention(state, now) };
  });
  return { sources: rows, open: rows.filter((s) => s.attention.open).length };
}

export type SourceHealthData = Awaited<ReturnType<typeof loadSourceHealth>>;

/**
 * One owner action on a source. Retrying clears a block and queues a run
 * straight away; every action puts the card away until a newer problem.
 * Returns the session-log message.
 */
export async function actOnSource(db: Db, ingest: Queue, intent: string, key: string, now: Date): Promise<string> {
  const source = await db.query.source.findFirst({ where: eq(schema.source.key, key) });
  if (!source) throw new Response(`No source ${key}`, { status: 404 });
  const acknowledgedAt = now.toISOString();
  switch (intent) {
    case "retry": {
      await db.update(schema.source).set({ blockedAt: null, blockedReason: null, acknowledgedAt }).where(eq(schema.source.key, key));
      const job: IngestJob = { kind: "fetch-source", source: key };
      await ingest.send(job);
      return `${source.name}: retried`;
    }
    case "acknowledge":
      await db.update(schema.source).set({ acknowledgedAt }).where(eq(schema.source.key, key));
      return `${source.name}: acknowledged, keep watching`;
    case "keep-assisted":
      await db.update(schema.source).set({ acknowledgedAt }).where(eq(schema.source.key, key));
      return `${source.name}: kept on Assisted until fixed`;
    default:
      throw new Response(`Unknown action ${intent}`, { status: 400 });
  }
}

function healthWord(s: SourceHealthData["sources"][number]) {
  return s.health.blocked ? "blocked" : s.lastError ? "failing" : s.health.stale ? "stale" : "ok";
}

/** `problemsOnly` (the Live day pass) leaves out the full health table. */
export function SourceHealthStep({ data, problemsOnly = false }: { data: SourceHealthData; problemsOnly?: boolean }) {
  const problems = data.sources.filter((s) => s.attention.open);
  return (
    <>
      {problemsOnly ? null : <div className="card">
        <p className="meta">
          Tier, cadence, sport, URL and notes of every source: <Link to="/curate/sources">Edit sources</Link>
        </p>
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
            {data.sources.map((s) => (
              <tr key={s.key}>
                <td>
                  {s.name}
                  <div className="sub">every {s.cadenceDays === 1 ? "day" : `${s.cadenceDays} days`}</div>
                </td>
                <td>{TIER_LABEL[s.health.tier]}</td>
                <td className="sub">{formatInstant(s.lastSuccessAt)}</td>
                <td className="sub">{formatInstant(s.lastChangeAt)}</td>
                <td>{healthWord(s) === "ok" ? "ok" : <b className="bad">{healthWord(s)}</b>}</td>
                <td>
                  {s.tier === "automatic" ? (
                    <Form method="post">
                      <input type="hidden" name="source" value={s.key} />
                      <button type="submit" name="intent" value="retry" className="secondary">
                        Fetch now
                      </button>
                    </Form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {problems.map((s) => (
        <ProblemCard key={s.key} source={s} problem={s.attention.problem!} />
      ))}
    </>
  );
}

function ProblemCard({ source, problem }: { source: SourceHealthData["sources"][number]; problem: SourceProblem }) {
  const blocked = problem.kind === "blocked";
  return (
    <div className="card">
      <h3>{`${source.name} is ${problem.kind}`}</h3>
      <p className="sub">
        Last successful fetch {formatInstant(source.lastSuccessAt)} · last data change {formatInstant(source.lastChangeAt)} · stale
        after missing twice its cadence
      </p>
      {source.blockedReason ?? source.lastError ? <p className="bad">{source.blockedReason ?? source.lastError}</p> : null}
      {blocked ? (
        <p className="meta">
          A source that refuses Worker requests drops to <b>Assisted</b>: its data comes in through the paste importer until a retry
          succeeds.
        </p>
      ) : null}
      <Form method="post" className="actions">
        <input type="hidden" name="source" value={source.key} />
        <button type="submit" name="intent" value="retry" className="secondary">
          Retry fetch now
        </button>
        <button type="submit" name="intent" value={blocked ? "keep-assisted" : "acknowledge"}>
          {blocked ? "Keep on Assisted until fixed" : "Acknowledge, keep watching"}
        </button>
      </Form>
    </div>
  );
}
