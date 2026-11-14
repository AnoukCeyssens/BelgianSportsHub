import { eq } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { now } from "~/clock";
import { dbFrom } from "~/context";
import { type Db, schema } from "~/db/client";
import {
  belgianDate,
  isSeedMethod,
  PICK_SUGGESTIONS,
  placeRangeLabel,
  readShortcut,
  referenceGamesOf,
  SEED_METHOD_LABELS,
  SEED_METHODS,
  expandShortcut,
} from "~/domain";
import {
  boicTargetOf,
  clearBoicTarget,
  clearPick,
  expectationsOf,
  pickLockFor,
  recordGracenote,
  recordSeed,
  removeGracenote,
  removeSeed,
  setBoicTarget,
  setPick,
} from "~/expectations/expectations";
import { formatBelgianClock, formatDate, formatDay } from "~/format";
import { potentialEntries } from "~/qualification/entries";
import type { Route } from "./+types/curate.expectations";

// Owner-only (under /curate); spec #20, stories 64 and 67–70, 116; ticket
// #40. The owner's Seeds and personal picks for a Championship or the Games,
// at /curate/championships/:id/expectations and /curate/games/:id/expectations.
// - Personal picks: one per Selected Entry, typed as a shortcut (Gold, Medal,
//   Top 8, QF exit, 5, 5-8), changed or cleared freely until the competition's
//   picks lock at its first Session (the Games: the first in any sport).
//   Writes after the lock are refused (409).
// - Seeds: dated snapshots per Entry: the world-ranking position monthly
//   (marked due when this month's is missing) until the entry list exists,
//   then the final Seed with its method. Same date = replaced.
// - The Games only (ticket #41): Gracenote picks, entered by hand from each
//   Sporza/VRT update (a shortcut or place, the update's date, the article's
//   link; same date = replaced), and the BOIC target, a delegation-level count
//   of medals and top-8 places (not an Expectation).
// Reference Games have no Expectations (404).

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Seeds and picks · ${loaderData?.competition.name ?? "Championship"} · BelgianSportsHub` }];
}

const PAGE = { championship: "/championship", games: "/games" } as const;

async function targetOf(db: Db, id: string, request: Request) {
  const kind = new URL(request.url).pathname.startsWith("/curate/games/") ? "games" : "championship";
  const row = await db.query.competition.findFirst({ where: eq(schema.competition.id, id) });
  if (!row || row.kind !== kind || referenceGamesOf(row)) throw data(kind === "games" ? "No such Games" : "No such Championship", { status: 404 });
  return { row, page: `${PAGE[kind]}/${row.id}`, here: `/curate/${kind === "games" ? "games" : "championships"}/${row.id}/expectations` };
}

/** "2 Dec 2026, 09:30 (Belgian time)". */
const belgianMoment = (at: Date) => `${formatDate(belgianDate(at))}, ${formatBelgianClock(at.toISOString())} (Belgian time)`;

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const db = dbFrom(context);
  const { row, page, here } = await targetOf(db, params.competitionId, request);
  const at = now();
  const [entries, lockAt, boic] = await Promise.all([potentialEntries(db, [row.id], at), pickLockFor(db, row), boicTargetOf(db, row)]);
  // Seeds for every Entry still in the running; picks for Selected ones.
  const shown = entries.filter((e) => e.status !== "not-selected" && e.status !== "withdrawn");
  const expectations = await expectationsOf(
    db,
    shown.map((e) => e.id),
    at,
  );
  const locked = at >= lockAt;
  return {
    competition: { name: row.name, page, here, games: row.kind === "games" },
    boic,
    lock: `${locked ? "Picks locked" : "Picks lock"} ${belgianMoment(lockAt)}`,
    locked,
    today: belgianDate(at),
    methods: SEED_METHODS.map((m) => ({ value: m, label: SEED_METHOD_LABELS[m] })),
    entries: shown.map((e) => {
      const x = expectations.get(e.id)!;
      return {
        id: e.id,
        name: e.who.name,
        event: e.event,
        sport: e.sport,
        selected: e.status === "selected",
        pick: x.pick,
        worldRankDue: x.worldRankDue,
        seeds: x.seeds.map((s) => ({
          id: s.id,
          place: placeRangeLabel(s),
          method: s.method ? SEED_METHOD_LABELS[s.method] : "",
          asOf: s.asOf,
          sourceUrl: s.sourceUrl,
        })),
        gracenote: x.gracenote.map((s) => ({ id: s.id, place: placeRangeLabel(s), asOf: s.asOf, sourceUrl: s.sourceUrl })),
      };
    }),
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const db = dbFrom(context);
  const { row, page, here } = await targetOf(db, params.competitionId, request);
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const at = now();
  switch (field("intent")) {
    case "pick":
      await setPick(db, row, field("entryId"), field("pick"), at);
      break;
    case "clear-pick":
      await clearPick(db, row, field("entryId"), at);
      break;
    case "record-seed": {
      const entryId = field("entryId");
      const entry = await db.query.entry.findFirst({ where: eq(schema.entry.id, entryId) });
      if (!entry || entry.competitionId !== row.id) throw data("No such Entry at this competition", { status: 404 });
      const method = field("method");
      if (!isSeedMethod(method)) throw data("Unknown Seed method", { status: 400 });
      // A Seed is a place or a place range, never a medal word.
      const place = readShortcut(field("place"));
      if (!place || (place.kind !== "place" && place.kind !== "range")) throw data("A Seed is a place (3) or a place range (3-4)", { status: 400 });
      await recordSeed(db, { entryId, ...expandShortcut(place), method, asOf: field("asOf"), sourceUrl: field("sourceUrl") || null }, at);
      break;
    }
    case "remove-seed":
      await removeSeed(db, row, field("snapshotId"));
      break;
    case "record-gracenote": {
      // A Gracenote pick is typed like a personal pick: Gold, Medal, 5, 5-8.
      const shortcut = readShortcut(field("place"));
      if (!shortcut) throw data("A Gracenote pick is Gold, Silver, Bronze, Medal, a place (5) or a range (5-8)", { status: 400 });
      await recordGracenote(db, row, { entryId: field("entryId"), ...expandShortcut(shortcut), asOf: field("asOf"), sourceUrl: field("sourceUrl") }, at);
      break;
    }
    case "remove-gracenote":
      await removeGracenote(db, row, field("snapshotId"));
      break;
    case "boic-target": {
      const count = (name: string) => (field(name) === "" ? null : Number(field(name)));
      await setBoicTarget(db, row, { medals: count("medals"), top8: count("top8"), statedOn: field("statedOn"), sourceUrl: field("sourceUrl") }, at);
      break;
    }
    case "clear-boic-target":
      await clearBoicTarget(db, row);
      break;
    default:
      throw data("Unknown action", { status: 400 });
  }
  // A pick made on the reader page goes back there; any other path (or another site) is not followed.
  const back = field("return");
  return redirect(back === page || back.startsWith(`${page}?`) ? back : here, 303);
}

export default function SeedsAndPicks({ loaderData }: Route.ComponentProps) {
  const { competition, lock, locked, today, methods, entries, boic } = loaderData;
  const selected = entries.filter((e) => e.selected);
  return (
    <>
      <p className="sub">
        <Link to={competition.page}>{competition.name}</Link>
      </p>
      <h1>{competition.games ? "Seeds, picks and targets" : "Seeds and picks"}</h1>
      <p className="note">{lock}</p>

      <h2>Personal picks</h2>
      <p className="sub">One pick per Selected Entry: Gold, Silver, Bronze, Medal, Top 8, a round exit (QF exit), a place (5) or a range (5-8). Change it freely until the lock; only the locked value counts.</p>
      {selected.length > 0 ? (
        <table aria-label="Personal picks">
          <thead>
            <tr>
              <th>Entry</th>
              <th className="n">Seed</th>
              <th>Pick</th>
            </tr>
          </thead>
          <tbody>
            {selected.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.name}
                  <div className="sub">{e.event}</div>
                </td>
                <td className="n">{e.seeds.at(-1)?.place ?? "–"}</td>
                <td>
                  {locked ? (
                    <>
                      {e.pick ? e.pick.label : "–"}
                      {e.pick && e.pick.label !== placeRangeLabel(e.pick) ? <div className="sub">{placeRangeLabel(e.pick)}</div> : null}
                    </>
                  ) : (
                    <>
                      <Form method="post" className="pick">
                        <input type="hidden" name="entryId" value={e.id} />
                        <input name="pick" list="pick-shortcuts" defaultValue={e.pick?.shortcut ?? ""} aria-label={`Pick for ${e.name}`} size={8} />
                        <button name="intent" value="pick">
                          Save
                        </button>
                      </Form>
                      {e.pick ? (
                        <Form method="post" className="pick">
                          <input type="hidden" name="entryId" value={e.id} />
                          <span className="sub">{e.pick.label === placeRangeLabel(e.pick) ? e.pick.label : `${e.pick.label} · ${placeRangeLabel(e.pick)}`} </span>
                          <button name="intent" value="clear-pick">
                            Clear
                          </button>
                        </Form>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">No Entry Selected yet: picks open per Entry as it is Selected.</p>
      )}
      <datalist id="pick-shortcuts">
        {PICK_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <h2>Seeds</h2>
      <p className="sub">The world-ranking position once a month until the entry list exists, then the final Seed from the entry list with its method.</p>
      {entries.length > 0 ? (
        <table aria-label="Seeds">
          <thead>
            <tr>
              <th>Entry</th>
              <th>Snapshots</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} data-entry={e.id} data-name={e.name}>
                <td>
                  {e.name}
                  <div className="sub">{e.event}</div>
                  {e.worldRankDue ? <div className="note">World-rank snapshot due</div> : null}
                </td>
                <td>
                  {e.seeds.map((s) => (
                    <Form method="post" key={s.id}>
                      <input type="hidden" name="snapshotId" value={s.id} />
                      {`${s.place} · ${s.method} · ${formatDay(s.asOf)} `}
                      {s.sourceUrl ? <a href={s.sourceUrl}>source</a> : null}{" "}
                      <button name="intent" value="remove-seed" className="link">
                        remove
                      </button>
                    </Form>
                  ))}
                </td>
                <td>
                  <Form method="post">
                    <input type="hidden" name="entryId" value={e.id} />
                    <input name="place" placeholder="3 or 3-4" size={5} aria-label={`Seed for ${e.name}`} required />
                    <select name="method" defaultValue={e.seeds.length > 0 && !e.worldRankDue ? "federation-seed" : "world-rank"} aria-label="Method">
                      {methods.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <input type="date" name="asOf" defaultValue={today} aria-label="As of" required />
                    <input type="url" name="sourceUrl" placeholder="Source URL" aria-label="Source URL" />
                    <button name="intent" value="record-seed">
                      Record
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">No potential Entries recorded yet.</p>
      )}

      {competition.games ? (
        <>
          <h2>Gracenote picks</h2>
          <p className="sub">From each Sporza/VRT update of Gracenote&apos;s Virtual Medal Table: the pick (Gold, Silver, Bronze, Medal, a place or a range), the update&apos;s date and the article&apos;s link.</p>
          {entries.length > 0 ? (
            <table aria-label="Gracenote picks">
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Updates</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.name}
                      <div className="sub">{e.event}</div>
                    </td>
                    <td>
                      {e.gracenote.map((s) => (
                        <Form method="post" key={s.id}>
                          <input type="hidden" name="snapshotId" value={s.id} />
                          {`${s.place} · Gracenote · ${formatDay(s.asOf)} `}
                          {s.sourceUrl ? <a href={s.sourceUrl}>source</a> : null}{" "}
                          <button name="intent" value="remove-gracenote" className="link">
                            remove
                          </button>
                        </Form>
                      ))}
                    </td>
                    <td>
                      <Form method="post">
                        <input type="hidden" name="entryId" value={e.id} />
                        <input name="place" list="pick-shortcuts" placeholder="Gold" size={6} aria-label={`Gracenote pick for ${e.name}`} required />
                        <input type="date" name="asOf" defaultValue={today} aria-label="Update of" required />
                        <input type="url" name="sourceUrl" placeholder="Article URL" aria-label="Article URL" required />
                        <button name="intent" value="record-gracenote">
                          Record
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <h2>BOIC target</h2>
          <p className="sub">The Belgian Olympic Committee&apos;s stated ambition for the delegation: a count, compared with Belgium&apos;s totals in After. Not an Expectation.</p>
          {boic ? (
            <Form method="post">
              <p className="meta">
                {`BOIC target: ${[boic.medals !== null ? `${boic.medals} medals` : null, boic.top8 !== null ? `${boic.top8} top-8 places` : null].filter(Boolean).join(" · ")} · stated ${formatDate(boic.statedOn)} · `}
                <a href={boic.sourceUrl}>source</a>{" "}
                <button name="intent" value="clear-boic-target" className="link">
                  clear
                </button>
              </p>
            </Form>
          ) : null}
          <Form method="post" className="fields">
            <label>
              Medals
              <input type="number" name="medals" min={0} defaultValue={boic?.medals ?? ""} size={3} />
            </label>
            <label>
              Top-8 places
              <input type="number" name="top8" min={0} defaultValue={boic?.top8 ?? ""} size={3} />
            </label>
            <label>
              Stated on
              <input type="date" name="statedOn" defaultValue={boic?.statedOn ?? today} required />
            </label>
            <label>
              Source
              <input type="url" name="sourceUrl" defaultValue={boic?.sourceUrl ?? ""} required />
            </label>
            <button name="intent" value="boic-target">
              Save target
            </button>
          </Form>
        </>
      ) : null}
    </>
  );
}
