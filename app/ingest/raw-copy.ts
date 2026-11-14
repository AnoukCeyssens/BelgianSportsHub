import { now } from "~/clock";
import { getDb, schema } from "~/db/client";

export type RawInput = {
  source: string;
  url: string;
  body: ReadableStream | ArrayBuffer | string;
  contentType: string | null;
  fetchedAt: Date;
};

/**
 * Keeps an input exactly as received: the body in R2 (forever), plus a
 * raw_copy row that every row produced from it references. Returns that row's id.
 */
export async function keepRawCopy(env: Pick<Env, "DB" | "RAW">, input: RawInput): Promise<string> {
  const fetchedAt = input.fetchedAt.toISOString();
  // One job can fetch several inputs from one source within the same instant
  // (a seed run reads a sitemap and many profiles), so the key carries an id too.
  const id = crypto.randomUUID();
  const r2Key = `raw/${input.source}/${fetchedAt}/${id}`;
  await env.RAW.put(r2Key, input.body, {
    httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
    customMetadata: { url: input.url, fetchedAt },
  });
  await getDb(env.DB)
    .insert(schema.rawCopy)
    .values({ id, source: input.source, url: input.url, r2Key, contentType: input.contentType, fetchedAt });
  return id;
}

const USER_AGENT = "BelgianSportsHub (private, low-volume)";

/** Fetches one public source URL politely and keeps the raw copy. Throws on a non-2xx answer (the job retries). */
export async function fetchAndKeep(env: Pick<Env, "DB" | "RAW">, source: string, url: string) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const body = await res.arrayBuffer();
  const rawCopyId = await keepRawCopy(env, {
    source,
    url,
    body,
    contentType: res.headers.get("content-type"),
    fetchedAt: now(),
  });
  return { rawCopyId, text: new TextDecoder().decode(body) };
}
