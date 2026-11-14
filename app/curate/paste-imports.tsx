// Run sheet step 2, Paste imports (spec #20, stories 4, 92 and 104; ticket
// #25): the one generic importer for every Assisted source. Each source due
// this week is a row; opened, the owner pastes the URL of a plain HTML page or
// the table copied from the browser ("read", kept as a raw copy in R2), checks
// the column mapping (saved for the source, else guessed), reviews the
// Belgian rows with their identity match, and confirms: the ticked rows are
// written as Results through the same writer as Automatic sources, so
// unmatched identities land in the merge queue (step 4) in the same session.
import { and, asc, eq } from "drizzle-orm";
import { Form, Link } from "react-router";
import { participationsBetween } from "~/calendar/participations";
import { type Db, schema } from "~/db/client";
import {
  BELGIAN_ZONE,
  belgianPastedRows,
  columnMapping,
  identityMatch,
  mappingToSave,
  PASTE_COLUMN_ROLES,
  pasteImportDue,
  readHtmlTable,
  readPastedTable,
  REFERENCE_GAMES,
  type KnownIdentity,
  type PasteColumnRole,
  type PastedResultRow,
  type PastedTable,
  type SavedColumnMapping,
  type SourceTier,
} from "~/domain";
import { referenceGamesRow } from "~/competition/reference-games";
import { formatInstant } from "~/format";
import { belgianRows } from "~/ingest/belgian-rows";
import { knownIdentities } from "~/ingest/identities";
import { fetchAndKeep, keepRawCopy } from "~/ingest/raw-copy";
import { SourceBlocked, type CompetitionKind } from "~/ingest/source-adapter";

const STEP_PATH = "/curate/run/paste-imports";
const importerPath = (source: string, raw?: string) => `${STEP_PATH}?source=${encodeURIComponent(source)}${raw ? `&raw=${encodeURIComponent(raw)}` : ""}`;

const ROLE_LABEL: Record<PasteColumnRole, string> = {
  ignore: "(ignore)",
  place: "place",
  name: "name",
  nation: "nation",
  performance: "performance",
  "if-id": "IF ID",
  "date-of-birth": "date of birth",
  event: "event",
};

const KINDS: Record<CompetitionKind, string> = { championship: "Championship", games: "Games", circuit: "Circuit (World Cup, Grand Prix…)" };

type SourceRow = typeof schema.source.$inferSelect;

/** How far around today a competition counts as "this week" for a paste import. */
const PARTICIPATION_WINDOW_DAYS = 7;

const shiftDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The Assisted sources due this week (configured Assisted, or blocked) that
 * have a Belgian Participation this week (spec #20, story 104): a confirmed
 * or likely competition within a week either side of today, from that source
 * or in its sport.
 */
export async function loadPasteImports(db: Db, now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BELGIAN_ZONE }).format(now);
  const [sources, nearby] = await Promise.all([
    db.select().from(schema.source).orderBy(asc(schema.source.name)),
    participationsBetween(db, shiftDays(today, -PARTICIPATION_WINDOW_DAYS), shiftDays(today, PARTICIPATION_WINDOW_DAYS)),
  ]);
  const belgian = nearby.filter((c) => c.participation.status !== "none");
  const hasParticipation = (s: SourceRow) => belgian.some((c) => c.source === s.key || (s.sport !== null && c.sport === s.sport));
  const imports = sources
    .filter((s) => pasteImportDue({ ...s, tier: s.tier as SourceTier }, now) && hasParticipation(s))
    .map((s) => ({ key: s.key, name: s.name, sport: s.sport, blocked: s.blockedAt !== null, lastPastedAt: s.lastPastedAt }));
  return { imports, open: imports.length };
}

export type PasteImportsData = Awaited<ReturnType<typeof loadPasteImports>>;

/** The opened importer (`?source=…`), with the read table (`&raw=…`) and any mapping the owner changed (`&col.N=…`). */
export async function loadPasteImporter(env: Pick<Env, "DB" | "RAW">, db: Db, search: URLSearchParams) {
  const key = search.get("source");
  if (!key) return null;
  const source = await db.query.source.findFirst({ where: eq(schema.source.key, key) });
  if (!source) throw new Response(`No source ${key}`, { status: 404 });
  const rawId = search.get("raw");
  if (!rawId) return { source: describe(source), read: null };

  const { copy, table } = await readRawCopy(env, db, source.key, rawId);
  const saved = columnMapping(table.head, (source.columnMapping as SavedColumnMapping | null) ?? null);
  const chosen = rolesFrom(search, table.head.length);
  const roles = chosen ?? saved.roles;
  const rows = belgianPastedRows(table, roles);
  const identities = await identitiesOf(env.DB, db, idSchemeOf(source), rows);
  return {
    source: describe(source),
    read: {
      rawCopyId: copy.id,
      url: copy.url.startsWith("paste:") ? null : copy.url,
      readAt: copy.fetchedAt,
      head: table.head,
      roles,
      mappingNote: chosen ? "as you set them" : saved.fromSaved ? "saved mapping applied" : "guessed, check them",
      rowCount: table.rows.length,
      hasNation: roles.includes("nation"),
      hasIfId: roles.includes("if-id"),
      shown: (["event", "place", "name", "performance"] as const).filter((r) => roles.includes(r)),
      rows: rows.map((row, i) => ({ ...row, identity: identities[i] })),
    },
  };
}

export type PasteImporterData = NonNullable<Awaited<ReturnType<typeof loadPasteImporter>>>;

/**
 * One owner action: "read" keeps the pasted text (or the fetched page) as a
 * raw copy and opens it in the importer; "confirm" writes the ticked rows and
 * saves the column mapping. Returns the session-log message and where to go next.
 */
export async function actOnPasteImport(
  env: Pick<Env, "DB" | "RAW">,
  db: Db,
  intent: string,
  form: FormData,
  now: Date,
): Promise<{ message: string; to: string }> {
  const key = String(form.get("source"));
  const source = await db.query.source.findFirst({ where: eq(schema.source.key, key) });
  if (!source) throw new Response(`No source ${key}`, { status: 404 });
  if (intent === "read") return read(env, source, form, now);
  if (intent === "confirm") return confirm(env, db, source, form, now);
  throw new Response(`Unknown action ${intent}`, { status: 400 });
}

async function read(env: Pick<Env, "DB" | "RAW">, source: SourceRow, form: FormData, now: Date) {
  const text = String(form.get("text") ?? "");
  const url = String(form.get("url") ?? "").trim();
  let rawCopyId: string;
  let table: PastedTable;
  if (text.trim() !== "") {
    rawCopyId = await keepRawCopy(env, {
      source: source.key,
      url: url || `paste:${source.key}`,
      body: text,
      contentType: "text/plain; charset=utf-8",
      fetchedAt: now,
    });
    table = readPastedTable(text);
  } else if (url !== "") {
    try {
      const fetched = await fetchAndKeep(env, source.key, url);
      rawCopyId = fetched.rawCopyId;
      table = readHtmlTable(fetched.text);
    } catch (error) {
      const why = error instanceof SourceBlocked ? `refused the Worker (${error.message.match(/\((\d+)\)$/)?.[1] ?? "blocked"})` : "could not be read";
      return { message: `${source.name}: the page ${why}; copy the table from your browser instead`, to: importerPath(source.key) };
    }
  } else {
    throw new Response("Paste a URL or the table", { status: 400 });
  }
  return { message: `${source.name}: read ${table.rows.length} rows`, to: importerPath(source.key, rawCopyId) };
}

async function confirm(env: Pick<Env, "DB" | "RAW">, db: Db, source: SourceRow, form: FormData, now: Date) {
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const sport = field("sport") || source.sport;
  // A reference Games (Paris 2024, Milano-Cortina 2026, ticket #46) is the owner's one row; any other competition is the source's.
  const reference = field("reference") ? REFERENCE_GAMES.find((g) => g.key === field("reference")) : undefined;
  if (field("reference") && !reference) throw new Response("No such reference Games", { status: 400 });
  const competitionName = reference?.name ?? field("competition");
  const startDate = reference?.startDate ?? field("startDate");
  const endDate = reference?.endDate ?? field("endDate");
  const kind = (reference ? "games" : field("kind")) as CompetitionKind;
  if (!competitionName || !startDate || !endDate || !(kind in KINDS) || !sport) {
    throw new Response("Competition, kind, sport and dates are required", { status: 400 });
  }
  const date = field("date") || endDate;
  if (reference && (date < startDate || date > endDate)) {
    throw new Response(`The event day must lie within ${reference.name}`, { status: 400 });
  }

  const { copy, table } = await readRawCopy(env, db, source.key, field("raw"));
  const roles = rolesFrom(form, table.head.length) ?? columnMapping(table.head, null).roles;
  const ticked = new Set(form.getAll("row").map(String));
  const rows = belgianPastedRows(table, roles).filter((r) => ticked.has(String(r.index)) && r.ifId !== null);
  if (rows.some((r) => !(r.event ?? field("event")))) throw new Response("Name the event", { status: 400 });

  const scheme = idSchemeOf(source);
  const identities = await identitiesOf(env.DB, db, scheme, rows);
  const writer = belgianRows(env.DB, source.key, now);
  const competitionRef = reference ? reference.key : `${slug(competitionName)}:${startDate}`;
  const competitionId = reference
    ? await referenceGamesRow(env, reference, now)
    : await writer.competition({
        name: competitionName,
        sport,
        kind,
        startDate,
        endDate,
        city: null,
        country: null,
        venueZone: null,
        sourceRef: competitionRef,
        rawCopyId: copy.id,
      });
  for (const row of rows) {
    const event = row.event ?? field("event");
    await writer.result({
      competitionId,
      person: { name: row.name, dateOfBirth: row.dateOfBirth, nationality: "BEL", ifId: { scheme, value: row.ifId! } },
      event,
      // The reference Games' row spans every sport: each result names its own.
      ...(reference ? { sport } : {}),
      date,
      place: row.place,
      status: row.status,
      performance: row.performance,
      sourceRef: `${competitionRef}:${slug(event)}:${scheme}:${row.ifId}`,
      rawCopyId: copy.id,
    });
  }

  const stamp = now.toISOString();
  const firstMapping = source.columnMapping === null;
  await db
    .update(schema.source)
    .set({
      columnMapping: { ...(source.columnMapping ?? {}), ...mappingToSave(table.head, roles) },
      sport,
      lastPastedAt: stamp,
      // A configured Assisted source's health is its pastes; a blocked Automatic one keeps its fetch history.
      ...(source.tier === "assisted" ? { lastAttemptAt: stamp, lastSuccessAt: stamp, ...(writer.changes() > 0 ? { lastChangeAt: stamp } : {}) } : {}),
    })
    .where(eq(schema.source.key, source.key));

  const queued = identities.filter((i) => i.kind === "queue").length;
  const message = [
    `${source.name}: wrote ${rows.length} result${rows.length === 1 ? "" : "s"}`,
    queued > 0 ? `, ${queued} sent to the merge queue` : "",
    firstMapping ? " · column mapping saved" : "",
  ].join("");
  return { message, to: STEP_PATH };
}

function describe(source: SourceRow) {
  return { key: source.key, name: source.name, sport: source.sport, idScheme: idSchemeOf(source), hasMapping: source.columnMapping !== null };
}

function idSchemeOf(source: SourceRow) {
  return source.idScheme ?? source.key;
}

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Column roles the owner chose (`col.0`, `col.1`, …), or null when none were sent. */
function rolesFrom(fields: URLSearchParams | FormData, columns: number): PasteColumnRole[] | null {
  if (fields.get("col.0") === null) return null;
  return Array.from({ length: columns }, (_, i) => {
    const role = String(fields.get(`col.${i}`) ?? "ignore");
    return (PASTE_COLUMN_ROLES as readonly string[]).includes(role) ? (role as PasteColumnRole) : "ignore";
  });
}

async function readRawCopy(env: Pick<Env, "RAW">, db: Db, sourceKey: string, rawId: string) {
  const copy = await db.query.rawCopy.findFirst({ where: and(eq(schema.rawCopy.id, rawId), eq(schema.rawCopy.source, sourceKey)) });
  if (!copy) throw new Response(`No raw copy ${rawId}`, { status: 404 });
  const object = await env.RAW.get(copy.r2Key);
  if (!object) throw new Response(`Raw copy ${rawId} is missing from R2`, { status: 500 });
  const body = await object.text();
  const table = copy.contentType?.includes("html") ? readHtmlTable(body) : readPastedTable(body);
  return { copy, table };
}

type IdentityPreview =
  | { kind: "athlete"; how: "IF ID" | "name + date of birth"; athlete: string }
  | { kind: "queue" }
  | { kind: "not-an-athlete" }
  | { kind: "no-id" };

/** What the writer will do with each row's person, the same way belgianRows() decides it. */
async function identitiesOf(d1: D1Database, db: Db, scheme: string, rows: PastedResultRow[]): Promise<IdentityPreview[]> {
  let roster: KnownIdentity[] | null = null;
  const athletes = new Map((await db.select({ id: schema.athlete.id, name: schema.athlete.name }).from(schema.athlete)).map((a) => [a.id, a.name]));
  const out: IdentityPreview[] = [];
  for (const row of rows) {
    if (!row.ifId) {
      out.push({ kind: "no-id" });
      continue;
    }
    const item = await db.query.mergeQueueItem.findFirst({
      where: and(eq(schema.mergeQueueItem.scheme, scheme), eq(schema.mergeQueueItem.value, row.ifId)),
    });
    if (item) {
      if (item.athleteId) out.push({ kind: "athlete", how: "IF ID", athlete: athletes.get(item.athleteId) ?? "" });
      else out.push({ kind: item.status === "not-an-athlete" ? "not-an-athlete" : "queue" });
      continue;
    }
    roster ??= await knownIdentities(d1);
    const match = identityMatch({ name: row.name, dateOfBirth: row.dateOfBirth, externalIds: [{ scheme, value: row.ifId }] }, roster);
    out.push(
      match.kind === "queue"
        ? { kind: "queue" }
        : { kind: "athlete", how: match.kind === "external-id" ? "IF ID" : "name + date of birth", athlete: athletes.get(match.athleteId) ?? "" },
    );
  }
  return out;
}

function IdentityCell({ identity }: { identity: IdentityPreview }) {
  switch (identity.kind) {
    case "athlete":
      return <span className="ok">{`✓ ${identity.how} → ${identity.athlete}`}</span>;
    case "queue":
      return <span className="warn">→ merge queue</span>;
    case "not-an-athlete":
      return <span className="sub">not an Athlete (ignored)</span>;
    case "no-id":
      return <span className="bad">no IF ID: type it under Manual results</span>;
  }
}

export function PasteImportsStep({ data, importer }: { data: PasteImportsData; importer: PasteImporterData | null }) {
  const listed = data.imports.some((i) => i.key === importer?.source.key);
  return (
    <>
      {data.imports.map((i) => (
        <div className="card" key={i.key}>
          <div className="improw">
            <div>
              <h3>{i.name}</h3>
              <div className="sub">
                {[i.sport, i.blocked ? "blocked, so pasted this week" : null, `last pasted ${formatInstant(i.lastPastedAt)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {importer?.source.key === i.key ? null : (
              <Link className="button" to={importerPath(i.key)}>
                Open
              </Link>
            )}
          </div>
          {importer?.source.key === i.key ? <Importer data={importer} /> : null}
        </div>
      ))}
      {importer && !listed ? (
        <div className="card">
          <h3>{importer.source.name}</h3>
          <Importer data={importer} />
        </div>
      ) : null}
    </>
  );
}

function Importer({ data }: { data: PasteImporterData }) {
  const { source, read } = data;
  return (
    <div className="importer">
      <p className="sub">
        {source.hasMapping ? (
          "Column mapping saved for this source."
        ) : (
          <span className="warn">No saved mapping yet: map the columns once and it is saved for this source.</span>
        )}
      </p>
      <Form method="post">
        <input type="hidden" name="source" value={source.key} />
        <label>
          URL of a plain HTML page
          <input type="url" name="url" placeholder="https://…" defaultValue={read?.url ?? ""} />
        </label>
        <label>
          or the table copied from the browser
          <textarea name="text" rows={6} />
        </label>
        <div className="actions">
          <button type="submit" name="intent" value="read" className={read ? "secondary" : undefined}>
            Read table
          </button>
        </div>
      </Form>
      {read ? <ReadTable source={source} read={read} /> : null}
    </div>
  );
}

function ReadTable({ source, read }: { source: PasteImporterData["source"]; read: NonNullable<PasteImporterData["read"]> }) {
  const ready = read.hasNation && read.hasIfId;
  return (
    <>
      <p className="sub">{`Read ${formatInstant(read.readAt)}${read.url ? ` from ${read.url}` : " from the paste"}, kept as a raw copy.`}</p>
      <Form method="get" className="maps">
        <input type="hidden" name="source" value={source.key} />
        <input type="hidden" name="raw" value={read.rawCopyId} />
        <h3>{`Columns (${read.mappingNote})`}</h3>
        {read.head.map((h, i) => (
          <label key={i}>
            {h}
            <select name={`col.${i}`} defaultValue={read.roles[i]}>
              {PASTE_COLUMN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className="secondary">
          Apply columns
        </button>
      </Form>
      {!read.hasNation ? <p className="warn">Map a nation column so the BEL rows can be suggested.</p> : null}
      {read.hasNation && !read.hasIfId ? <p className="warn">Map the IF ID column: identities are matched and queued by it.</p> : null}
      {ready ? (
        <Form method="post">
          <input type="hidden" name="source" value={source.key} />
          <input type="hidden" name="raw" value={read.rawCopyId} />
          {read.roles.map((r, i) => (
            <input key={i} type="hidden" name={`col.${i}`} value={r} />
          ))}
          <p>
            {`${read.rowCount} rows read · `}
            <b>{`${read.rows.length} BEL rows suggested`}</b>
            {` · ${read.rowCount - read.rows.length} others skipped`}
          </p>
          <table>
            <thead>
              <tr>
                <th />
                {read.shown.map((r) => (
                  <th key={r}>{ROLE_LABEL[r]}</th>
                ))}
                <th>Identity</th>
              </tr>
            </thead>
            <tbody>
              {read.rows.map((row) => (
                <tr key={row.index}>
                  <td>
                    {row.identity.kind === "no-id" || row.identity.kind === "not-an-athlete" ? null : (
                      <input type="checkbox" name="row" value={row.index} defaultChecked aria-label={`Import ${row.name}`} />
                    )}
                  </td>
                  {read.shown.map((r) => (
                    <td key={r}>{r === "place" ? (row.place ?? row.status) : row[r]}</td>
                  ))}
                  <td>
                    <IdentityCell identity={row.identity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="maps">
            <label>
              Reference Games
              <select name="reference" defaultValue="">
                <option value="">(none: name the competition)</option>
                {REFERENCE_GAMES.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Competition
              <input name="competition" />
            </label>
            <label>
              Kind
              <select name="kind" defaultValue="circuit">
                {Object.entries(KINDS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sport
              <input name="sport" required defaultValue={source.sport ?? ""} />
            </label>
            <label>
              First day
              <input type="date" name="startDate" />
            </label>
            <label>
              Last day
              <input type="date" name="endDate" />
            </label>
            {read.roles.includes("event") ? null : (
              <label>
                Event
                <input name="event" required placeholder="1000m Women" />
              </label>
            )}
            <label>
              Event day (if not the last)
              <input type="date" name="date" />
            </label>
          </div>
          <div className="actions">
            <button type="submit" name="intent" value="confirm">
              Confirm the ticked rows
            </button>
          </div>
        </Form>
      ) : null}
    </>
  );
}
