// Entry points of the Worker under test (workers/app.ts), one helper each.
import { createExecutionContext, createMessageBatch, createScheduledController, getQueueResult, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import worker from "../../workers/app";
import type { IngestJob } from "~/ingest/queue";

/** GET a page or feed through the fetch handler. Redirects are returned, not followed. */
export function get(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`https://bsh.test${path}`, { redirect: "manual", ...init }));
}

/** Deliver ingest jobs to the queue consumer; returns which messages were acked or retried. */
export async function deliverIngestJobs(jobs: IngestJob[]) {
  const batch = createMessageBatch<IngestJob>(
    "bsh-ingest-dev",
    jobs.map((body, i) => ({ id: `msg-${i + 1}`, timestamp: new Date(), attempts: 1, body })),
  );
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  await waitOnExecutionContext(ctx);
  return getQueueResult(batch, ctx);
}

/** Fire a cron trigger at the scheduled handler, as Cloudflare would at `scheduledTime`. */
export async function runScheduled(cron: string, scheduledTime: string) {
  const controller = createScheduledController({ cron, scheduledTime: new Date(scheduledTime) });
  const ctx = createExecutionContext();
  await worker.scheduled(controller, env, ctx);
  await waitOnExecutionContext(ctx);
}
