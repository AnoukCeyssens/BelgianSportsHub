import { and, eq } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { now } from "~/clock";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import { belgianDate } from "~/domain";
import { activeFactsOf, activeStatuses, type ActiveFactKind } from "~/roster/active";
import { activeStatusText, factBehind } from "~/roster/status-line";
import type { Route } from "./+types/curate.entry-status";

// Owner-only (under /curate); ticket #28, spec #20 stories 20–23 and 114.
// The owner records, edits or clears the curated facts behind an Entry's
// Active status, outside the Run sheet: a Hold, a retirement (for a Team, its
// dissolution) and, for an Athlete, a change of sporting nationality. Each
// fact carries its source and the date it was last checked. Served at
// /curate/athletes/:id/status and /curate/teams/:id/status.

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Status · ${loaderData?.name ?? "Entry"} · BelgianSportsHub` }];
}

type Entry = { kind: "athlete" | "team"; id: string; name: string; page: string };

/** The facts the owner can record for each kind of Entry, in form order. */
const KINDS: Record<Entry["kind"], { kind: ActiveFactKind; title: string; dateLabel: string; noteLabel: string | null; help: string }[]> = {
  athlete: [
    { kind: "hold", title: "Hold", dateLabel: "Keep Active until", noteLabel: "Reason", help: "Keeps the Athlete Active through a known absence (injury, pregnancy, sabbatical). After this date the 12-month rule applies again." },
    { kind: "retirement", title: "Retirement", dateLabel: "Retired on", noteLabel: null, help: "Inactive at once; a later performance clears it automatically." },
    { kind: "nationality-change", title: "Change of sporting nationality", dateLabel: "Changed on", noteLabel: "New sporting nationality", help: "Inactive until cleared here; the Belgian history stays." },
  ],
  team: [
    { kind: "hold", title: "Hold", dateLabel: "Keep Active until", noteLabel: "Reason", help: "Keeps the Team Active through a known absence. After this date the 12-month rule applies again." },
    { kind: "dissolution", title: "Dissolution", dateLabel: "Dissolved on", noteLabel: null, help: "Inactive at once; a later performance clears it automatically." },
  ],
};

async function entryOf(context: Route.LoaderArgs["context"], params: Route.LoaderArgs["params"], request: Request): Promise<Entry> {
  const db = dbFrom(context);
  const kind = new URL(request.url).pathname.startsWith("/curate/teams/") ? "team" : "athlete";
  const id = params.entryId;
  const row =
    kind === "team"
      ? await db.query.team.findFirst({ where: eq(schema.team.id, id) })
      : await db.query.athlete.findFirst({ where: eq(schema.athlete.id, id) });
  if (!row) throw data(kind === "team" ? "No such Team" : "No such Athlete", { status: 404 });
  return { kind, id, name: row.name, page: kind === "team" ? `/teams/${id}` : `/athletes/${id}` };
}

const key = (entry: Entry) => (entry.kind === "team" ? { teamId: entry.id } : { athleteId: entry.id });

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const entry = await entryOf(context, params, request);
  const db = dbFrom(context);
  const statuses = await activeStatuses(db, now(), entry.kind === "team" ? { teamIds: [entry.id] } : { athleteIds: [entry.id] });
  const status = (entry.kind === "team" ? statuses.teams : statuses.athletes).get(entry.id)!;
  const facts = await activeFactsOf(db, key(entry));
  return {
    ...entry,
    statusText: activeStatusText(status, factBehind(status, facts)),
    today: belgianDate(now()),
    facts: KINDS[entry.kind].map((k) => ({ ...k, saved: facts.get(k.kind) ?? null })),
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function action({ context, params, request }: Route.ActionArgs) {
  const entry = await entryOf(context, params, request);
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim() || null;
  const kind = field("kind") as ActiveFactKind | null;
  if (!kind || !KINDS[entry.kind].some((k) => k.kind === kind)) throw data("Unknown fact", { status: 400 });

  const f = schema.activeFact;
  const db = dbFrom(context);
  const owner = entry.kind === "team" ? eq(f.teamId, entry.id) : eq(f.athleteId, entry.id);
  await db.delete(f).where(and(owner, eq(f.kind, kind)));
  if (field("intent") !== "clear") {
    const date = field("date");
    const checkedOn = field("checkedOn") ?? belgianDate(now());
    const source = field("source");
    if (!date || !DATE.test(date)) throw data("date must be a date (YYYY-MM-DD)", { status: 400 });
    if (!DATE.test(checkedOn)) throw data("checkedOn must be a date (YYYY-MM-DD)", { status: 400 });
    if (!source) throw data("Every curated fact needs a source", { status: 400 });
    await db.insert(f).values({ ...key(entry), kind, date, note: field("note"), source, checkedOn });
  }
  return redirect(entry.page, 303);
}

export default function EntryStatus({ loaderData }: Route.ComponentProps) {
  const { name, page, statusText, today, facts } = loaderData;
  return (
    <>
      <h1>Status</h1>
      <p className="meta">
        <Link to={page}>{name}</Link>
      </p>
      <p className="sub">{statusText}</p>
      {facts.map((fact) => (
        <section key={fact.kind}>
          <h2>{fact.title}</h2>
          <p className="sub">{fact.help}</p>
          {/* Validation (date, source) happens in the action; 400 on a gap. */}
          <Form method="post" className="standards-form">
            <input type="hidden" name="kind" value={fact.kind} />
            <label>
              {fact.dateLabel}
              <input type="date" name="date" defaultValue={fact.saved?.date ?? ""} />
            </label>
            {fact.noteLabel ? (
              <label>
                {fact.noteLabel}
                <input type="text" name="note" defaultValue={fact.saved?.note ?? ""} />
              </label>
            ) : null}
            <label>
              Source (URL or where you read it)
              <input type="text" name="source" defaultValue={fact.saved?.source ?? ""} />
            </label>
            <label>
              Last checked
              <input type="date" name="checkedOn" defaultValue={today} />
            </label>
            <button type="submit" name="intent" value="save">
              Save
            </button>
            {fact.saved ? (
              <button type="submit" name="intent" value="clear">
                Clear
              </button>
            ) : null}
          </Form>
        </section>
      ))}
    </>
  );
}
