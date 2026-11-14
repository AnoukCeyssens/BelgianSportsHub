// Run sheet step 3, Manual results (spec #20, story 105; ticket #26): one
// form per due manual result. A result is due when a Belgian Athlete is on the
// entry list of a competition from a Manual source (PDF-only or login-only
// results) whose last day has come, and no result of theirs is there yet. The
// owner types the place, performance or DNF/DNS/DSQ with the source URL, or
// says they did not compete.
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { Form } from "react-router";
import { type Db, getDb, schema } from "~/db/client";
import { BELGIAN_ZONE } from "~/domain";
import { formatDate, formatDay } from "~/format";
import { belgianRows } from "~/ingest/belgian-rows";
import { keepRawCopy } from "~/ingest/raw-copy";

export async function loadManualResults(db: Db, now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BELGIAN_ZONE }).format(now);
  const { entrant, competition, source, athlete, result } = schema;
  const items = await db
    .select({
      competitionId: competition.id,
      competition: competition.name,
      startDate: competition.startDate,
      endDate: competition.endDate,
      source: source.name,
      athleteId: athlete.id,
      athlete: athlete.name,
    })
    .from(entrant)
    .innerJoin(competition, eq(entrant.competitionId, competition.id))
    .innerJoin(source, eq(competition.source, source.key))
    .innerJoin(athlete, eq(entrant.athleteId, athlete.id))
    .leftJoin(result, and(eq(result.competitionId, competition.id), eq(result.athleteId, athlete.id)))
    .where(and(eq(source.tier, "manual"), lte(competition.endDate, today), isNull(result.id)))
    .orderBy(asc(competition.endDate), asc(competition.name), asc(athlete.name));
  return { items, open: items.length };
}

export type ManualResultsData = Awaited<ReturnType<typeof loadManualResults>>;

const STATUSES = ["finished", "DNF", "DNS", "DSQ"] as const;

/** Saves one manual result, or records that the Athlete did not compete; returns the session-log message. */
export async function actOnManualResult(env: Pick<Env, "DB" | "RAW">, intent: string, form: FormData, now: Date): Promise<string> {
  const db = getDb(env.DB);
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const [competition, athlete] = await Promise.all([
    db.query.competition.findFirst({ where: eq(schema.competition.id, field("competition")) }),
    db.query.athlete.findFirst({ where: eq(schema.athlete.id, field("athlete")) }),
  ]);
  if (!competition || !athlete) throw new Response("No such competition or Athlete", { status: 404 });

  if (intent === "did-not-compete") {
    // Not there after all: off the entry list, so the result is no longer due and no performance counts.
    await db
      .delete(schema.entrant)
      .where(and(eq(schema.entrant.competitionId, competition.id), eq(schema.entrant.athleteId, athlete.id)));
    return `${athlete.name}: did not compete at ${competition.name}`;
  }
  if (intent !== "save-result") throw new Response(`Unknown action ${intent}`, { status: 400 });

  const typed = {
    event: field("event"),
    place: field("place"),
    performance: field("performance"),
    status: field("status"),
    sourceUrl: field("sourceUrl"),
  };
  const status = STATUSES.find((s) => s === typed.status);
  if (!status) throw new Response("Choose a status", { status: 400 });
  const finished = status === "finished";
  if (!/^https?:\/\/\S+$/.test(typed.sourceUrl)) throw new Response("The source URL must be a web address", { status: 400 });
  if (!typed.event) throw new Response("Name the event", { status: 400 });
  if (typed.place && !/^[1-9]\d*$/.test(typed.place)) throw new Response("The place must be a whole number", { status: 400 });
  if (finished && !typed.place && !typed.performance) throw new Response("Give a place or a performance", { status: 400 });

  // What the owner typed is this result's raw input: kept as received, under the source URL it was read from.
  const rawCopyId = await keepRawCopy(env, {
    source: competition.source,
    url: typed.sourceUrl,
    body: JSON.stringify(typed),
    contentType: "application/json",
    fetchedAt: now,
  });
  await belgianRows(env, competition.source, now).result({
    competitionId: competition.id,
    athleteId: athlete.id,
    event: typed.event,
    date: competition.endDate,
    place: finished && typed.place ? Number(typed.place) : null,
    status,
    performance: finished && typed.performance ? typed.performance : null,
    // One manual result per Athlete per competition: saving again corrects it.
    sourceRef: `manual/${competition.id}/${athlete.id}`,
    rawCopyId,
  });
  return `${athlete.name}: result saved for ${competition.name}`;
}

function dates(startDate: string, endDate: string) {
  return startDate === endDate ? formatDate(endDate) : `${formatDay(startDate)}–${formatDate(endDate)}`;
}

export function ManualResultsStep({ data }: { data: ManualResultsData }) {
  return (
    <>
      {data.items.map((item) => (
        <Form method="post" className="card manual" key={`${item.competitionId}-${item.athleteId}`} aria-label={`Manual result · ${item.athlete} · ${item.competition}`}>
          <h3>{`${item.athlete} · ${item.competition}`}</h3>
          <p className="sub">{`${dates(item.startDate, item.endDate)} · ${item.source}`}</p>
          <input type="hidden" name="competition" value={item.competitionId} />
          <input type="hidden" name="athlete" value={item.athleteId} />
          <div className="fields">
            <label>
              Event
              <input name="event" required placeholder="e.g. Men 10 km sprint" />
            </label>
            <label>
              Place
              <input name="place" inputMode="numeric" pattern="[1-9][0-9]*" size={4} placeholder="5" />
            </label>
            <label>
              Performance
              <input name="performance" size={10} placeholder="25:41.3" />
            </label>
            <label>
              Status
              <select name="status" defaultValue="finished">
                <option value="finished">Finished</option>
                <option value="DNF">DNF</option>
                <option value="DNS">DNS</option>
                <option value="DSQ">DSQ</option>
              </select>
            </label>
            <label className="wide">
              Source URL (the PDF or results page)
              <input name="sourceUrl" type="url" required placeholder="https://…/results.pdf" />
            </label>
          </div>
          <div className="actions">
            <button type="submit" name="intent" value="save-result">
              Save result
            </button>
            <button type="submit" name="intent" value="did-not-compete" className="secondary" formNoValidate>
              Did not compete
            </button>
          </div>
        </Form>
      ))}
    </>
  );
}
