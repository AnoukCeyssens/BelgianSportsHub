#!/usr/bin/env node
// Records a source payload as a test fixture, exactly as received.
//
//   npm run record-fixture -- <source> <name> <url> [--form "<url-encoded form>"]
//   e.g. npm run record-fixture -- world-athletics thiam-results.json "https://…"
//
// With --form the payload is asked for with a POST of that form (as the
// adapter sends it, fields in the same order); the meta then also holds
// `requestBody`, which stubOutboundFetch() matches on.
//
// Writes tests/fixtures/sources/<source>/<name> (the body, byte for byte) and
// <name>.meta.json ({ url, status, contentType, recordedAt }). Tests feed both
// to stubOutboundFetch() (tests/support/outbound-fetch.ts). Record each payload
// once, by hand, politely; never in CI.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [source, name, url, flag, form] = process.argv.slice(2);
if (!source || !name || !url || (flag !== undefined && (flag !== "--form" || form === undefined))) {
  console.error('usage: npm run record-fixture -- <source> <name> <url> [--form "<url-encoded form>"]');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "tests", "fixtures", "sources", source);
const headers = { "user-agent": "BelgianSportsHub fixture recorder (private, low-volume)" };
const res = form
  ? await fetch(url, { method: "POST", body: form, headers: { ...headers, "content-type": "application/x-www-form-urlencoded" } })
  : await fetch(url, { headers });
const bytes = new Uint8Array(await res.arrayBuffer());
const meta = {
  url,
  status: res.status,
  contentType: res.headers.get("content-type"),
  recordedAt: new Date().toISOString(),
  ...(form ? { requestBody: form } : {}),
};

await mkdir(dir, { recursive: true });
await writeFile(join(dir, name), bytes);
await writeFile(join(dir, `${name}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
console.log(`recorded ${bytes.length} bytes (${res.status}) → tests/fixtures/sources/${source}/${name}`);
