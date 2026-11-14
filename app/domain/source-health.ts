// Spec #20, stories 89, 90, 94 and 97. A Source's cadence is data. The daily
// cron queues every Automatic source whose cadence is due. A source is stale
// once it has gone more than twice its cadence without a successful fetch,
// and a source that refuses Worker requests is blocked: it drops to the
// Assisted tier until the owner retries it.

export type SourceTier = "automatic" | "assisted" | "manual";

export type SourceState = {
  /** The tier the source is configured for. */
  tier: SourceTier;
  cadenceDays: number;
  /** ISO instants. */
  addedAt: string;
  lastSuccessAt: string | null;
  blockedAt: string | null;
};

export type SourceHealth = {
  /** The tier in effect: a blocked Automatic source is Assisted. */
  tier: SourceTier;
  /** Queue it at this cron run. */
  due: boolean;
  stale: boolean;
  blocked: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** A run that finished a little after the cron still counts for the next one. */
const CRON_SLACK_MS = 2 * 60 * 60 * 1000;

export function sourceHealth(source: SourceState, now: Date): SourceHealth {
  const blocked = source.blockedAt !== null;
  const automatic = source.tier === "automatic" && !blocked;
  const cadenceMs = source.cadenceDays * DAY_MS;
  const lastSuccess = source.lastSuccessAt ? Date.parse(source.lastSuccessAt) : null;
  const sinceFetched = now.getTime() - (lastSuccess ?? Date.parse(source.addedAt));
  return {
    tier: blocked ? "assisted" : source.tier,
    due: automatic && (lastSuccess === null || now.getTime() - lastSuccess >= cadenceMs - CRON_SLACK_MS),
    stale: automatic && sinceFetched > 2 * cadenceMs,
    blocked,
  };
}

export type SourceAttentionState = SourceState & {
  lastFailureAt: string | null;
  lastError: string | null;
  /** When the owner last acknowledged (or retried) the source's problem. */
  acknowledgedAt: string | null;
};

export type SourceProblem = { kind: "blocked" | "failing" | "stale"; since: string };

/**
 * Spec #20, story 103: whether a source needs an action card in the Run
 * sheet's Source health step. A problem stays open until the owner
 * acknowledges it (or retries); a newer failure, block or staleness opens it
 * again.
 */
export function sourceAttention(source: SourceAttentionState, now: Date): { problem: SourceProblem | null; open: boolean } {
  const problem = sourceProblem(source, now);
  const open = problem !== null && (source.acknowledgedAt === null || Date.parse(source.acknowledgedAt) < Date.parse(problem.since));
  return { problem, open };
}

function sourceProblem(source: SourceAttentionState, now: Date): SourceProblem | null {
  if (source.blockedAt !== null) return { kind: "blocked", since: source.blockedAt };
  if (source.tier !== "automatic") return null;
  if (source.lastError !== null && source.lastFailureAt !== null) return { kind: "failing", since: source.lastFailureAt };
  if (sourceHealth(source, now).stale) {
    const from = Date.parse(source.lastSuccessAt ?? source.addedAt);
    return { kind: "stale", since: new Date(from + 2 * source.cadenceDays * DAY_MS).toISOString() };
  }
  return null;
}
