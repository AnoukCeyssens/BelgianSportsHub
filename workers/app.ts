import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "~/context";
import { consumeIngestBatch, type IngestJob } from "~/ingest/queue";

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

// The Worker's three entry points (spec #20, Platform): pages and the iCal feed
// (fetch), the daily cron that queues one job per due source (scheduled), and
// one source job per queue message (queue).
export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },
  async scheduled() {
    // Daily cron (live copy only; off in test). The ingest slice makes this
    // queue one IngestJob per Source whose cadence is due. No Sources exist yet.
  },
  async queue(batch, env, _ctx) {
    await consumeIngestBatch(batch, env);
  },
} satisfies ExportedHandler<Env, IngestJob>;
