import { now } from "~/clock";
import { getDb, schema } from "~/db/client";
import { SourceBlocked, type Fetched, type FetchedStream, type FetchInit } from "./source-adapter";

export type RawInput = {
  source: string;
  url: string;
  body: ReadableStream | ArrayBuffer | string;
  contentType: string | null;
  fetchedAt: Date;
  /** The request body, when the input was asked for with a POST: kept next to it, so the raw copy says exactly what was asked. */
  request?: { method: "POST"; contentType: string; body: string };
  /** The raw copy this one was read from, when it is a reading of another (a fetched timetable kept as a table). */
  derivedFrom?: string;
};

/**
 * Keeps an input exactly as received: the body in R2 (forever), plus a
 * raw_copy row that every row produced from it references. Returns that row's id.
 */
export async function keepRawCopy(env: Pick<Env, "DB" | "RAW">, input: RawInput): Promise<string> {
  return (await keep(env, input)).id;
}

async function keep(env: Pick<Env, "DB" | "RAW">, input: RawInput): Promise<{ id: string; r2Key: string }> {
  const fetchedAt = input.fetchedAt.toISOString();
  // One job can fetch several inputs from one source within the same instant
  // (a seed run reads a sitemap and many profiles), so the key carries an id too.
  const id = crypto.randomUUID();
  const r2Key = `raw/${input.source}/${fetchedAt}/${id}`;
  const request: Record<string, string> = input.request ? { method: input.request.method, requestKey: `${r2Key}.request` } : {};
  if (input.request) {
    await env.RAW.put(`${r2Key}.request`, input.request.body, {
      httpMetadata: { contentType: input.request.contentType },
      customMetadata: { url: input.url, fetchedAt, method: input.request.method },
    });
  }
  await env.RAW.put(r2Key, input.body, {
    httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
    customMetadata: { url: input.url, fetchedAt, ...request, ...(input.derivedFrom ? { derivedFrom: input.derivedFrom } : {}) },
  });
  await getDb(env.DB)
    .insert(schema.rawCopy)
    .values({ id, source: input.source, url: input.url, r2Key, contentType: input.contentType, fetchedAt });
  return { id, r2Key };
}

const USER_AGENT = "BelgianSportsHub (private, low-volume)";

/** Answers that mean "not for Workers": the source is blocked rather than retried. */
const REFUSAL_STATUSES = new Set([401, 403, 451]);

/**
 * Fetches one public source URL politely and keeps the raw copy. Throws
 * SourceBlocked when the source refuses the Worker (401, 403, 451 or a bot
 * challenge), and a plain error on any other non-2xx answer (the job retries).
 */
export async function fetchAndKeep(
  env: Pick<Env, "DB" | "RAW">,
  source: string,
  url: string,
  init: FetchInit = {},
): Promise<Fetched> {
  const request = init.form ? { method: "POST" as const, contentType: FORM, body: new URLSearchParams(init.form).toString() } : undefined;
  const res = await politeFetch(url, init.headers, request);
  const body = await res.arrayBuffer();
  const rawCopyId = await keepRawCopy(env, {
    source,
    url,
    body,
    contentType: res.headers.get("content-type"),
    fetchedAt: now(),
    request,
  });
  return { rawCopyId, text: new TextDecoder().decode(body) };
}

/**
 * fetchAndKeep for large or binary payloads: streams the body straight into
 * R2 (when the source states its length, as downloads do) and hands it back as
 * a stream read from R2, so a job never holds it whole (128 MB limit).
 */
export async function fetchStreamAndKeep(env: Pick<Env, "DB" | "RAW">, source: string, url: string): Promise<FetchedStream> {
  const res = await politeFetch(url);
  // R2 takes a stream only when its length is known; otherwise buffer it once.
  const body = res.body && res.headers.has("content-length") ? res.body : await res.arrayBuffer();
  const kept = await keep(env, { source, url, body, contentType: res.headers.get("content-type"), fetchedAt: now() });
  const object = await env.RAW.get(kept.r2Key);
  if (!object) throw new Error(`Raw copy of ${url} missing from R2`);
  return { rawCopyId: kept.id, body: object.body };
}

const FORM = "application/x-www-form-urlencoded";

async function politeFetch(url: string, headers: Record<string, string> = {}, request?: RawInput["request"]): Promise<Response> {
  const res = await fetch(
    url,
    request
      ? { method: request.method, body: request.body, headers: { ...headers, "content-type": request.contentType, "user-agent": USER_AGENT } }
      : { headers: { ...headers, "user-agent": USER_AGENT } },
  );
  if (REFUSAL_STATUSES.has(res.status) || res.headers.get("cf-mitigated") === "challenge") {
    await res.body?.cancel();
    throw new SourceBlocked(`${url} refused the Worker (${res.status})`);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${url} answered ${res.status}`);
  }
  return res;
}
