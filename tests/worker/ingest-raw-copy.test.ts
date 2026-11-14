import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { deliverIngestJobs } from "../support/worker";
import body from "../fixtures/sources/example/athletes.html?raw";
import meta from "../fixtures/sources/example/athletes.html.meta.json";

describe("ingest queue consumer", () => {
  it("keeps every fetched input as received in R2, stamped with source URL and fetch time", async () => {
    fixClock("2026-11-14T04:00:00.000Z");
    stubOutboundFetch([{ ...meta, body }]);

    const result = await deliverIngestJobs([{ kind: "fetch-source", source: "example", url: meta.url }]);

    expect(result.outcome).toBe("ok");
    expect(result.explicitAcks).toEqual(["msg-1"]);
    const listed = await env.RAW.list({ prefix: "raw/example/", include: ["customMetadata", "httpMetadata"] });
    expect(listed.objects).toHaveLength(1);
    const [object] = listed.objects;
    expect(object.customMetadata).toEqual({ url: meta.url, fetchedAt: "2026-11-14T04:00:00.000Z" });
    expect(object.httpMetadata?.contentType).toBe(meta.contentType);
    expect(await (await env.RAW.get(object.key))!.text()).toBe(body);
    // The raw copy row is what every row produced from this input will reference.
    expect(await getDb(env.DB).select().from(schema.rawCopy)).toEqual([
      expect.objectContaining({
        source: "example",
        url: meta.url,
        r2Key: object.key,
        contentType: meta.contentType,
        fetchedAt: "2026-11-14T04:00:00.000Z",
      }),
    ]);
  });

  it("retries the job when the source cannot be fetched, keeping nothing", async () => {
    fixClock("2026-11-14T04:00:00.000Z");
    stubOutboundFetch([{ url: "https://source.example/down", status: 503, body: "" }]);

    const result = await deliverIngestJobs([{ kind: "fetch-source", source: "down", url: "https://source.example/down" }]);

    expect(result.retryMessages.map((m) => m.msgId)).toEqual(["msg-1"]);
    expect((await env.RAW.list({ prefix: "raw/down/" })).objects).toHaveLength(0);
  });
});
