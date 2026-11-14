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
  const r2Key = `raw/${input.source}/${fetchedAt}`;
  await env.RAW.put(r2Key, input.body, {
    httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
    customMetadata: { url: input.url, fetchedAt },
  });
  const [row] = await getDb(env.DB)
    .insert(schema.rawCopy)
    .values({ source: input.source, url: input.url, r2Key, contentType: input.contentType, fetchedAt })
    .returning({ id: schema.rawCopy.id });
  return row.id;
}
