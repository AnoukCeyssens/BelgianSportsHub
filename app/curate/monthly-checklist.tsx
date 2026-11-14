// Run sheet step 8, Monthly checklist (spec #20, story 111; ticket #45): only
// the checks due this week, grouped by topic, each ticked as "no change" or
// "changed" (with a note), or a whole topic at once; a count of the checks not
// due yet; and a form to add a check. Ticking schedules the next due date.
import { asc, eq, inArray } from "drizzle-orm";
import { Form } from "react-router";
import { type Db, schema } from "~/db/client";
import { belgianDate, checklistDue, nextDueOn } from "~/domain";
import { formatDay } from "~/format";

export async function loadMonthlyChecklist(db: Db, now: Date) {
  const items = await db.select().from(schema.checklistItem).orderBy(asc(schema.checklistItem.name));
  const { due, notDue } = checklistDue(items, now);
  const topics = [...new Set(items.map((i) => i.topic))].sort();
  // One open item per topic with a due check (the step's time estimate is per topic).
  return { due, notDue, topics, today: belgianDate(now), open: due.length };
}

export type MonthlyChecklistData = Awaited<ReturnType<typeof loadMonthlyChecklist>>;

const badRequest = (message: string) => new Response(message, { status: 400 });

/** One owner action on the checklist; returns the session-log message. */
export async function actOnChecklist(db: Db, intent: string, form: FormData, now: Date): Promise<string> {
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const checkedAt = now.toISOString();

  if (intent === "no-change" || intent === "changed") {
    const item = await db.query.checklistItem.findFirst({ where: eq(schema.checklistItem.id, field("item")) });
    if (!item) throw new Response(`No checklist item ${field("item")}`, { status: 404 });
    const changed = intent === "changed";
    const note = changed ? field("note") || null : null;
    await db
      .update(schema.checklistItem)
      .set({ dueOn: nextDueOn(now, item.everyMonths), lastCheckedAt: checkedAt, lastOutcome: changed ? "changed" : "no change", lastNote: note })
      .where(eq(schema.checklistItem.id, item.id));
    return changed ? `${item.name}: changed${note ? `: ${note}` : ""}` : `${item.name}: checked, no change`;
  }

  if (intent === "all-no-change") {
    const topic = field("topic");
    const items = await db.select().from(schema.checklistItem).where(eq(schema.checklistItem.topic, topic));
    const due = checklistDue(items, now).due.flatMap((g) => g.checks);
    if (due.length === 0) throw badRequest(`Nothing due under ${topic}`);
    for (const everyMonths of new Set(due.map((i) => i.everyMonths))) {
      const ids = due.filter((i) => i.everyMonths === everyMonths).map((i) => i.id);
      await db
        .update(schema.checklistItem)
        .set({ dueOn: nextDueOn(now, everyMonths), lastCheckedAt: checkedAt, lastOutcome: "no change", lastNote: null })
        .where(inArray(schema.checklistItem.id, ids));
    }
    return `${topic}: all ${due.length} checked, no change`;
  }

  if (intent === "add") {
    const topic = field("topic");
    const name = field("name");
    const dueOn = field("dueOn");
    const everyMonths = Number(field("everyMonths") || "1");
    if (!topic || !name) throw badRequest("A check needs a topic and a name");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw badRequest("A check needs a first due date");
    if (!Number.isInteger(everyMonths) || everyMonths < 1) throw badRequest("Every how many months must be a whole number from 1");
    await db.insert(schema.checklistItem).values({ topic, name, url: field("url") || null, everyMonths, dueOn });
    return `Added check ${name} (due ${formatDay(dueOn)})`;
  }

  throw badRequest(`Unknown action ${intent}`);
}

type Check = MonthlyChecklistData["due"][number]["checks"][number];

function lastChecked(c: Check) {
  if (!c.lastCheckedAt) return "Never checked";
  return `Last checked ${formatDay(c.lastCheckedAt.slice(0, 10))}${c.lastNote ? `: ${c.lastNote}` : ""}`;
}

export function MonthlyChecklistStep({ data }: { data: MonthlyChecklistData }) {
  return (
    <>
      {data.due.map((group) => (
        <div className="card" key={group.topic}>
          <h3>{group.topic}</h3>
          <table>
            <tbody>
              {group.checks.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {c.name} ↗
                      </a>
                    ) : (
                      c.name
                    )}
                    <div className="sub">{`due ${formatDay(c.dueOn)} · ${lastChecked(c)}`}</div>
                  </td>
                  <td>
                    <Form method="post" className="actions">
                      <input type="hidden" name="item" value={c.id} />
                      <input type="text" name="note" placeholder="What changed?" aria-label={`What changed for ${c.name}`} />
                      <button type="submit" name="intent" value="no-change" className="secondary">
                        No change
                      </button>
                      <button type="submit" name="intent" value="changed" className="secondary">
                        Changed
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Form method="post" className="actions">
            <input type="hidden" name="topic" value={group.topic} />
            <button type="submit" name="intent" value="all-no-change">
              All checked, no change
            </button>
          </Form>
        </div>
      ))}
      <p className="sub">{`${data.notDue} other ${data.notDue === 1 ? "check is" : "checks are"} not due this week.`}</p>
      <details className="card">
        <summary>Add a check</summary>
        <Form method="post" className="actions">
          <input type="text" name="topic" required list="checklist-topics" placeholder="Topic" aria-label="Topic" />
          <datalist id="checklist-topics">
            {data.topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <input type="text" name="name" required placeholder="Check" aria-label="Check" />
          <input type="url" name="url" placeholder="Link (optional)" aria-label="Link" />
          <label>
            every <input type="number" name="everyMonths" min={1} defaultValue={1} style={{ width: "4em" }} /> months
          </label>
          <label>
            first due <input type="date" name="dueOn" required defaultValue={data.today} />
          </label>
          <button type="submit" name="intent" value="add">
            Add check
          </button>
        </Form>
      </details>
    </>
  );
}
