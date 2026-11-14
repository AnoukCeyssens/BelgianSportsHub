// Run sheet step 7, Schedules (spec #20, stories 60 and 110; ticket #35): the
// owner curates each Games' dates and every sport's first and last
// competition day by hand until the full session schedule is imported (about
// six months out). The Games dates put the Games on the Calendar; the sport
// days put each sport in its own Phase. A Games whose dates are not recorded
// yet is an open item. Timetable versions (#37) are the step's second part,
// in ./timetables.tsx.
import { and, asc, eq } from "drizzle-orm";
import { Form } from "react-router";
import { sportColour } from "~/calendar/sport-colours";
import { type Db, getDb, schema } from "~/db/client";
import { belgianDate, GAMES_SOURCE, TRACKED_GAMES, type TrackedGames } from "~/domain";
import { formatDate, formatDayRange } from "~/format";
import { keepRawCopy } from "~/ingest/raw-copy";
import { loadTimetables, TimetablesPart, type TimetableReviewData } from "./timetables";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function recordedGames(db: Db, key: string) {
  const c = schema.competition;
  return db.query.competition.findFirst({ where: and(eq(c.source, GAMES_SOURCE), eq(c.sourceRef, key)) });
}

export async function loadSchedules(db: Db, now: Date) {
  const { competition, rawCopy, gamesSportWindow: w } = schema;
  const [rows, windows, timetables] = await Promise.all([
    db
      .select({ id: competition.id, key: competition.sourceRef, startDate: competition.startDate, endDate: competition.endDate, sourceUrl: rawCopy.url })
      .from(competition)
      .innerJoin(rawCopy, eq(competition.rawCopyId, rawCopy.id))
      .where(eq(competition.source, GAMES_SOURCE)),
    db.select().from(w).orderBy(asc(w.sport)),
    loadTimetables(db, now),
  ]);
  const games = TRACKED_GAMES.map((g) => {
    const row = rows.find((r) => r.key === g.key) ?? null;
    return {
      key: g.key,
      name: g.name,
      city: g.city,
      recorded: row ? { startDate: row.startDate, endDate: row.endDate, sourceUrl: row.sourceUrl } : null,
      sports: row ? windows.filter((s) => s.competitionId === row.id) : [],
    };
  });
  return { games, timetables, open: games.filter((g) => g.recorded === null).length };
}

export type SchedulesData = Awaited<ReturnType<typeof loadSchedules>>;

const days = (first: string, last: string) => `${formatDayRange(first, last)} ${last.slice(0, 4)}`;

/** Does one owner action in the Schedules step; returns the session-log message. */
export async function actOnSchedules(env: Pick<Env, "DB" | "RAW">, intent: string, form: FormData, now: Date): Promise<string> {
  const db = getDb(env.DB);
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const tracked = TRACKED_GAMES.find((g) => g.key === field("games"));
  if (!tracked) throw new Response("No such Games", { status: 404 });
  const games = await recordedGames(db, tracked.key);

  if (intent === "save-games-dates") {
    const { firstDay, lastDay, sourceUrl } = typedDays(field);
    if (games) {
      const w = schema.gamesSportWindow;
      const sports = await db.select().from(w).where(eq(w.competitionId, games.id));
      const outside = sports.filter((s) => s.firstDay < firstDay || s.lastDay > lastDay).map((s) => s.sport);
      if (outside.length > 0) throw new Response(`Outside these dates: ${outside.join(", ")}. Change their days first.`, { status: 400 });
    }
    await saveGamesDates(env, tracked, games?.id ?? null, { firstDay, lastDay, sourceUrl }, now);
    return `${tracked.name}: Games dates ${days(firstDay, lastDay)}`;
  }

  if (!games) throw new Response(`Record the dates of ${tracked.name} first`, { status: 400 });
  const sport = field("sport");
  if (!sport) throw new Response("Name the sport", { status: 400 });

  if (intent === "save-sport-days") {
    const { firstDay, lastDay, sourceUrl } = typedDays(field);
    if (firstDay < games.startDate || lastDay > games.endDate) {
      throw new Response(`${sport}'s days must lie within the Games dates (${days(games.startDate, games.endDate)})`, { status: 400 });
    }
    const row = { competitionId: games.id, sport, firstDay, lastDay, sourceUrl, checkedOn: belgianDate(now) };
    await db
      .insert(schema.gamesSportWindow)
      .values(row)
      .onConflictDoUpdate({ target: [schema.gamesSportWindow.competitionId, schema.gamesSportWindow.sport], set: row });
    return `${tracked.name}: ${sport} ${formatDayRange(firstDay, lastDay)}`;
  }
  if (intent === "remove-sport-days") {
    const w = schema.gamesSportWindow;
    await db.delete(w).where(and(eq(w.competitionId, games.id), eq(w.sport, sport)));
    return `${tracked.name}: ${sport} days removed`;
  }
  throw new Response(`Unknown action ${intent}`, { status: 400 });
}

function typedDays(field: (name: string) => string) {
  const firstDay = field("firstDay");
  const lastDay = field("lastDay");
  const sourceUrl = field("sourceUrl");
  if (!DATE.test(firstDay) || !DATE.test(lastDay)) throw new Response("The first and last day must be dates (YYYY-MM-DD)", { status: 400 });
  if (firstDay > lastDay) throw new Response("The first day must come before the last day", { status: 400 });
  if (!/^https?:\/\/\S+$/.test(sourceUrl)) throw new Response("The source URL must be a web address", { status: 400 });
  return { firstDay, lastDay, sourceUrl };
}

/** Creates or corrects the Games' competition row; what the owner typed is kept as its raw copy. */
async function saveGamesDates(
  env: Pick<Env, "DB" | "RAW">,
  tracked: TrackedGames,
  id: string | null,
  typed: { firstDay: string; lastDay: string; sourceUrl: string },
  now: Date,
) {
  const rawCopyId = await keepRawCopy(env, {
    source: GAMES_SOURCE,
    url: typed.sourceUrl,
    body: JSON.stringify({ games: tracked.key, ...typed }),
    contentType: "application/json",
    fetchedAt: now,
  });
  const db = getDb(env.DB);
  if (id) {
    await db.update(schema.competition).set({ startDate: typed.firstDay, endDate: typed.lastDay, rawCopyId }).where(eq(schema.competition.id, id));
    return;
  }
  await db.insert(schema.competition).values({
    name: tracked.name,
    sport: tracked.sport,
    kind: "games",
    startDate: typed.firstDay,
    endDate: typed.lastDay,
    city: tracked.city,
    country: tracked.country,
    venueZone: tracked.venueZone,
    series: tracked.series,
    source: GAMES_SOURCE,
    sourceRef: tracked.key,
    rawCopyId,
  });
}

export function SchedulesStep({ data, review }: { data: SchedulesData; review: TimetableReviewData | null }) {
  return (
    <>
      <h2>Games dates</h2>
      <p className="sub">Until the full session schedule is imported: the Games dates (first to last competition day) and each sport's first and last day.</p>
      {data.games.map((g) => (
        <div key={g.key}>
          <Form method="post" className="card games-dates">
            <h3>{`${g.name} · ${g.city} · ${g.recorded ? days(g.recorded.startDate, g.recorded.endDate) : "dates not recorded yet"}`}</h3>
            <input type="hidden" name="games" value={g.key} />
            <div className="fields">
              <label>
                First day
                <input type="date" name="firstDay" required defaultValue={g.recorded?.startDate} />
              </label>
              <label>
                Last day
                <input type="date" name="lastDay" required defaultValue={g.recorded?.endDate} />
              </label>
              <label className="wide">
                Source URL
                <input type="url" name="sourceUrl" required defaultValue={g.recorded?.sourceUrl} />
              </label>
            </div>
            <div className="actions">
              <button type="submit" name="intent" value="save-games-dates">
                Save Games dates
              </button>
            </div>
          </Form>
          {g.recorded ? <SportDays games={g.key} sports={g.sports} /> : null}
        </div>
      ))}
      <TimetablesPart data={data.timetables} review={review} />
    </>
  );
}

function SportDays({ games, sports }: { games: string; sports: SchedulesData["games"][number]["sports"] }) {
  return (
    <>
      {sports.length > 0 ? (
        <table aria-label="Sport days">
          <tbody>
            {sports.map((s) => (
              <tr key={s.sport}>
                <td>
                  <span className="dot" style={{ background: sportColour(s.sport) }}></span>
                  {s.sport}
                </td>
                <td>{formatDayRange(s.firstDay, s.lastDay)}</td>
                <td className="sub">
                  <a href={s.sourceUrl}>source</a>
                  {` · checked ${formatDate(s.checkedOn)}`}
                </td>
                <td>
                  <Form method="post">
                    <input type="hidden" name="games" value={games} />
                    <input type="hidden" name="sport" value={s.sport} />
                    <button type="submit" name="intent" value="remove-sport-days">
                      Remove
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <Form method="post" className="card sport-days">
        <input type="hidden" name="games" value={games} />
        <div className="fields">
          <label>
            Sport
            <input name="sport" required placeholder="e.g. Athletics" />
          </label>
          <label>
            First day
            <input type="date" name="firstDay" required />
          </label>
          <label>
            Last day
            <input type="date" name="lastDay" required />
          </label>
          <label className="wide">
            Source URL
            <input type="url" name="sourceUrl" required />
          </label>
        </div>
        <div className="actions">
          <button type="submit" name="intent" value="save-sport-days">
            Save sport days
          </button>
        </div>
      </Form>
    </>
  );
}
