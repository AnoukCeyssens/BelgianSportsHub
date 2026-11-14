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
| `app/competition/` | Shared Championship and Games page parts: phase inputs from storage, the Phase bar, per-phase panels. See "Phases". |
| `app/curate/` | The Run sheet's steps (loader, action, component per step) and its session log. See "The Run sheet". |
| `app/owner.ts` | Owner-only gate for every `/curate` route, called first by the fetch handler. |
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
4. on `SourceBlocked` (401, 403, 451 or a Cloudflare bot challenge) sets `blockedAt` / `blockedReason` and acks: a refusal is never retried, the source is Assisted until the owner retries it ("Fetch now" or "Retry fetch now" in the Run sheet's Source health step, `/curate/run/source-health`, clears the block);
5. on any other error stamps `lastFailureAt` / `lastError` and rethrows, so the job is retried.

**The adapter seam** (`app/ingest/source-adapter.ts`). An adapter is `{ run(run: SourceRun) }` and knows only its source's URLs and payloads:
- `run.now`, and `run.since` (start of the last successful run, null on the first): fetch only what changed since; on the first run choose a bounded backfill (ISU: one year).
- `run.fetch(url)` fetches politely, keeps the body as received in R2 and a `raw_copy` row, and returns `{ text, rawCopyId }`. Never call `fetch()` directly.
- `run.fetchStream(url)` is its sibling for large or binary payloads (FIS ZIPs): the body streams into R2 and comes back as a stream read from R2 (`{ body, rawCopyId }`), so a job never holds it whole (128 MB). `app/ingest/zip-stream.ts` reads a ZIP from such a stream entry by entry, line by line.
- A source that needs a credential (World Triathlon's API key) reads it with `run.secret(name)` and sends it as a header: `run.fetch(url, { headers: { apikey } })`. Never put it in the URL, which is kept with the raw copy. Without the credential the adapter throws `SourceBlocked` before fetching, so the source shows as blocked (Assisted) until the owner sets the Worker secret (`wrangler secret put <NAME> --env test|live`; `.dev.vars` locally). Tests pass it as `deliverIngestJobs(jobs, { NAME: "test-key" })`.
- A source whose endpoints only answer form POSTs (UCI DataRide) uses `run.fetch(url, { form })`: a url-encoded POST, fields in the given order. The form is kept with the raw copy as `<r2Key>.request` in R2 (the copy's metadata carries `method` and `requestKey`). Record such fixtures with `npm run record-fixture -- <source> <file> <url> --form "<url-encoded form>"` (exactly as the adapter encodes it, `URLSearchParams`); the meta then holds `requestBody`, and `stubOutboundFetch` matches on URL and body.
- When the API has no real payload to record (no credential yet), build fixtures by hand from its documented response examples, use made-up names and IDs, and say so in a `builtFromDocumentation` field of each `.meta.json`. Replace them with a recorded run once the credential exists.
- `run.rows` takes what was parsed: `competition()` (returns its id; only qualification-relevant senior competitions), `result()` (one Belgian performance; leave out DNS and withdrawals), `teamResult()` (one Belgian Team's performance with the `roster` the result credits; pass `teamEvent` when the result's event title is more specific than the Team's, e.g. ISU Division B), `team()` (finds or creates the Team a ranking row belongs to: a pair's members, or none for a nation ranking) and `entrants()` (a competition's entry list, replaced as a whole). Each input carries the `rawCopyId` it was parsed from, so every row links to its raw copy. A `sourceRef` (the source's own ID) makes a re-fetch update the same row instead of duplicating it.
- The writer keeps Belgian rows only (`person.nationality === "BEL"`), but filter early anyway. It matches identities with `identityMatch` (IF ID, then name + date of birth), remembers the IF ID on a name + date-of-birth match, moves "Athlete since" back for an earlier performance, and sends anything unmatched to the merge queue with its results attached.
- Adapters never touch D1, R2, identity rules or health.

**Merge queue.** An unmatched person becomes one `merge_queue_item` per IF ID (`scheme` + `value`); their results wait on it (`result.mergeQueueItemId`). `resolveMergeQueueItem(d1, itemId, resolution)` in `app/ingest/merge-queue.ts` links them to an Athlete, creates a new Athlete (from the item, "Athlete since" from its earliest result) or marks them "not an Athlete"; later runs then match on the IF ID, or keep attaching to the not-an-Athlete item. The Run sheet's Merge queue step (`/curate/run/merge-queue`) is the owner's page for it.

**Results, Teams and Upcoming.** A `result` belongs to an Entry (ADR 0001): an Athlete (or a merge-queue item), or a `team` (#27), and names its event as text. The domain rule `teamIdentity` decides which Team: by default one per Belgium + sport + event, whatever its roster; one per partnership (keyed on the members' IF IDs) in beach volleyball, rowing, doubles, pairs, duets, synchro, K2/C2 and the like. A Team's `roster_member` rows (Team × competition × Athlete or merge-queue item) are whoever the official result or squad list credits, kept as a union over the competition's results; resolving a merge-queue item moves its roster places to the Athlete. The Athlete page lists a Team result for every competition whose roster credits the Athlete, linked to the Team page (`/teams/:teamId`). Medals count through `belgiumMedals` (once per Entry per event) and `athleteMedals` (once per roster member), at Championships and the Games only. An `entrant` is an Athlete named on a competition's entry list; the Athlete page lists those competitions that have not ended yet under Upcoming.

**Assisted sources and the paste importer** (#25). An Assisted source is a `source` row with tier `assisted` (or any blocked source) plus its `sport` and `idScheme` (the IF ID scheme of its tables; the key when null); it needs no adapter. The Run sheet's Paste imports step (`app/curate/paste-imports.tsx`) lists those whose cadence has come round since `lastPastedAt` (`pasteImportDue`). "Read" keeps the pasted text (or the fetched plain HTML page) as a raw copy; the table is parsed by the pure rules in `app/domain/paste-table.ts` (`readPastedTable`, `readHtmlTable`, `columnMapping`, `belgianPastedRows`); "confirm" writes the ticked rows through `belgianRows()`, like an adapter, and saves `columnMapping` (role per lower-cased header) on the source. Rows need an IF ID column. Rankings, timetables and heat detail extend the column roles and the confirm step rather than adding importers.

**Manual results** (#26, `app/curate/manual-results.tsx`). A result is due when an Athlete is an `entrant` of a competition whose Source has tier `manual` and whose `endDate` has come (Belgian date), and they have no result there yet. The form keeps what the owner typed as a JSON raw copy whose `url` is the source URL (the PDF), then writes through the same `belgianRows(...).result()` writer, passing `athleteId` instead of `person` (no identity matching). DNS is recorded only here and never moves "Athlete since"; "Did not compete" writes no result and removes the `entrant` row.

**Participation** (set by #29). Confirmed and likely Participations from sources are **derived, never stored**: `participationsBetween(db, from, to)` (`app/calendar/participations.ts`) gathers the facts and the domain rule `participation(facts)` decides. Confirmed = an `entrant` or `result` row names a Belgian Athlete (start lists and Selections add their rows to the same "named" fact when they arrive, not a new table). Likely = a Belgian result at the previous edition, i.e. the latest earlier `competition` with the same `series`. So **every adapter should set `series`** on `run.rows.competition()`: a key stable from one edition to the next, prefixed by source (`isu:world-cup:calgary`, `isu:european-championships`, `olympic-games`); Europeans and Worlds, indoor and outdoor, short and long course get separate series. The owner's word (added by hand, confirmed, kept, dropped, last checked) is the only stored part: `participation_curation`, written by the Run sheet's Selections & likely step (`app/curate/selections-likely.tsx`). "In contention" is a fact slot waiting for Qualification status (#32). Calendar, iCal feed (#30), this step and the Paste imports step (a due Assisted source is listed only with a confirmed or likely competition within 7 days of today, from that source or in its sport) all read through `participationsBetween`.

**Adding an Automatic source:** record fixtures of one realistic run (trim by hand where large, note it in `trimmedByHand`), export the ready-to-stub list from `tests/fixtures/sources/<source>/index.ts`, write the Worker test against `deliverIngestJobs([{ kind: "fetch-source", source }])`, then the adapter, its registry entry and the Source row. Before it counts as Automatic, the owner runs "Fetch now" on the deployed test copy; a refusal shows it as blocked (Assisted).

## Phases (Championship and Games pages)

Set by #31. Every Championship and the Games (and, from #35, each Games sport) is in one of five Phases: Standards → Qualification → Selection → Live → After.

**The rule is pure.** `currentPhase(inputs, now)` in `app/domain/phase.ts` decides from `PhaseInputs`: `startDate`/`endDate` (venue-local days), `venueZone` (Belgian time when null), `standardsPublishedOn`, `firstSelectedOn` (Belgian dates) and `firstSessionStart` (venue-local `YYYY-MM-DDTHH:mm`). Later inputs win (a competition that has started is Live even with no standards recorded); without a Session, Live starts at midnight venue time on day one; After starts when the last day ends at the venue. `phaseToShow(asked, current)` keeps `?phase=` to the current phase or an earlier one. Table tests: `tests/domain/phase.test.ts`; add a row for every new case.

**Inputs come from one place.** `phaseInputsFor(db, competitions)` (`app/competition/phase-inputs.ts`) builds the inputs for a batch of competitions; `currentPhasesOf(db, ids, now)` gives lists their phases. Today it fills the standards from the owner's record on `competition` (`standards_expected_on`, `standards_published_on`, `standards_url`, `standards_text`, edited at `/curate/championships/:id/standards`); `firstSelectedOn` and `firstSessionStart` are still null. **#34 (Selection)** fills `firstSelectedOn` with the earliest Selection's date; **#37 (Sessions)** fills `firstSessionStart` with the earliest Session's venue-local start. Pages never compute inputs themselves.

**Phase content plugs into panels.** `app/competition/phase-panels.tsx`: `loadPhasePanel(db, competition, phase, now)` loads only the shown phase (one member of the `PhasePanelData` union) and `PhasePanel` renders it inside `<section class="phase" aria-label="<Phase>">`. To add a phase's content (#32 Qualification, #34 Selection, #37/#38 Live, #41 After): widen that phase's union member, load it in its `case`, render it in place of the "not recorded yet" line. `PhaseBar` (`app/competition/phase-bar.tsx`) is the shared five-step bar (current marked "● now"; it and earlier phases are links, later ones greyed).

**The Games (#35)** reuse all three: a Games page builds `PhaseInputs` per sport (that sport's days, Selection and first Session) for the per-sport phase, and the Games' own inputs for the whole; sport chips are an extra argument to `loadPhasePanel`, not a second set of panels.

## Offline reading and curation routes

The service worker caches every page and its React Router data (`<path>.data`) as it is viewed, network first, and precaches the app shell. **Curation routes must live under `/curate`** (`CURATION_PATH` in `app/domain/offline-reading.ts`): they are never cached, and offline the root layout replaces them with an offline message, so the owner never fills in a stale form. Anything else counts as a reader page.

**Curation is owner-only.** The fetch handler refuses every `/curate` path (and its `.data` request, in any case or encoding: `isCurationPath`) with a 403 unless Cloudflare Access's `Cf-Access-Authenticated-User-Email` is `OWNER_EMAIL` (a var per environment in `wrangler.jsonc`; see `app/owner.ts`). The local dev copy (`APP_ENV` "dev") has no Access in front, so a request without that header counts as the owner's there; deployed copies fail closed. In tests, `signedInAs(email)` from `tests/support/worker.ts` sends the header, and `getDeployed(path)` runs a request as a deployed copy would. Static files are served as named (`assets.html_handling: "none"`). The service worker is registered in production builds only.

## The Run sheet (curation workspace)

Set by #24. The weekly session is `/curate/run/<step>` (`app/routes/curate.run.tsx`); `/curate` opens its first step. The steps, their order, time estimates, per-item minutes and one-line purposes are data in `WEEKLY_RUN_SHEET` (`app/domain/run-sheet.ts`); `runSheetProgress` decides ✓ (empty or passed) and the estimated time left.

**Adding a step's items** (#25, #26, …): put the step's loader, action and component in `app/curate/<step>.tsx` (see `source-health.tsx`, `merge-queue.tsx`): `load…(db, now)` returns the items plus `open` (the item count), `actOn…(…)` does one owner action and returns the session-log message. Then in `curate.run.tsx` add the open count to `loadSteps`, dispatch the step's intents in `action`, and render the component. Every action is logged through `logAction` (`app/curate/session.ts`); "next" with items left logs a pass, which ticks the step for the rest of the session. A session opens with its first logged action and closes on "Finish session" (the last step's Next).

## Cron triggers

The scheduled handler dispatches on `controller.cron`: `0 4 * * *` daily ingest (queues due sources), `0 3 * * 1` weekly backup (`runScheduled(cron, time)` in tests). Both run on the live copy only; the test copy has none.

## Environments and deploying

`wrangler.jsonc`: top level = local dev and tests; `env.test` and `env.live` = the two deployed copies, each with its own D1 (`bsh-test`, `bsh-live`), R2 bucket and queue. `workers_dev` and preview URLs are off; each copy has a custom-domain route. The test copy has no cron triggers; the live copy runs the daily ingest cron.

- **Test copy:** `.github/workflows/deploy-test.yml` runs typecheck, tests, then `npm run deploy:test` on every push to `main`.
- **Live copy ("update app"):** `.github/workflows/deploy-live.yml`, run by hand (`gh workflow run deploy-live.yml --ref main`).
- Pull requests run `.github/workflows/ci.yml` (typecheck + tests).

With the Cloudflare Vite plugin, the environment is chosen at **build** time (`CLOUDFLARE_ENV=test react-router build`); `wrangler deploy` then uses `build/server/wrangler.json`. Commands that must read the source config (D1 migrations, `wrangler types`) pass `-c wrangler.jsonc`.

Placeholders in `wrangler.jsonc` (marked `PLACEHOLDER`) must be replaced before the first deploy: the custom domain (`bsh.example.com`, `test.bsh.example.com`) and the D1 database ids.

Cloudflare Access is configured in the Zero Trust dashboard, not in code: one self-hosted application per copy covering the whole domain, an email allowlist policy with one-time PIN login, and a second self-hosted application for the iCal feed path only (`<domain>/ical/*`) with a single Bypass policy (Include: Everyone). A more specific path application takes precedence over the whole-domain one, so only the feed skips Access.

**iCal feed** (#30, `app/calendar/feed.ts`, `app/routes/ical.tsx`). Calendar apps can't pass Access, so the feed is `/ical/<token>.ics` and answers only when `<token>` equals the `ICAL_FEED_TOKEN` Worker secret (compared in constant time); anything else gets a bare 404, and without the secret the feed is off and the Calendar shows no subscribe link. Set it per copy with `wrangler secret put ICAL_FEED_TOKEN --env test|live` (a long random value, e.g. `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`; locally in `.dev.vars`); putting a new value cuts off every old subscription. The feed lists what the Calendar tab shows (through `participationsBetween` + `onCalendar`), from a year back to four years ahead, as all-day events; the iCal text itself is the pure rule `icalFeed` (`app/domain/ical.ts`). In tests, `getWithSecrets(path, { ICAL_FEED_TOKEN })` sets the secret for one request. The owner's Access email goes in `OWNER_EMAIL` (placeholder `owner@example.com` in `env.test` and `env.live`).
