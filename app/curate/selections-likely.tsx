// Run sheet step 6, Selections & likely (spec #20, stories 96, 109 and 114):
// the likely Participations of the coming six weeks the owner has not checked
// this week, each with why it is likely; confirm, keep or drop it, or add one
// by hand. Selections from press releases join this step with #34.
import { eq } from "drizzle-orm";
import { Form } from "react-router";
import { participationsBetween, REASON_TEXT } from "~/calendar/participations";
import { type Db, schema } from "~/db/client";
import { BELGIAN_ZONE, LIKELY_REVIEW_WEEKS, needsLikelyReview } from "~/domain";
import { formatDate, formatDayRange } from "~/format";

/** How far ahead a likely Participation can be added by hand. */
const ADD_AHEAD_DAYS = 365;

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function loadSelectionsLikely(db: Db, now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BELGIAN_ZONE }).format(now);
  const upcoming = await participationsBetween(db, today, addDays(today, ADD_AHEAD_DAYS));
  const likely = upcoming
    .filter((c) => c.participation.status === "likely" && c.startDate <= addDays(today, LIKELY_REVIEW_WEEKS * 7))
    .filter((c) => needsLikelyReview({ startDate: c.startDate, endDate: c.endDate, checkedAt: c.curation?.checkedAt ?? null }, now))
    .map((c) => ({ id: c.id, name: c.name, sport: c.sport, startDate: c.startDate, endDate: c.endDate, why: c.participation.why }));
  const addable = upcoming
    .filter((c) => c.participation.status === "none" && c.startDate >= today)
    .map((c) => ({ id: c.id, name: c.name, startDate: c.startDate }));
  return { likely, addable, open: likely.length };
}

export type SelectionsLikelyData = Awaited<ReturnType<typeof loadSelectionsLikely>>;

const DECISIONS = { confirm: ["confirmed", "confirmed"], keep: ["kept", "kept likely"], drop: ["dropped", "dropped"] } as const;

/** Records one decision; returns the session-log message. */
export async function actOnLikely(db: Db, intent: string, form: FormData, now: Date): Promise<string> {
  const competitionId = String(form.get("competition"));
  const competition = await db.query.competition.findFirst({ where: eq(schema.competition.id, competitionId) });
  if (!competition) throw new Response(`No competition ${competitionId}`, { status: 404 });
  const at = now.toISOString();
  const table = schema.participationCuration;
  if (intent === "add") {
    await db
      .insert(table)
      .values({ competitionId, addedAt: at, checkedAt: at })
      .onConflictDoUpdate({ target: table.competitionId, set: { addedAt: at, decision: null, checkedAt: at } });
    return `${competition.name}: added as a likely Participation`;
  }
  if (!(intent in DECISIONS)) throw new Response(`Unknown action ${intent}`, { status: 400 });
  const [decision, logged] = DECISIONS[intent as keyof typeof DECISIONS];
  await db
    .insert(table)
    .values({ competitionId, decision, checkedAt: at })
    .onConflictDoUpdate({ target: table.competitionId, set: { decision, checkedAt: at } });
  return `${competition.name}: ${logged}`;
}

export function SelectionsLikelyStep({ data }: { data: SelectionsLikelyData }) {
  return (
    <div className="card">
      <h3>{`Likely Participations, next ${LIKELY_REVIEW_WEEKS} weeks`}</h3>
      {data.likely.length > 0 ? (
        <table aria-label="Likely Participations">
          <thead>
            <tr>
              <th>Competition</th>
              <th>Why likely</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.likely.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.name}</b>
                  <div className="sub">{`${formatDayRange(c.startDate, c.endDate)} · ${c.sport}`}</div>
                </td>
                <td className="sub">{c.why.map((w) => REASON_TEXT[w]).join("; ")}</td>
                <td>
                  <Form method="post" className="actions">
                    <input type="hidden" name="competition" value={c.id} />
                    <button type="submit" name="intent" value="confirm" className="secondary">
                      Confirm
                    </button>
                    <button type="submit" name="intent" value="keep">
                      Keep
                    </button>
                    <button type="submit" name="intent" value="drop" className="secondary">
                      Drop
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {data.addable.length > 0 ? (
        <Form method="post" className="actions">
          <label>
            {"Add a likely Participation by hand "}
            <select name="competition">
              {data.addable.map((c) => (
                <option value={c.id} key={c.id}>{`${c.name} · ${formatDate(c.startDate)}`}</option>
              ))}
            </select>
          </label>
          <button type="submit" name="intent" value="add" className="secondary">
            + Add
          </button>
        </Form>
      ) : null}
    </div>
  );
}
