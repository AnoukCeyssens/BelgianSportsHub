// Run sheet step 4, Merge queue (spec #20, stories 4, 6 and 106): each
// incoming identity ingest could not match, beside the Athletes it might be.
// The owner links it, creates a new Athlete from it, or marks it not an
// Athlete; resolveMergeQueueItem() does the work.
import { asc, eq } from "drizzle-orm";
import { Form } from "react-router";
import { type Db, EXTERNAL_ID_SCHEMES, schema } from "~/db/client";
import { normaliseName } from "~/domain";
import { formatDate } from "~/format";
import { resolveMergeQueueItem, type Resolution } from "~/ingest/merge-queue";

export async function loadMergeQueue(db: Db) {
  const [items, athletes] = await Promise.all([
    db.select().from(schema.mergeQueueItem).where(eq(schema.mergeQueueItem.status, "open")).orderBy(asc(schema.mergeQueueItem.createdAt)),
    db
      .select({ id: schema.athlete.id, name: schema.athlete.name, sport: schema.athlete.sport, dateOfBirth: schema.athlete.dateOfBirth })
      .from(schema.athlete)
      .orderBy(asc(schema.athlete.name)),
  ]);
  const withCandidates = items.map((item) => {
    // Candidates: Athletes sharing a name part or the date of birth.
    const parts = new Set(normaliseName(item.name).split(" "));
    const candidates = athletes.filter(
      (a) =>
        (item.dateOfBirth !== null && a.dateOfBirth === item.dateOfBirth) ||
        normaliseName(a.name)
          .split(" ")
          .some((p) => parts.has(p)),
    );
    return { ...item, candidates };
  });
  return { items: withCandidates, open: withCandidates.length };
}

export type MergeQueueData = Awaited<ReturnType<typeof loadMergeQueue>>;

/** Resolves one item; returns the session-log message. */
export async function actOnMergeQueueItem(d1: D1Database, db: Db, intent: string, form: FormData): Promise<string> {
  const itemId = String(form.get("item"));
  const item = await db.query.mergeQueueItem.findFirst({ where: eq(schema.mergeQueueItem.id, itemId) });
  if (!item) throw new Response(`No merge-queue item ${itemId}`, { status: 404 });
  let resolution: Resolution;
  let message: string;
  if (intent === "link") {
    const athleteId = String(form.get("athlete"));
    const athlete = await db.query.athlete.findFirst({ where: eq(schema.athlete.id, athleteId) });
    if (!athlete) throw new Response(`No Athlete ${athleteId}`, { status: 404 });
    resolution = { kind: "link", athleteId };
    message = `${item.name}: linked to ${athlete.name}`;
  } else if (intent === "create") {
    resolution = { kind: "create" };
    message = `${item.name}: created a new Athlete`;
  } else if (intent === "not-an-athlete") {
    resolution = { kind: "not-an-athlete" };
    message = `${item.name}: not an Athlete`;
  } else {
    throw new Response(`Unknown action ${intent}`, { status: 400 });
  }
  await resolveMergeQueueItem(d1, item.id, resolution);
  return message;
}

function describeIncoming(item: { sport: string; dateOfBirth: string | null; scheme: string; value: string }) {
  return [
    item.sport,
    item.dateOfBirth ? `born ${formatDate(item.dateOfBirth)}` : null,
    `${EXTERNAL_ID_SCHEMES[item.scheme as keyof typeof EXTERNAL_ID_SCHEMES] ?? item.scheme.toUpperCase()} ${item.value}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function MergeQueueStep({ data }: { data: MergeQueueData }) {
  return (
    <>
      {data.items.map((item) => (
        <div className="card merge" key={item.id}>
          <div className="incoming">
            <span className="sub">Incoming from {item.source}</span>
            <h3>{item.name}</h3>
            <div className="sub">{describeIncoming(item)}</div>
          </div>
          <div className="candidates">
            {item.candidates.length === 0 ? <p className="sub">No existing Athlete comes close.</p> : null}
            {item.candidates.map((a) => (
              <Form method="post" className="candidate" key={a.id}>
                <div>
                  <b>{a.name}</b>
                  <div className="sub">{[a.sport, a.dateOfBirth ? `born ${formatDate(a.dateOfBirth)}` : null].filter(Boolean).join(" · ")}</div>
                </div>
                <input type="hidden" name="item" value={item.id} />
                <input type="hidden" name="athlete" value={a.id} />
                <button type="submit" name="intent" value="link">
                  Same person: link
                </button>
              </Form>
            ))}
            <Form method="post" className="actions">
              <input type="hidden" name="item" value={item.id} />
              <button type="submit" name="intent" value="create" className={item.candidates.length > 0 ? "secondary" : undefined}>
                Create new Athlete
              </button>
              <button type="submit" name="intent" value="not-an-athlete" className="secondary">
                Not an Athlete
              </button>
            </Form>
          </div>
        </div>
      ))}
    </>
  );
}
