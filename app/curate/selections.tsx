// Run sheet step 6, Selections & likely, part 1 (spec #20, stories 46, 81, 85
// and 108; ticket #34): Selections from federation press releases. One item
// per competition × sport whose Selection is due (`selectionDue`: it starts
// within eight weeks or its qualification window has closed) and not
// recorded yet; any other one opens from the owner's Qualification page
// (`?selection=<competition>&sport=<sport>`). "Find names" keeps the pasted
// press release as a raw copy and pre-ticks the candidates it names; "Save
// Selection" makes the ticked Entries Selected and the other candidates Not
// selected, with the selector and the press release URL as source. The IF
// entry list replaces it when an adapter stores one (`applyEntryList`), or
// when the owner saves a pasted entry list here.
import { and, eq, gte, inArray } from "drizzle-orm";
import { Form } from "react-router";
import { type Db, getDb, schema } from "~/db/client";
import { belgianDate, namesFoundIn, referenceGamesOf, selectionDue, selectorFor } from "~/domain";
import { formatDayRange } from "~/format";
import { keepRawCopy } from "~/ingest/raw-copy";
import { potentialEntries } from "~/qualification/entries";
import { asSelectionCandidates, recordSelection, selectionCandidates, type Candidate } from "~/qualification/selection";

const STEP_PATH = "/curate/run/selections-likely";
const RAW_SOURCE = "selection";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type CompetitionRow = typeof schema.competition.$inferSelect;

export type SelectionItem = {
  competition: { id: string; name: string; days: string };
  sport: string;
  selector: string;
  url: string;
  announcedOn: string;
  kind: "press-release" | "entry-list";
  rawCopyId: string | null;
  text: string;
  candidates: { id: string; label: string; ticked: boolean }[];
};

const itemOf = (c: CompetitionRow, sport: string, candidates: Candidate[], over: Partial<SelectionItem> = {}): SelectionItem => ({
  competition: {
    id: c.id,
    name: c.name,
    days: `${formatDayRange(c.startDate, c.endDate)} ${c.endDate.slice(0, 4)}`,
  },
  sport,
  selector: candidates.find((x) => x.selection?.selector)?.selection?.selector ?? selectorFor(c.kind) ?? "",
  url: "",
  announcedOn: "",
  kind: "press-release",
  rawCopyId: null,
  text: "",
  candidates: candidates.map((x) => ({
    id: x.id,
    label: `${x.who.name} · ${x.event}`,
    ticked: false,
  })),
  ...over,
});

/** The Selections due this week: Championships and Games not over, per sport with candidates and no Selection yet. */
export async function loadDueSelections(db: Db, now: Date): Promise<SelectionItem[]> {
  const c = schema.competition;
  const competitions = (
    await db
      .select()
      .from(c)
      .where(and(inArray(c.kind, ["championship", "games"]), gte(c.endDate, belgianDate(now))))
  ).filter((x) => !referenceGamesOf(x) && selectionDue(x, now));
  if (competitions.length === 0) return [];
  const entries = await potentialEntries(
    db,
    competitions.map((x) => x.id),
    now,
  );
  const items: SelectionItem[] = [];
  for (const competition of competitions) {
    const sports = [...new Set(entries.filter((e) => e.competitionId === competition.id).map((e) => e.sport))];
    for (const sport of sports) {
      const candidates = await selectionCandidates(db, competition.id, sport, now);
      if (candidates.length === 0 || candidates.some((x) => x.selection !== null)) continue;
      items.push(itemOf(competition, sport, candidates));
    }
  }
  return items;
}

/** The Selection opened by hand or after "Find names" (`?selection=<competition>&sport=…&raw=…`), names found pre-ticked. */
export async function loadSelectionReview(env: Pick<Env, "DB" | "RAW">, db: Db, search: URLSearchParams, now: Date): Promise<SelectionItem | null> {
  const competitionId = search.get("selection");
  const sport = search.get("sport");
  if (!competitionId || !sport) return null;
  const competition = await competitionOf(db, competitionId);
  const candidates = await selectionCandidates(db, competition.id, sport, now);
  const rawId = search.get("raw");
  const text = rawId ? await rawText(env, db, rawId) : "";
  const found = new Set(
    rawId ? namesFoundIn(text, asSelectionCandidates(candidates)) : candidates.filter((x) => x.status === "selected").map((x) => x.id),
  );
  const item = itemOf(competition, sport, candidates, {
    url: search.get("url") ?? "",
    announcedOn: search.get("announcedOn") ?? "",
    kind: search.get("kind") === "entry-list" ? "entry-list" : "press-release",
    rawCopyId: rawId,
    text,
  });
  if (search.get("selector")) item.selector = search.get("selector")!;
  item.candidates = item.candidates.map((x) => ({
    ...x,
    ticked: found.has(x.id),
  }));
  return item;
}

/** Does one owner Selection action; returns the session-log message and where to go next. */
export async function actOnSelection(
  env: Pick<Env, "DB" | "RAW">,
  intent: string,
  form: FormData,
  now: Date,
): Promise<{ message: string; to: string }> {
  const db = getDb(env.DB);
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const competition = await competitionOf(db, field("competition"));
  const sport = field("sport");
  if (!sport) throw new Response("Which sport's Selection?", { status: 400 });
  const kind = field("kind") === "entry-list" ? "entry-list" : "press-release";
  const label = `${competition.name} · ${sport}`;
  const keep = () =>
    keepRawCopy(env, {
      source: RAW_SOURCE,
      url: field("url") || `paste:${RAW_SOURCE}`,
      body: field("text"),
      contentType: "text/plain; charset=utf-8",
      fetchedAt: now,
    });

  if (intent === "read-selection") {
    if (!field("text")) throw new Response("Paste the press release text", { status: 400 });
    const query = new URLSearchParams({
      selection: competition.id,
      sport,
      raw: await keep(),
    });
    for (const name of ["url", "selector", "announcedOn", "kind"]) if (field(name)) query.set(name, field(name));
    return {
      message: `${label}: press release read`,
      to: `${STEP_PATH}?${query}#selection`,
    };
  }
  if (intent !== "save-selection") throw new Response(`Unknown action ${intent}`, { status: 400 });

  const sourceUrl = field("url");
  if (!/^https?:\/\//.test(sourceUrl)) throw new Response("Give the press release (or entry list) URL: it is the source", { status: 400 });
  const selector = field("selector");
  if (!selector) throw new Response("Name the selector (the national federation for a Championship)", { status: 400 });
  const announcedOn = field("announcedOn") || belgianDate(now);
  if (!DATE.test(announcedOn))
    throw new Response("The announcement date must be a date (YYYY-MM-DD)", {
      status: 400,
    });
  const rawCopyId = field("raw") || (field("text") ? await keep() : null);
  const counts = await recordSelection(
    db,
    {
      competitionId: competition.id,
      sport,
      selector,
      sourceUrl,
      kind,
      announcedOn,
      rawCopyId,
      selected: form.getAll("selected").map(String),
    },
    now,
  );
  return {
    message: `${label}: Selection saved (${counts.selected} Selected, ${counts.notSelected} Not selected)`,
    to: STEP_PATH,
  };
}

async function competitionOf(db: Db, id: string) {
  const row = await db.query.competition.findFirst({
    where: eq(schema.competition.id, id),
  });
  if (!row || (row.kind !== "championship" && row.kind !== "games") || referenceGamesOf(row))
    throw new Response("No such Championship or Games", { status: 404 });
  return row;
}

async function rawText(env: Pick<Env, "RAW">, db: Db, rawId: string) {
  const copy = await db.query.rawCopy.findFirst({
    where: and(eq(schema.rawCopy.id, rawId), eq(schema.rawCopy.source, RAW_SOURCE)),
  });
  if (!copy) throw new Response(`No raw copy ${rawId}`, { status: 404 });
  const object = await env.RAW.get(copy.r2Key);
  if (!object) throw new Response(`Raw copy ${rawId} is missing from R2`, { status: 500 });
  return object.text();
}

/** One Selection to enter: press release URL and text, the selector, the candidates (names found pre-ticked). */
export function SelectionCard({ item, opened = false }: { item: SelectionItem; opened?: boolean }) {
  return (
    <section className="card selection" aria-label={`Selection · ${item.competition.name} · ${item.sport}`} id={opened ? "selection" : undefined}>
      <h3>{`${item.competition.name} · ${item.sport}`}</h3>
      <p className="sub">{`${item.competition.days} · selector: ${item.selector || "the national federation"}`}</p>
      <Form method="post" className="fields">
        <input type="hidden" name="competition" value={item.competition.id} />
        <input type="hidden" name="sport" value={item.sport} />
        {item.rawCopyId ? <input type="hidden" name="raw" value={item.rawCopyId} /> : null}
        <label>
          Source
          <select name="kind" defaultValue={item.kind}>
            <option value="press-release">Press release</option>
            <option value="entry-list">IF entry list</option>
          </select>
        </label>
        <label>
          URL (becomes the source)
          <input name="url" type="url" defaultValue={item.url} placeholder="https://…/news/selection" />
        </label>
        <label>
          Selector
          <input name="selector" defaultValue={item.selector} placeholder="Belgian … federation" />
        </label>
        <label>
          Announced on
          <input name="announcedOn" type="date" defaultValue={item.announcedOn} />
        </label>
        <label>
          Press release text
          <textarea name="text" rows={4} defaultValue={item.text} />
        </label>
        <button type="submit" name="intent" value="read-selection" className="secondary">
          Tick the names found in the text
        </button>
        <fieldset>
          <legend>Potential Entries</legend>
          {item.candidates.map((c) => (
            <label key={c.id} className="candidate">
              <input type="checkbox" name="selected" value={c.id} defaultChecked={c.ticked} />
              {c.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" name="intent" value="save-selection">
          Save Selection (ticked Selected, the rest Not selected)
        </button>
      </Form>
      <p className="sub">Replaced by the IF entry list once it is published.</p>
    </section>
  );
}
