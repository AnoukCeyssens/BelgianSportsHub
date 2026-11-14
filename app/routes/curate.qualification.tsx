import { and, asc, eq, max } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { now } from "~/clock";
import { dbFrom } from "~/context";
import { type Db, schema } from "~/db/client";
import {
  belgianDate,
  isQualificationStatus,
  olympicCycleOf,
  QUALIFICATION_STATUS_LABELS,
  QUALIFICATION_STATUSES,
  isQuotaPlaceEvent,
  isQuotaPlaceState,
  NEW_QUOTA_PLACE_EVENTS,
  QUOTA_PLACE_KIND_LABELS,
  QUOTA_PLACE_STATE_LABELS,
  quotaPlaceEnded,
  quotaPlaceLinkable,
  quotaPlaceTransition,
  referenceGamesOf,
  TRACK_STATES,
  type QuotaPlaceKind,
  type TrackState,
} from "~/domain";
import { formatDate } from "~/format";
import { potentialEntries } from "~/qualification/entries";
import { linkAtSelection, quotaPlacesOf, recordQuotaPlaces } from "~/qualification/quota-places";
import { activeStatuses } from "~/roster/active";
import type { Route } from "./+types/curate.qualification";

// Owner-only (under /curate); spec #20, stories 25, 82–85; ticket #32. The
// owner curates a target competition's potential Entries: each Active
// Athlete's or Team's Qualification status (with its source; checked today)
// and its Qualification tracks (needed, has, met / not met / pending).
// Served at /curate/championships/:id/qualification and
// /curate/games/:id/qualification. A status belongs to the Athlete or Team,
// never to a roster member: an Athlete cannot get an Entry in an event where
// a Team whose roster credits them competes. Statuses are curated; #33's
// Qualification review suggests them and applies the owner's choice through
// the same columns. At the Games the owner also records Belgium's Quota
// places (ticket #36, ADR 0002): NOC-owned or named, moved only along their
// lifecycle (`quotaPlaceTransition`), each with its source and checked today.
// NOC-owned places follow Selection in their event (`linkAtSelection`).
// Championships have no Quota places.

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Qualification · ${loaderData?.competition.name ?? "Championship"} · BelgianSportsHub` }];
}

const PAGE = { championship: "/championship", games: "/games" } as const;

type Target = typeof schema.competition.$inferSelect & { page: string; here: string };

async function targetOf(db: Db, id: string, request: Request): Promise<Target> {
  const path = new URL(request.url).pathname;
  const kind = path.startsWith("/curate/games/") ? "games" : "championship";
  const row = await db.query.competition.findFirst({ where: eq(schema.competition.id, id) });
  // A reference Games is history: no qualification.
  if (!row || row.kind !== kind || referenceGamesOf(row)) throw data(kind === "games" ? "No such Games" : "No such Championship", { status: 404 });
  return { ...row, page: `${PAGE[kind]}/${row.id}`, here: `/curate/${kind === "games" ? "games" : "championships"}/${row.id}/qualification` };
}

/** Which sports' Athletes and Teams can be Entries: the Championship's sport, or every sport of the Games' cycle. */
function sportFits(target: Target) {
  if (target.kind === "championship") return (sport: string) => sport.toLowerCase() === target.sport.toLowerCase();
  const cycle = /winter/i.test(target.sport) || /winter/i.test(target.series ?? "") ? "winter" : "summer";
  return (sport: string) => olympicCycleOf(sport) === cycle;
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const target = await targetOf(db, params.competitionId, request);
  const at = now();
  const fits = sportFits(target);
  const [entries, quotaPlaces, athletes, teams, active] = await Promise.all([
    potentialEntries(db, [target.id], at),
    target.kind === "games" ? quotaPlacesOf(db, target.id) : null,
    db.select({ id: schema.athlete.id, name: schema.athlete.name, sport: schema.athlete.sport }).from(schema.athlete).orderBy(asc(schema.athlete.name)),
    db
      .select({ id: schema.team.id, name: schema.team.name, sport: schema.team.sport, event: schema.team.event })
      .from(schema.team)
      .orderBy(asc(schema.team.name)),
    activeStatuses(db, at),
  ]);
  const candidates = [
    ...athletes.filter((a) => fits(a.sport) && active.athletes.get(a.id)?.active).map((a) => ({ who: `athlete:${a.id}`, label: `${a.name} (${a.sport})` })),
    ...teams.filter((t) => fits(t.sport) && active.teams.get(t.id)?.active).map((t) => ({ who: `team:${t.id}`, label: `${t.name} · ${t.event} (${t.sport})` })),
  ];
  return {
    competition: { name: target.name, page: target.page, here: target.here },
    entries,
    quotaPlaces,
    candidates,
    statuses: QUALIFICATION_STATUSES.map((s) => ({ value: s, label: QUALIFICATION_STATUS_LABELS[s] })),
    // A Selection per sport is entered in the Run sheet's Selections & likely step (#34).
    selectionLinks: [...new Set(entries.map((x) => x.sport))].map((sport) => ({
      sport,
      href: `/curate/run/selections-likely?${new URLSearchParams({ selection: target.id, sport })}#selection`,
    })),
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const db = dbFrom(context);
  const target = await targetOf(db, params.competitionId, request);
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim() || null;
  const required = (name: string) => field(name) ?? refuse(`${name} is required`);
  const today = belgianDate(now());
  const e = schema.entry;
  const t = schema.qualificationTrack;
  const q = schema.quotaPlace;
  const games = target.kind === "games";
  /** NOC-owned places follow Selection in the Entry's event (Games only). */
  const followSelection = async (sport: string, event: string) => {
    if (games) await linkAtSelection(db, target.id, sport, event);
  };
  /** One of this Games' Quota places; Championships have none. */
  const quotaPlace = async (placeId: string) => {
    if (!games) refuse("Championships have no Quota places");
    const row = await db.query.quotaPlace.findFirst({ where: and(eq(q.id, placeId), eq(q.competitionId, target.id)) });
    if (!row || !isQuotaPlaceState(row.state)) refuse("No such Quota place at this Games");
    return { ...row, state: row.state, kind: (row.kind === "named" ? "named" : "noc") as QuotaPlaceKind };
  };

  /** One of this competition's Entries, of an Active Athlete or Team. */
  const activeEntry = async (entryId: string) => {
    const row = await db.query.entry.findFirst({ where: and(eq(e.id, entryId), eq(e.competitionId, target.id)) });
    if (!row) refuse("No such Entry at this competition");
    await mustBeActive(db, row.athleteId ? { athleteId: row.athleteId } : { teamId: row.teamId! });
    return row;
  };
  const status = () => {
    const value = field("status");
    if (!isQualificationStatus(value)) refuse("Unknown Qualification status");
    return value;
  };

  switch (field("intent")) {
    case "add-entry": {
      const [kind, id] = required("who").split(":");
      const event = required("event");
      const qualificationStatus = status();
      const source = required("source");
      let sport: string;
      if (kind === "athlete") {
        const athlete = await db.query.athlete.findFirst({ where: eq(schema.athlete.id, id) });
        if (!athlete) refuse("No such Athlete");
        sport = athlete.sport;
        await mustBeActive(db, { athleteId: id });
        await notOnATeamRoster(db, id, sport, event);
      } else if (kind === "team") {
        const team = await db.query.team.findFirst({ where: eq(schema.team.id, id) });
        if (!team) refuse("No such Team");
        sport = team.sport;
        await mustBeActive(db, { teamId: id });
      } else refuse(`Not an Athlete or Team: ${kind}`);
      const qualification = { qualificationStatus, qualificationSource: source, qualificationCheckedOn: today };
      const [existing] = await db
        .select({ id: e.id })
        .from(e)
        .where(and(eq(e.competitionId, target.id), eq(e.event, event), kind === "athlete" ? eq(e.athleteId, id) : eq(e.teamId, id)));
      if (existing) await db.update(e).set(qualification).where(eq(e.id, existing.id));
      else
        await db.insert(e).values({
          competitionId: target.id,
          sport,
          event,
          athleteId: kind === "athlete" ? id : null,
          teamId: kind === "team" ? id : null,
          sourceUrl: /^https?:\/\//.test(source) ? source : null,
          checkedOn: today,
          ...qualification,
        });
      await followSelection(sport, event);
      break;
    }
    case "set-status": {
      const row = await activeEntry(required("entryId"));
      await db
        .update(e)
        .set({ qualificationStatus: status(), qualificationSource: required("source"), qualificationCheckedOn: today })
        .where(eq(e.id, row.id));
      await followSelection(row.sport, row.event);
      break;
    }
    case "save-track": {
      const row = await activeEntry(required("entryId"));
      const state = field("state") as TrackState | null;
      if (!state || !TRACK_STATES.includes(state)) refuse("Unknown track state");
      const better = field("better");
      if (better !== null && better !== "higher" && better !== "lower") refuse("Better must be higher or lower");
      const values = { name: required("name"), needed: required("needed"), has: field("has") ?? "–", state, better, source: field("source"), checkedOn: today };
      const trackId = field("trackId");
      if (trackId) {
        const track = await db.query.qualificationTrack.findFirst({ where: and(eq(t.id, trackId), eq(t.entryId, row.id)) });
        if (!track) refuse("No such track");
        const changed = track.needed !== values.needed || track.has !== values.has || track.state !== values.state;
        await db
          .update(t)
          .set({ ...values, changedOn: changed ? today : track.changedOn })
          .where(eq(t.id, track.id));
      } else {
        const [last] = await db.select({ position: max(t.position) }).from(t).where(eq(t.entryId, row.id));
        await db.insert(t).values({ ...values, entryId: row.id, position: (last?.position ?? 0) + 1, changedOn: today });
      }
      break;
    }
    case "remove-track": {
      const track = await db.query.qualificationTrack.findFirst({ where: eq(t.id, required("trackId")) });
      if (!track) refuse("No such track");
      await activeEntry(track.entryId);
      await db.delete(t).where(eq(t.id, track.id));
      break;
    }
    case "add-quota-places": {
      if (!games) refuse("Championships have no Quota places, only per-nation entry caps");
      const kind = field("kind");
      if (kind !== "noc" && kind !== "named") refuse("A Quota place is NOC-owned or named");
      const how = NEW_QUOTA_PLACE_EVENTS.find((x) => x === field("how"));
      if (!how) refuse("A new place is held, allocated or reallocated");
      // A nation ranking that earns n places records n (story 80).
      const count = Number(field("count") ?? "1");
      if (!Number.isInteger(count) || count < 1 || count > 20) refuse("Count is a whole number of places, 1 to 20");
      let sport = field("sport");
      let event = field("event");
      const entryId = field("entryId");
      if (kind === "named") {
        // A named place links to the Entry that earned it, when earned (story 81).
        if (!entryId) refuse("A named place needs the Entry that earned it");
        if (count !== 1) refuse("A named place belongs to one Entry: record one at a time");
        const row = await activeEntry(entryId);
        sport = row.sport;
        event = row.event;
      }
      if (!sport || !event) refuse("Sport and event are required");
      await recordQuotaPlaces(db, {
        competitionId: target.id,
        sport,
        event,
        kind,
        how,
        count,
        earnedVia: field("earnedVia"),
        entryId: kind === "named" ? entryId : null,
        source: required("source"),
        checkedOn: today,
      });
      break;
    }
    case "move-quota-place": {
      const place = await quotaPlace(required("placeId"));
      const event = field("event");
      if (!isQuotaPlaceEvent(event)) refuse("Unknown Quota place move");
      const source = required("source");
      const move = quotaPlaceTransition({ state: place.state, kind: place.kind, linked: place.entryId !== null }, event);
      if (!move.ok) refuse(move.reason);
      await db.update(q).set({ state: move.state, source, checkedOn: today }).where(eq(q.id, place.id));
      break;
    }
    case "link-quota-place": {
      const place = await quotaPlace(required("placeId"));
      if (quotaPlaceEnded(place.state)) refuse(`A ${QUOTA_PLACE_STATE_LABELS[place.state]} place keeps its Entry`);
      const row = await activeEntry(required("entryId"));
      if (row.sport.toLowerCase() !== place.sport.toLowerCase() || row.event.toLowerCase() !== place.event.toLowerCase()) {
        refuse(`That Entry is not in ${place.sport} · ${place.event}`);
      }
      const entryStatus = isQualificationStatus(row.qualificationStatus) ? row.qualificationStatus : null;
      if (!quotaPlaceLinkable(place.kind, entryStatus)) refuse("An NOC-owned place links to an Entry only at Selection");
      await db.update(q).set({ entryId: row.id }).where(eq(q.id, place.id));
      break;
    }
    case "remove-quota-place": {
      const place = await quotaPlace(required("placeId"));
      await db.delete(q).where(eq(q.id, place.id));
      break;
    }
    default:
      refuse("Unknown action");
  }
  return redirect(target.here, 303);
}

function refuse(message: string): never {
  throw data(message, { status: 400 });
}

/** Story 25: only Active Athletes and Teams get tracks and statuses. */
async function mustBeActive(db: Db, who: { athleteId: string } | { teamId: string }) {
  const statuses = await activeStatuses(db, now(), "athleteId" in who ? { athleteIds: [who.athleteId] } : { teamIds: [who.teamId] });
  const status = "athleteId" in who ? statuses.athletes.get(who.athleteId) : statuses.teams.get(who.teamId);
  if (!status?.active) refuse("Only Active Athletes and Teams get a Qualification status");
}

/** Story 84: in a Team event the status is the Team's; its roster members get none of their own. */
async function notOnATeamRoster(db: Db, athleteId: string, sport: string, event: string) {
  const rows = await db
    .selectDistinct({ name: schema.team.name, sport: schema.team.sport, event: schema.team.event })
    .from(schema.rosterMember)
    .innerJoin(schema.team, eq(schema.team.id, schema.rosterMember.teamId))
    .where(eq(schema.rosterMember.athleteId, athleteId));
  const team = rows.find((r) => r.sport.toLowerCase() === sport.toLowerCase() && r.event.toLowerCase() === event.toLowerCase());
  if (team) refuse(`${event} is a Team event: set the status on ${team.name}, not on its roster members`);
}

export default function CurateQualification({ loaderData }: Route.ComponentProps) {
  const { competition, entries, quotaPlaces, candidates, statuses, selectionLinks } = loaderData;
  const statusSelect = (value: string | null) => (
    <select name="status" defaultValue={value ?? "on-track"}>
      {statuses.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
  const stateSelect = (value: string) => (
    <select name="state" defaultValue={value}>
      <option value="met">✓ met</option>
      <option value="not-met">✗ not met</option>
      <option value="pending">… pending</option>
    </select>
  );
  const betterSelect = (value: string | null) => (
    <select name="better" defaultValue={value ?? ""}>
      <option value="">read from text</option>
      <option value="higher">higher is better</option>
      <option value="lower">lower is better</option>
    </select>
  );
  return (
    <div className="qualification-curation">
      <h1>Qualification</h1>
      <p className="meta">
        <Link to={competition.page}>{competition.name}</Link>
      </p>
      <p className="sub">
        Active Athletes and Teams only. A status is the Athlete&apos;s or Team&apos;s, never a roster member&apos;s; saving it stamps it as checked
        today.
      </p>

      {entries.map((entry) => (
        <section key={entry.id} className="card" aria-label={`${entry.who.name} · ${entry.event}`}>
          <h3>{`${entry.who.name} · ${entry.event}`}</h3>
          {entry.selection ? (
            <p className="sub">
              {`Selection: ${entry.selection.selector ?? "selector not named"}${entry.selection.on ? ` · ${formatDate(entry.selection.on)}` : ""} · `}
              {entry.selection.kind === "entry-list" ? "IF entry list" : "press release"}
            </p>
          ) : null}
          <Form method="post" className="fields">
            <input type="hidden" name="intent" value="set-status" />
            <input type="hidden" name="entryId" value={entry.id} />
            <label>
              Status
              {statusSelect(entry.status)}
            </label>
            <label>
              Source
              <input name="source" defaultValue={entry.source ?? ""} required />
            </label>
            <button type="submit">Save status</button>
          </Form>
          {entry.tracks.map((track) => (
            <Form key={track.id} method="post" className="fields">
              <input type="hidden" name="trackId" value={track.id} />
              <input type="hidden" name="entryId" value={entry.id} />
              <label>
                Track
                <input name="name" defaultValue={track.name} required />
              </label>
              <label>
                Needs
                <input name="needed" defaultValue={track.needed} required />
              </label>
              <label>
                Has
                <input name="has" defaultValue={track.has} />
              </label>
              <label>
                State
                {stateSelect(track.state)}
              </label>
              <label>
                Figures
                {betterSelect(track.better)}
              </label>
              <label>
                Source
                <input name="source" defaultValue={track.source ?? ""} />
              </label>
              <button type="submit" name="intent" value="save-track">
                Save track
              </button>
              <button type="submit" name="intent" value="remove-track" className="secondary">
                Remove
              </button>
            </Form>
          ))}
          <Form method="post" className="fields">
            <input type="hidden" name="intent" value="save-track" />
            <input type="hidden" name="entryId" value={entry.id} />
            <label>
              New track
              <input name="name" placeholder="Entry standard" required />
            </label>
            <label>
              Needs
              <input name="needed" placeholder="6 500 pts" required />
            </label>
            <label>
              Has
              <input name="has" placeholder="6 640 pts" />
            </label>
            <label>
              State
              {stateSelect("pending")}
            </label>
            <label>
              Figures
              {betterSelect(null)}
            </label>
            <label>
              Source
              <input name="source" />
            </label>
            <button type="submit">Add track</button>
          </Form>
        </section>
      ))}

      {selectionLinks.length > 0 ? (
        <>
          <h2>Selection</h2>
          <p className="sub">
            {selectionLinks.map((l, i) => (
              <span key={l.sport}>
                {i > 0 ? " · " : ""}
                <Link to={l.href}>{`Enter the ${l.sport} Selection`}</Link>
              </span>
            ))}
          </p>
        </>
      ) : null}

      <h2>Add a potential Entry</h2>
      {candidates.length > 0 ? (
        <Form method="post" className="fields card">
          <input type="hidden" name="intent" value="add-entry" />
          <label>
            Athlete or Team
            <select name="who" required>
              {candidates.map((c) => (
                <option key={c.who} value={c.who}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Event
            <input name="event" required />
          </label>
          <label>
            Status
            {statusSelect(null)}
          </label>
          <label>
            Source
            <input name="source" required />
          </label>
          <button type="submit">Add</button>
        </Form>
      ) : (
        <p className="sub">No Active Athletes or Teams in this competition&apos;s sports.</p>
      )}

      {quotaPlaces ? <QuotaPlaces places={quotaPlaces} entries={entries} /> : null}
    </div>
  );
}

const MOVE_LABELS = { allocate: "Allocated", accept: "Accepted", enter: "Entered", decline: "Declined", lose: "Lost" } as const;

type Loaded = Route.ComponentProps["loaderData"];

/** The Games' Quota places (ticket #36): record new ones, move each along its lifecycle, link it to its Entry. */
function QuotaPlaces({ places, entries }: { places: NonNullable<Loaded["quotaPlaces"]>; entries: Loaded["entries"] }) {
  const sameEvent = (place: (typeof places)[number], entry: (typeof entries)[number]) =>
    entry.sport.toLowerCase() === place.sport.toLowerCase() && entry.event.toLowerCase() === place.event.toLowerCase();
  return (
    <>
      <h2>Quota places</h2>
      <p className="sub">
        Belgium&apos;s places, separate from who goes (ADR 0002). An NOC-owned place links to its Entry at Selection; a named place to the Entry
        that earned it. Moving a place stamps it as checked today.
      </p>
      {places.map((place) => {
        const moves = (Object.keys(MOVE_LABELS) as (keyof typeof MOVE_LABELS)[]).filter(
          (event) => quotaPlaceTransition({ state: place.state, kind: place.kind, linked: place.entry !== null }, event).ok,
        );
        const linkable = quotaPlaceEnded(place.state)
          ? []
          : entries.filter((e) => sameEvent(place, e) && e.id !== place.entry?.id && quotaPlaceLinkable(place.kind, e.status));
        const title = `${place.sport} · ${place.event}${place.of > 1 ? ` · place ${place.number} of ${place.of}` : ""}`;
        return (
          <section key={place.id} className="card" aria-label={title}>
            <h3>{title}</h3>
            <p className="meta">
              {`${QUOTA_PLACE_KIND_LABELS[place.kind]} · ${QUOTA_PLACE_STATE_LABELS[place.state]}`}
              {place.earnedVia ? ` · via ${place.earnedVia}` : ""}
              {place.reallocated ? " · reallocated" : ""}
              {` · ${place.entry ? place.entry.who.name : "no Entry yet"}`}
            </p>
            <p className="sub">{`Source: ${place.source} · checked ${place.checkedOn}`}</p>
            {moves.length > 0 ? (
              <Form method="post" className="fields">
                <input type="hidden" name="intent" value="move-quota-place" />
                <input type="hidden" name="placeId" value={place.id} />
                <label>
                  Now
                  <select name="event">
                    {moves.map((m) => (
                      <option key={m} value={m}>
                        {MOVE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Source
                  <input name="source" required />
                </label>
                <button type="submit">Move</button>
              </Form>
            ) : null}
            {linkable.length > 0 ? (
              <Form method="post" className="fields">
                <input type="hidden" name="intent" value="link-quota-place" />
                <input type="hidden" name="placeId" value={place.id} />
                <label>
                  Entry
                  <select name="entryId">
                    {linkable.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.who.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Link</button>
              </Form>
            ) : null}
            <Form method="post" className="fields">
              <input type="hidden" name="intent" value="remove-quota-place" />
              <input type="hidden" name="placeId" value={place.id} />
              <button type="submit" className="secondary">
                Remove (recorded by mistake)
              </button>
            </Form>
          </section>
        );
      })}

      <Form method="post" className="fields card" aria-label="Record Quota places">
        <input type="hidden" name="intent" value="add-quota-places" />
        <label>
          Sport
          <input name="sport" placeholder="Cycling road" />
        </label>
        <label>
          Event
          <input name="event" placeholder="Men's road race" />
        </label>
        <label>
          Place
          <select name="kind" defaultValue="noc">
            <option value="noc">NOC-owned</option>
            <option value="named">Named (to its Entry)</option>
          </select>
        </label>
        <label>
          Starts
          <select name="how" defaultValue="hold">
            <option value="hold">Provisional (on today&apos;s list)</option>
            <option value="allocate">Allocated</option>
            <option value="reallocate">Allocated through reallocation</option>
          </select>
        </label>
        <label>
          How many
          <input name="count" type="number" min={1} max={20} defaultValue={1} />
        </label>
        <label>
          Earned via
          <input name="earnedVia" placeholder="UCI nation ranking" />
        </label>
        <label>
          Named to
          <select name="entryId" defaultValue="">
            <option value="">— (NOC-owned)</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {`${e.who.name} · ${e.event}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <input name="source" required />
        </label>
        <button type="submit">Record</button>
      </Form>
    </>
  );
}
