// Entry points of the Worker under test (workers/app.ts), one helper each.
import { createExecutionContext, createMessageBatch, createScheduledController, getQueueResult, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import worker from "../../workers/app";
import type { IngestJob } from "~/ingest/queue";

/** GET a page or feed through the fetch handler. Redirects are returned, not followed. */
export function get(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`https://bsh.test${path}`, { redirect: "manual", ...init }));
}

/** POST a form to an action through the fetch handler. Redirects are returned, not followed. */
export function post(path: string, form: Record<string, string> = {}, init?: RequestInit) {
  return get(path, { method: "POST", body: new URLSearchParams(form), ...init });
}

/**
 * Request options for a signed-in viewer: Cloudflare Access puts the email
 * of whoever passed its login on every request. Without it (local dev and
 * tests), the dev copy treats the request as the owner's.
 */
export function signedInAs(email: string): RequestInit {
  return { headers: { "Cf-Access-Authenticated-User-Email": email } };
}

/** The owner's email in local dev and tests (OWNER_EMAIL in wrangler.jsonc's top level). */
export const OWNER_EMAIL = "owner@localhost";

/**
 * GET through the fetch handler as a deployed copy (test or live) would run:
 * with that copy's APP_ENV, so there is no local-dev shortcut for the owner.
 */
export async function getDeployed(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`https://bsh.test${path}`, { redirect: "manual", ...init }) as Request<unknown, IncomingRequestCfProperties>,
    { ...env, APP_ENV: "test", OWNER_EMAIL: "owner@example.com" } as Env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
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

/**
 * Run ingest jobs to completion: deliver them to the queue consumer, then
 * deliver every job they queue in turn (a seed run fans out one job per
 * profile), until nothing is left. Jobs queued here never reach the real local
 * queue, so nothing keeps running after the test.
 */
export async function runIngest(jobs: IngestJob[]) {
  const acked: IngestJob[] = [];
  const retried: IngestJob[] = [];
  let pending = jobs;
  while (pending.length > 0) {
    const { queue: capture, queued } = captureQueue();
    const batch = createMessageBatch<IngestJob>(
      "bsh-ingest-dev",
      pending.map((body, i) => ({ id: `msg-${i + 1}`, timestamp: new Date(), attempts: 1, body })),
    );
    const ctx = createExecutionContext();
    await worker.queue(batch, { ...env, INGEST: capture }, ctx);
    await waitOnExecutionContext(ctx);
    const result = await getQueueResult(batch, ctx);
    const retriedIds = new Set(result.retryMessages.map((m) => m.msgId));
    pending.forEach((job, i) => (retriedIds.has(`msg-${i + 1}`) ? retried : acked).push(job));
    pending = queued;
  }
  return { acked, retried };
}

/**
 * Fire a cron trigger at the scheduled handler, as Cloudflare would at
 * `scheduledTime`. Returns the ingest jobs it queued; they are captured, not
 * sent to the real local queue.
 */
export async function runScheduled(cron: string, scheduledTime: string) {
  const { queue: capture, queued } = captureQueue();
  const controller = createScheduledController({ cron, scheduledTime: new Date(scheduledTime) });
  const ctx = createExecutionContext();
  await worker.scheduled(controller, { ...env, INGEST: capture }, ctx);
  await waitOnExecutionContext(ctx);
  return queued;
}

/** An INGEST queue binding that only records what is sent to it. */
function captureQueue() {
  const queued: IngestJob[] = [];
  const queue = {
    async send(body: IngestJob) {
      queued.push(body);
    },
    async sendBatch(messages: Iterable<MessageSendRequest<IngestJob>>) {
      for (const m of messages) queued.push(m.body);
    },
  } as unknown as Queue<IngestJob>;
  return { queue, queued };
}
