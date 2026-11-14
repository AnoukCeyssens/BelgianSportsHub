#!/usr/bin/env node
// Records a source payload as a test fixture, exactly as received.
//
//   npm run record-fixture -- <source> <name> <url>
//   e.g. npm run record-fixture -- world-athletics thiam-results.json "https://…"
//
// Writes tests/fixtures/sources/<source>/<name> (the body, byte for byte) and
// <name>.meta.json ({ url, status, contentType, recordedAt }). Tests feed both
// to stubOutboundFetch() (tests/support/outbound-fetch.ts). Record each payload
// once, by hand, politely; never in CI.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [source, name, url] = process.argv.slice(2);
if (!source || !name || !url) {
  console.error("usage: npm run record-fixture -- <source> <name> <url>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "tests", "fixtures", "sources", source);
const res = await fetch(url, { headers: { "user-agent": "BelgianSportsHub fixture recorder (private, low-volume)" } });
const bytes = new Uint8Array(await res.arrayBuffer());
const meta = {
  url,
  status: res.status,
  contentType: res.headers.get("content-type"),
  recordedAt: new Date().toISOString(),
};

await mkdir(dir, { recursive: true });
await writeFile(join(dir, name), bytes);
await writeFile(join(dir, `${name}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
console.log(`recorded ${bytes.length} bytes (${res.status}) → tests/fixtures/sources/${source}/${name}`);
