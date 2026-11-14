# Conventions

Set by the walking skeleton (#21). Every later ticket follows them. Vocabulary: `GLOSSARY.md`; decisions: `docs/adr/`.

## Layout

| Path | What lives there |
| --- | --- |
| `workers/app.ts` | The Worker's three entry points: `fetch` (React Router), `scheduled` (daily cron), `queue` (one ingest job per message). Thin: it only hands off to `app/`. |
| `app/root.tsx`, `app/routes.ts`, `app/routes/` | React Router v7 (framework mode) pages, loaders and actions. Bottom tabs live in `root.tsx`. |
| `app/ledger.css` | The Ledger look (cream paper, serif headings, ruled tables). Use its classes (`meta`, `sub`, `note`, `n`, `h2` section rules) before adding new ones. |
| `app/domain/` | **Domain rules: pure, no I/O.** One file per rule family, re-exported from `app/domain/index.ts`. Anything time-dependent takes `now` as an argument. |
| `app/db/schema.ts` | The Drizzle schema (D1). `app/db/client.ts` gives `getDb(d1)`. |
| `app/context.ts` | `cloudflareContext` (bindings) and `dbFrom(context)` for loaders and actions. |
| `app/clock.ts` | `now()`: the only place the I/O shell reads the time. |
| `app/ingest/` | Queue consumer, raw-copy keeping, the source run (`source-run.ts`), the adapter seam (`source-adapter.ts`), the Belgian-row writer (`belgian-rows.ts`) and merge-queue resolution. Source adapters go in `app/ingest/sources/<source>.ts`, registered in `app/ingest/sources/index.ts`. See "Sources and adapters". |
| `app/format.ts` | Shared display formats (dates, ordinals). |
| `app/backup/` | Weekly D1 export to R2 (`backups/`, last 12), run by the scheduled handler on its own cron. |
| `app/offline.tsx`, `pwa/service-worker.ts`, `public/` | Installable app: service worker (built by vite-plugin-pwa, own `tsconfig.pwa.json`), offline fallback pages, icons. The manifest is in `vite.config.ts`. |
| `db/migrations/` | Generated SQL migrations (+ drizzle-kit `meta/`). Applied by wrangler and by the test pool. |
| `db/seed/dev.sql` | Idempotent hand seed for local dev and fresh copies. |
| `tests/domain/` | Seam 2: table-driven tests of `app/domain`. |
| `tests/worker/` | Seam 1: tests through the Worker's entry points. |
| `tests/support/` | Test helpers: `worker.ts` (call entry points), `seed.ts` (arrange rows), `clock.ts`, `outbound-fetch.ts`, `setup.ts`. |
| `tests/fixtures/sources/<source>/` | Recorded source payloads plus `<file>.meta.json`. |

Imports inside `app/` use `~/…` (alias for `app/`).

## npm scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Local dev server (Vite + workerd, local D1/R2/Queues in `.wrangler/state`). |
| `npm run db:migrate:local` / `npm run db:seed:local` | Apply migrations / the hand seed to the local D1. |
| `npm test` | All tests, both seams, in workerd. `npm run test:watch` to iterate. |
| `npm run typecheck` | Regenerates `worker-configuration.d.ts` and route types, then `tsc -b`. Run after editing `wrangler.jsonc` or routes. |
| `npm run db:generate` | Writes the next migration from schema changes. |
| `npm run record-fixture -- <source> <file> <url>` | Records a source payload as a fixture (by hand, once, politely). |
| `npm run deploy:test` / `npm run deploy:live` | Migrate remote D1, build for that environment, deploy. Normally run by GitHub Actions only. |

## Adding a migration

1. Edit `app/db/schema.ts`.
2. `npm run db:generate -- --name <what_changed>` → `db/migrations/NNNN_<what_changed>.sql`. Read the SQL.
3. Commit the SQL **and** `db/migrations/meta/`. Never edit a migration that is on `main`; add a new one.
4. Tests pick it up automatically (`tests/support/setup.ts` applies all migrations to each test file's fresh D1). Deploys apply it before the new code goes live.

## Writing tests

Tests only go at the two seams from spec #20. A good test sets up inputs (rows, a recorded payload, a clock), calls a seam, and checks what a reader or the owner would see (or the stored rows/R2 objects). Never assert on internal helpers, query shapes or component structure.

### Seam 2: domain rules (`tests/domain/<rule>.test.ts`)

Table-driven with `it.each`, one row per case, a readable `name` per row, expected values written out by hand (from the spec, the glossary or a worked example), never computed the way the code computes them. Import from `~/domain` only. Pass `now` explicitly. Example: `tests/domain/time-display.test.ts`.

### Seam 1: the Worker surface (`tests/worker/<feature>.test.ts`)

Runs in workerd through `@cloudflare/vitest-plugin`, with a real local D1 (all migrations applied) and a real R2, isolated per test file.

- **Call an entry point** with `tests/support/worker.ts`: `get(path)` for pages, loaders and the iCal feed; `post(path, form)` for actions; `deliverIngestJobs(jobs)` for one batch to the queue consumer (returns acks and retries); `runIngest(jobs)` to run jobs plus every job they queue (fan-out, e.g. the roster seed) until drained, without touching the real local queue. Add a helper there for each new entry point (e.g. the scheduled handler).
- **Arrange state** with builders in `tests/support/seed.ts` (add one per entity as you need it).
- **Fix the clock** with `fixClock("2026-11-14T04:00:00.000Z")`. It fakes `Date` for the test and the Worker (same isolate). Production code reads time through `now()` from `~/clock` or `new Date()`, never via timers.
- **Stub outbound fetch** with `stubOutboundFetch([{ ...meta, body }])`. An unstubbed URL throws, so tests never hit the network.
- Both are reset after every test by `tests/support/setup.ts`.
- Examples: `tests/worker/athlete-page.test.ts` (page), `tests/worker/isu-speed-skating.test.ts` (queue + clock + fetch stub + R2 + health), `tests/worker/daily-ingest.test.ts` (cron).
- `runScheduled(cron, time)` and `runIngest(jobs)` capture whatever the Worker queues and return it; nothing reaches the real local queue. An action that queues through `env.INGEST` does use the real local queue: wait for its effect with `vi.waitFor` and give the test a longer timeout.
- Storage is shared by the tests in one file. When tests ingest overlapping data, start each from `clearIngestedData(env)` (`tests/support/seed.ts`).

### Recording fixtures for source raw copies

Adapters are tested against real federation payloads.

1. `npm run record-fixture -- world-athletics thiam-results.json "https://…"` writes `tests/fixtures/sources/world-athletics/thiam-results.json` (byte for byte) and `thiam-results.json.meta.json` (`url`, `status`, `contentType`, `recordedAt`).
2. In the test: `import body from "../fixtures/sources/<source>/<file>?raw"` and `import meta from "…/<file>.meta.json"`, then `stubOutboundFetch([{ ...meta, body }])`. Binary payloads (FIS ZIPs): `import zip from "…/<file>.zip?bytes"` yields a `Uint8Array` byte for byte (the `bytes-fixtures` plugin in `vitest.config.ts`); the stub then sends its `content-length`, as a real download does. See `tests/fixtures/sources/fis-points-lists/index.ts`.
3. Keep fixtures small: record one realistic page, not a whole season. Record by hand from a public endpoint only; never in CI; never from Olympedia, Olympics.com or Totallympics.
4. When a source changes format, record a new fixture next to the old one; the old one stays as a regression case.
5. A payload too big to keep whole (e.g. Team Belgium's 1 MB sitemaps) may be trimmed by hand after recording; say so in a `trimmedByHand` field of its `.meta.json`. A source whose test needs many files gets an `index.ts` next to them exporting the ready-to-stub list (see `tests/fixtures/sources/team-belgium/index.ts`).


## Sources and adapters

Set by the first Automatic source, ISU speed skating (#23). Every later Automatic source (#42, #43, #44) follows it.

**Source rows are data.** The `source` table holds each source's `key`, `tier` (`automatic` / `assisted` / `manual`), `cadenceDays` and health columns (`lastAttemptAt`, `lastSuccessAt`, `lastChangeAt`, `lastFailureAt`, `lastError`, `blockedAt`, `blockedReason`). Add a source with an `INSERT` appended to the migration that ships its adapter (see `db/migrations/0003_sources_and_results.sql`); change cadence or tier with an `UPDATE`, never a deploy. The domain rule `sourceHealth(source, now)` decides `due` (cadence elapsed, 2 h slack for cron jitter), `stale` (more than twice the cadence since the last success, or since `addedAt`), `blocked`, and the tier in effect (blocked → Assisted).

**The flow.** The daily cron calls `queueDueSources()`, which sends one `{ kind: "fetch-source", source }` job per due Automatic source. The queue consumer (one message per invocation, `max_retries` 3) calls `runSource(env, key)`, which:
1. stamps `lastAttemptAt`;
2. calls the adapter with a `SourceRun`;
3. on success stamps `lastSuccessAt`, and `lastChangeAt` when any row was inserted or changed;
4. on `SourceBlocked` (401, 403, 451 or a Cloudflare bot challenge) sets `blockedAt` / `blockedReason` and acks: a refusal is never retried, the source is Assisted until the owner retries it ("Fetch now" on `/curate/sources` clears the block);
5. on any other error stamps `lastFailureAt` / `lastError` and rethrows, so the job is retried.

**The adapter seam** (`app/ingest/source-adapter.ts`). An adapter is `{ run(run: SourceRun) }` and knows only its source's URLs and payloads:
- `run.now`, and `run.since` (start of the last successful run, null on the first): fetch only what changed since; on the first run choose a bounded backfill (ISU: one year).
- `run.fetch(url)` fetches politely, keeps the body as received in R2 and a `raw_copy` row, and returns `{ text, rawCopyId }`. Never call `fetch()` directly.
- `run.fetchStream(url)` is its sibling for large or binary payloads (FIS ZIPs): the body streams into R2 and comes back as a stream read from R2 (`{ body, rawCopyId }`), so a job never holds it whole (128 MB). `app/ingest/zip-stream.ts` reads a ZIP from such a stream entry by entry, line by line.
- `run.rows` takes what was parsed: `competition()` (returns its id; only qualification-relevant senior competitions), `result()` (one Belgian performance; leave out DNS and withdrawals) and `entrants()` (a competition's entry list, replaced as a whole). Each input carries the `rawCopyId` it was parsed from, so every row links to its raw copy. A `sourceRef` (the source's own ID) makes a re-fetch update the same row instead of duplicating it.
- The writer keeps Belgian rows only (`person.nationality === "BEL"`), but filter early anyway. It matches identities with `identityMatch` (IF ID, then name + date of birth), remembers the IF ID on a name + date-of-birth match, moves "Athlete since" back for an earlier performance, and sends anything unmatched to the merge queue with its results attached.
- Adapters never touch D1, R2, identity rules or health.

**Merge queue.** An unmatched person becomes one `merge_queue_item` per IF ID (`scheme` + `value`); their results wait on it (`result.mergeQueueItemId`). `resolveMergeQueueItem(d1, itemId, resolution)` in `app/ingest/merge-queue.ts` links them to an Athlete, creates a new Athlete (from the item, "Athlete since" from its earliest result) or marks them "not an Athlete"; later runs then match on the IF ID, or keep attaching to the not-an-Athlete item. `/curate/merge-queue` is the bare page for it until the Run sheet (#24) takes over.

**Results and Upcoming.** Until Teams and Entries arrive (#27), a `result` belongs to an Athlete (or a merge-queue item) and names its event as text; team events (ISU team pursuit) are not ingested yet. An `entrant` is an Athlete named on a competition's entry list; the Athlete page lists those competitions that have not ended yet under Upcoming.

**Adding an Automatic source:** record fixtures of one realistic run (trim by hand where large, note it in `trimmedByHand`), export the ready-to-stub list from `tests/fixtures/sources/<source>/index.ts`, write the Worker test against `deliverIngestJobs([{ kind: "fetch-source", source }])`, then the adapter, its registry entry and the Source row. Before it counts as Automatic, the owner runs "Fetch now" on the deployed test copy; a refusal shows it as blocked (Assisted).

## Offline reading and curation routes

The service worker caches every page and its React Router data (`<path>.data`) as it is viewed, network first, and precaches the app shell. **Curation routes must live under `/curate`** (`CURATION_PATH` in `app/domain/offline-reading.ts`): they are never cached, and offline the root layout replaces them with an offline message, so the owner never fills in a stale form. Anything else counts as a reader page. Static files are served as named (`assets.html_handling: "none"`). The service worker is registered in production builds only.

## Cron triggers

The scheduled handler dispatches on `controller.cron`: `0 4 * * *` daily ingest (queues due sources), `0 3 * * 1` weekly backup (`runScheduled(cron, time)` in tests). Both run on the live copy only; the test copy has none.

## Environments and deploying

`wrangler.jsonc`: top level = local dev and tests; `env.test` and `env.live` = the two deployed copies, each with its own D1 (`bsh-test`, `bsh-live`), R2 bucket and queue. `workers_dev` and preview URLs are off; each copy has a custom-domain route. The test copy has no cron triggers; the live copy runs the daily ingest cron.

- **Test copy:** `.github/workflows/deploy-test.yml` runs typecheck, tests, then `npm run deploy:test` on every push to `main`.
- **Live copy ("update app"):** `.github/workflows/deploy-live.yml`, run by hand (`gh workflow run deploy-live.yml --ref main`).
- Pull requests run `.github/workflows/ci.yml` (typecheck + tests).

With the Cloudflare Vite plugin, the environment is chosen at **build** time (`CLOUDFLARE_ENV=test react-router build`); `wrangler deploy` then uses `build/server/wrangler.json`. Commands that must read the source config (D1 migrations, `wrangler types`) pass `-c wrangler.jsonc`.

Placeholders in `wrangler.jsonc` (marked `PLACEHOLDER`) must be replaced before the first deploy: the custom domain (`bsh.example.com`, `test.bsh.example.com`) and the D1 database ids.

Cloudflare Access is configured in the Zero Trust dashboard, not in code: one self-hosted application per copy covering the whole domain, an email allowlist policy with one-time PIN login, and (later) a Bypass policy for the iCal feed path only.
