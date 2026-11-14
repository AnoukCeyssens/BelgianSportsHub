import { asc, eq, inArray } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { now } from "~/clock";
import { referenceGamesRow } from "~/competition/reference-games";
import { cloudflareContext, dbFrom } from "~/context";
import { schema } from "~/db/client";
import { GAMES_SOURCE, REFERENCE_GAMES } from "~/domain";
import { formatDayRange } from "~/format";
import { belgianRows } from "~/ingest/belgian-rows";
import { keepRawCopy } from "~/ingest/raw-copy";
import type { ResultStatus } from "~/ingest/source-adapter";
import type { Route } from "./+types/curate.reference";
import { SPORT_LIST_ID, SportOptions, typedSport } from "~/curate/sport-field";

// Owner-only (under /curate); spec #20, story 119 and "Reference backfill";
// ticket #46. The owner enters a Belgian result at a reference Games by hand,
// as read on a public page (Olympedia is read by hand only, never crawled).
// What they typed is kept as a JSON raw copy whose URL is that page; the
// result is written through the same writer as every source, to the Athlete
// they chose (inactive ones included). Entering the same Athlete, sport and
// event again corrects it.

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Enter a result · ${loaderData?.games.name ?? "Reference Games"} · BelgianSportsHub` }];
}

const STATUSES: Record<Exclude<ResultStatus, "DNS">, string> = {
  finished: "Finished (placed)",
  eliminated: "Eliminated before a place",
  DNF: "DNF",
  DSQ: "DSQ",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function referenceGames(key: string) {
  const games = REFERENCE_GAMES.find((g) => g.key === key);
  if (!games) throw data("No such reference Games", { status: 404 });
  return games;
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const games = referenceGames(params.key);
  const a = schema.athlete;
  const t = schema.team;
  const db = dbFrom(context);
  const [athletes, teams] = await Promise.all([
    db.select({ id: a.id, name: a.name, sport: a.sport }).from(a).orderBy(asc(a.name)),
    db.select({ id: t.id, name: t.name, sport: t.sport }).from(t).orderBy(asc(t.sport), asc(t.name)),
  ]);
  return { games: { key: games.key, name: games.name, startDate: games.startDate, endDate: games.endDate }, athletes, teams };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const games = referenceGames(params.key);
  const env = context.get(cloudflareContext).env;
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const bad = (why: string) => data(why, { status: 400 });

  const db = dbFrom(context);
  // The Entry: an Athlete, or a Team with the Athletes its result credits.
  const athlete = field("athlete") ? await db.query.athlete.findFirst({ where: eq(schema.athlete.id, field("athlete")) }) : undefined;
  const team = field("team") ? await db.query.team.findFirst({ where: eq(schema.team.id, field("team")) }) : undefined;
  if (!athlete === !team) throw bad("Choose either the Athlete or the Team");
  const roster = team ? [...new Set(form.getAll("roster").map(String).filter(Boolean))] : [];
  const known = roster.length === 0 ? [] : await db.select({ id: schema.athlete.id }).from(schema.athlete).where(inArray(schema.athlete.id, roster));
  if (known.length !== roster.length) throw bad("The roster names an unknown Athlete");
  const entry = (athlete ?? team)!;
  const sport = typedSport(field("sport") || entry.sport);
  const event = field("event");
  if (!event) throw bad("Name the event");
  const date = field("date");
  if (!DATE.test(date) || date < games.startDate || date > games.endDate) {
    throw bad(`The event day must lie within ${games.name} (${formatDayRange(games.startDate, games.endDate)})`);
  }
  const status = field("status") as keyof typeof STATUSES;
  if (!(status in STATUSES)) throw bad("Choose the outcome");
  const placeText = field("place");
  const place = placeText === "" ? null : Number(placeText);
  if (place !== null && !(Number.isInteger(place) && place >= 1)) throw bad("The place must be a whole number from 1");
  const sourceUrl = field("sourceUrl");
  if (!/^https?:\/\/\S+$/.test(sourceUrl)) throw bad("The source URL must be a web address");
  const performance = field("performance") || null;

  const at = now();
  const competitionId = await referenceGamesRow(env, games, at);
  const who = athlete ? { athlete: athlete.id } : { team: team!.id, roster };
  const typed = { games: games.key, ...who, sport, event, date, status, place: placeText, performance };
  const rawCopyId = await keepRawCopy(env, { source: GAMES_SOURCE, url: sourceUrl, body: JSON.stringify(typed), contentType: "application/json", fetchedAt: at });
  await belgianRows(env, GAMES_SOURCE, at).result({
    competitionId,
    ...(athlete ? { athleteId: athlete.id } : { teamId: team!.id, roster }),
    sport,
    event,
    date,
    place,
    status,
    performance,
    sourceRef: `${games.key}:${slug(sport)}:${slug(event)}:${entry.id}`,
    rawCopyId,
  });
  return redirect(`/reference/${games.key}`, 303);
}

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function EnterReferenceResult({ loaderData }: Route.ComponentProps) {
  const { games, athletes, teams } = loaderData;
  return (
    <>
      <h1>Enter a result</h1>
      <p className="meta">
        <Link to={`/reference/${games.key}`}>{games.name}</Link>
      </p>
      <p className="sub">
        One Belgian result, as read on a public page (Olympedia by hand only): an Athlete's, or a Team's with the Athletes it credits. The same Entry,
        sport and event again corrects it.
      </p>
      <Form method="post" className="standards-form">
        <label>
          Athlete
          <select name="athlete" defaultValue="">
            <option value="">(a Team's result)</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>{`${a.name} (${a.sport})`}</option>
            ))}
          </select>
        </label>
        <label>
          or Team
          <select name="team" defaultValue="">
            <option value="">(an Athlete's result)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{`${t.name} (${t.sport})`}</option>
            ))}
          </select>
        </label>
        <label>
          The Team's credited Athletes
          <select name="roster" multiple size={6}>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>{`${a.name} (${a.sport})`}</option>
            ))}
          </select>
        </label>
        <label>
          Sport (if not the Athlete's or Team's)
          <input name="sport" list={SPORT_LIST_ID} />
          <SportOptions />
        </label>
        <label>
          Event
          <input name="event" required placeholder="Heptathlon Women" />
        </label>
        <label>
          Event day
          <input type="date" name="date" required min={games.startDate} max={games.endDate} />
        </label>
        <label>
          Outcome
          <select name="status" defaultValue="finished">
            {Object.entries(STATUSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Official place
          <input type="number" name="place" min={1} />
        </label>
        <label>
          Performance (as published)
          <input name="performance" />
        </label>
        <label>
          Source URL
          <input type="url" name="sourceUrl" required />
        </label>
        <button type="submit">Save</button>
      </Form>
    </>
  );
}
