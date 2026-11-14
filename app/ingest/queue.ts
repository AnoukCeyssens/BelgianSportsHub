import { fetchAndKeep } from "./raw-copy";
import { seedAthleteProfile, startRosterSeed, type SeedAthleteProfileJob } from "./roster-seed";

/**
 * One ingest job. `fetch-source` is queued by the daily scheduled handler;
 * `seed-roster` by the owner (Team Belgium roster seed), which fans out into
 * one `seed-athlete-profile` job per profile.
 */
export type IngestJob =
  | { kind: "fetch-source"; source: string; url: string }
  | { kind: "seed-roster" }
  | SeedAthleteProfileJob;

/**
 * Queue consumer. Each message is one job; a failure retries that job only
 * (the queue's max_retries applies), so one broken source never stops another.
 */
export async function consumeIngestBatch(batch: MessageBatch<IngestJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      await runJob(message.body, env);
      message.ack();
    } catch (error) {
      console.error(`ingest job failed: ${JSON.stringify(message.body)}`, error);
      message.retry();
    }
  }
}

async function runJob(job: IngestJob, env: Env) {
  switch (job.kind) {
    case "fetch-source":
      await fetchAndKeep(env, job.source, job.url);
      // Next slices: parse with the source's adapter, match identities, write Belgian rows, update source health.
      return;
    case "seed-roster":
      return startRosterSeed(env);
    case "seed-athlete-profile":
      return seedAthleteProfile(env, job);
  }
}
