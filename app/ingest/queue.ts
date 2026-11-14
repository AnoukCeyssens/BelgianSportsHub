import { now } from "~/clock";
import { keepRawCopy } from "./raw-copy";

/** One ingest job: fetch one source. Queued by the daily scheduled handler. */
export type IngestJob = { kind: "fetch-source"; source: string; url: string };

const USER_AGENT = "BelgianSportsHub (private, low-volume)";

/**
 * Queue consumer. Each message is one source job; a failure retries that job
 * only (the queue's max_retries applies), so one broken source never stops another.
 */
export async function consumeIngestBatch(batch: MessageBatch<IngestJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      await runJob(message.body, env);
      message.ack();
    } catch (error) {
      console.error(`ingest job failed: ${message.body.source}`, error);
      message.retry();
    }
  }
}

async function runJob(job: IngestJob, env: Env) {
  const res = await fetch(job.url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${job.url} answered ${res.status}`);
  await keepRawCopy(env, {
    source: job.source,
    url: job.url,
    body: await res.arrayBuffer(),
    contentType: res.headers.get("content-type"),
    fetchedAt: now(),
  });
  // Next slices: parse with the source's adapter, match identities, write Belgian rows, update source health.
}
