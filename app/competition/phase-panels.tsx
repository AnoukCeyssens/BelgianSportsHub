import { Link } from "react-router";
import { sportColour } from "~/calendar/sport-colours";
import type { Db } from "~/db/client";
import {
  belgianDate,
  PHASE_LABELS,
  placeRangeLabel,
  SEED_METHOD_LABELS,
  QUALIFICATION_STATUS_LABELS,
  QUOTA_PLACE_KIND_LABELS,
  QUOTA_PLACE_STATE_LABELS,
  QUOTA_PLACE_STATES,
  standardsForSports,
  windowCountdown,
  VERDICT_LABELS,
  type Phase,
  type QualificationStatus,
} from "~/domain";
import { expectationsOf, pickLockFor, type PickView, type SnapshotView } from "~/expectations/expectations";
import { AFTER_SOURCE_LABELS, loadAfter, type AfterRow, type AfterView, type Compared } from "~/expectations/verdicts";
import { formatBelgianClock, formatDate, formatDay } from "~/format";
import { potentialEntries, type PotentialEntry } from "~/qualification/entries";
import { quotaPlacesOf, type QuotaPlaceView } from "~/qualification/quota-places";
import { QualificationBadge, TrackMark } from "~/qualification/qualification-section";
import { LiveDayPanel, loadLiveDay, loadMedalTable, MedalTablePanel, type LiveDayView, type MedalTableView } from "./live-panel";
import type { CompetitionRow } from "./phase-inputs";

// What each Phase shows on a competition page (spec #20, stories 43–48;
// ticket #31). One phase is shown at a time, so the page loads only the shown
// phase's data: `loadPhasePanel` returns one member of `PhasePanelData`, and
// `PhasePanel` renders it.
//
// Plugging in a phase's content (#32 Qualification, #34 Selection, #37/#38
// Live, #41 After, #35 for the Games):
// 1. widen that phase's member of `PhasePanelData` with what it shows;
// 2. load it in that phase's `case` of `loadPhasePanel` (batched queries; take
//    `now` from the caller, never read the clock here);
// 3. render it in that phase's component below, replacing the "not recorded
//    yet" line. Keep the `<section aria-label="<Phase>">` wrapper: readers and tests find it by that name.
// Games-only content (sport chips, medal table) takes the sport filter as an
// extra argument rather than a second set of panels: `SportChips` (#35) holds
// the Games' sports and the chosen chips (none chosen = All sports). Filter
// each phase's rows by `chips.chosen` as they arrive (Entries by their sport).

/** A curated value's source (URL) and the Belgian date it was last checked (#20 review). */
export type Sourced = { source: string | null; checkedOn: string | null };

export type PublishedStandards = {
  expectedOn: string | null;
  expected: Sourced;
  publishedOn: string | null;
  url: string | null;
  checkedOn: string | null;
  lines: string[];
};

export type PhasePanelData =
  | { phase: "standards"; standards: PublishedStandards }
  | {
      phase: "qualification";
      standards: PublishedStandards;
      /** When the qualification window closes (YYYY-MM-DD) and the days left; null when not recorded. */
      closesOn: string | null;
      closes: Sourced;
      closesIn: number | null;
      /** Active potential Entries with their tracks (ticket #32), filtered by the chosen sport chips. */
      entries: PotentialEntry[];
      /** At the Games each Entry shows its sport's colour. */
      games: boolean;
      /** The Games' Quota places (ticket #36, ADR 0002), next to the Entries' statuses, filtered by the chosen chips; null at a Championship (it has none). */
      quotaPlaces: QuotaPlaceView[] | null;
    }
  | {
      phase: "selection";
      /** The selector's final list (ticket #34), the non-selected Entries underneath, and those still qualifying; filtered by the chosen sport chips. */
      selected: PotentialEntry[];
      notSelected: PotentialEntry[];
      stillQualifying: PotentialEntry[];
      games: boolean;
      /** Each Selected Entry's external Expectation and personal pick (ticket #40), by Entry id. */
      expectations: Record<string, SelectedExpectations>;
      /** When personal picks lock (ISO instant): the first Session (the Games: in any sport). */
      picksLockAt: string;
      /** The owner's pick forms (owner only, before the lock): they post to the owner's expectations action and come back to `returnTo`. */
      picks: { action: string; returnTo: string } | null;
    }
  | { phase: "live"; day: LiveDayView | null; medals: MedalTableView }
  | {
      phase: "after";
      /** Every Expectation against the outcome, tallies and counts (ticket #41), filtered by the chosen sport chips. */
      after: AfterView;
      medals: MedalTableView;
    };

/** Shown next to a Selected Entry: the latest Seed, how the monthly world rank moved before a final Seed, the latest Gracenote pick (the Games) and the pick. */
export type SelectedExpectations = { seed: SnapshotView | null; worldRanks: SnapshotView[]; gracenote: SnapshotView | null; pick: PickView | null };

/** The viewer when it is the owner: the reader page's path to come back to after a pick. Null for everyone else. */
export type OwnerView = { returnTo: string } | null;

/** A Games' sports and the chosen chips; none chosen means All sports. A Championship has none. */
export type SportChips = { sports: readonly string[]; chosen: readonly string[] };

const NO_CHIPS: SportChips = { sports: [], chosen: [] };

/**
 * `day` is the Live day asked for (`?day=`), venue-local YYYY-MM-DD. `owner`
 * is set only when the owner is viewing (decided server-side): it adds the
 * pick forms to the Selection phase, so nobody else's HTML has them.
 */
export async function loadPhasePanel(
  db: Db,
  competition: CompetitionRow,
  phase: Phase,
  now: Date,
  chips: SportChips = NO_CHIPS,
  day: string | null = null,
  owner: OwnerView = null,
): Promise<PhasePanelData> {
  switch (phase) {
    case "standards":
      return { phase, standards: standardsOf(competition, now, chips) };
    case "qualification": {
      const games = competition.kind === "games";
      const [entries, places] = await Promise.all([potentialEntries(db, [competition.id], now), games ? quotaPlacesOf(db, competition.id) : null]);
      const chosen = chips.chosen.map((s) => s.toLowerCase());
      const shown = <T extends { sport: string }>(rows: T[]) => (chosen.length > 0 ? rows.filter((r) => chosen.includes(r.sport.toLowerCase())) : rows);
      return {
        phase,
        standards: standardsOf(competition, now, chips),
        closesOn: competition.qualificationClosesOn,
        closes: { source: competition.qualificationClosesSource, checkedOn: competition.qualificationClosesCheckedOn },
        closesIn: windowCountdown(competition.qualificationClosesOn, now),
        entries: shown(entries),
        games,
        quotaPlaces: places && shown(places),
      };
    }
    case "selection": {
      const entries = chosenOnly(await potentialEntries(db, [competition.id], now), chips);
      const selected = entries.filter((e) => e.status === "selected");
      const [expectations, lockAt] = await Promise.all([
        expectationsOf(
          db,
          selected.map((e) => e.id),
          now,
        ),
        pickLockFor(db, competition),
      ]);
      return {
        phase,
        selected,
        expectations: Object.fromEntries(
          [...expectations].map(([id, x]) => [
            id,
            {
              seed: x.seed,
              worldRanks: x.seed?.method === "world-rank" ? [] : x.seeds.filter((s) => s.method === "world-rank"),
              gracenote: competition.kind === "games" ? (x.gracenote.at(-1) ?? null) : null,
              pick: x.pick,
            },
          ]),
        ),
        picksLockAt: lockAt.toISOString(),
        // Picks open while the Entry is Selected and the lock has not come (canPick); the forms post to /curate, never cached.
        picks:
          owner && now < lockAt
            ? { action: `/curate/${competition.kind === "games" ? "games" : "championships"}/${competition.id}/expectations`, returnTo: owner.returnTo }
            : null,
        notSelected: entries.filter((e) => e.status === "not-selected"),
        stillQualifying: entries.filter((e) => e.status !== "selected" && e.status !== "not-selected" && e.status !== "withdrawn"),
        games: competition.kind === "games",
      };
    }
    case "live":
      return {
        phase,
        day: await loadLiveDay(db, competition, now, chips.chosen, day),
        medals: await loadMedalTable(db, competition, chips.chosen),
      };
    case "after":
      return { phase, after: await loadAfter(db, competition, chips.chosen), medals: await loadMedalTable(db, competition, chips.chosen) };
  }
}

/** The Entries of the chosen sports (all when none is chosen). */
function chosenOnly(entries: PotentialEntry[], chips: SportChips) {
  const chosen = chips.chosen.map((s) => s.toLowerCase());
  return chosen.length > 0 ? entries.filter((e) => chosen.includes(e.sport.toLowerCase())) : entries;
}

/** The recorded standards; only the expected date until they are published. Lines headed by a sport not chosen are left out. */
function standardsOf(c: CompetitionRow, now: Date, chips: SportChips): PublishedStandards {
  const published = c.standardsPublishedOn !== null && c.standardsPublishedOn <= belgianDate(now);
  const lines = (c.standardsText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const expected = { source: c.standardsExpectedSource, checkedOn: c.standardsExpectedCheckedOn };
  return published
    ? {
        expectedOn: null,
        expected,
        publishedOn: c.standardsPublishedOn,
        url: c.standardsUrl,
        checkedOn: c.standardsCheckedOn,
        lines: standardsForSports(lines, chips.sports, chips.chosen),
      }
    : { expectedOn: c.standardsExpectedOn, expected, publishedOn: null, url: null, checkedOn: null, lines: [] };
}

/** `dayHref` links a Live day (`?day=`), keeping the page's other choices. */
export function PhasePanel({ data, dayHref }: { data: PhasePanelData; dayHref: (date: string) => string }) {
  return (
    <section className="phase" aria-label={PHASE_LABELS[data.phase]}>
      {data.phase === "standards" ? <Standards standards={data.standards} /> : null}
      {data.phase === "qualification" ? (
        <>
          {data.standards.publishedOn ? (
            <>
              <h3>Standards</h3>
              <StandardLines lines={data.standards.lines} />
            </>
          ) : null}
          <Qualification data={data} />
          {data.quotaPlaces ? <QuotaPlaces places={data.quotaPlaces} /> : null}
        </>
      ) : null}
      {data.phase === "selection" ? <Selection data={data} /> : null}
      {data.phase === "live" ? (
        <>
          {data.day ? <LiveDayPanel view={data.day} dayHref={dayHref} /> : <p className="sub">No Sessions recorded yet.</p>}
          <MedalTablePanel view={data.medals} />
        </>
      ) : null}
      {data.phase === "after" ? (
        <>
          <After view={data.after} />
          <MedalTablePanel view={data.medals} title="Final medal table" />
        </>
      ) : null}
    </section>
  );
}

/** Spec stories 43 and 44: no stand-in criteria before publication; the published standards stay visible. */
function Standards({ standards }: { standards: PublishedStandards }) {
  if (!standards.publishedOn) {
    return (
      <p className="note">
        {standards.expectedOn ? (
          <>
            {`Standards expected ${formatDate(standards.expectedOn)}`}
            <SourceAndCheck {...standards.expected} />.
          </>
        ) : (
          "Publication date of the standards not known yet."
        )}
      </p>
    );
  }
  return (
    <>
      <p className="meta">
        {`Published ${formatDate(standards.publishedOn)}`}
        <SourceAndCheck source={standards.url} checkedOn={standards.checkedOn} />
      </p>
      <StandardLines lines={standards.lines} />
    </>
  );
}

/** " · source · checked 14 Nov 2026": the link to where a curated value was read, and when. */
function SourceAndCheck({ source, checkedOn }: Sourced) {
  return (
    <>
      {source && /^https?:\/\//.test(source) ? (
        <>
          {" · "}
          <a href={source}>source</a>
        </>
      ) : null}
      {checkedOn ? ` · checked ${formatDate(checkedOn)}` : null}
    </>
  );
}

function StandardLines({ lines }: { lines: string[] }) {
  return lines.length > 0 ? (
    <ul className="standards">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  ) : null;
}

/** Best standing first, for the counts line. */
const COUNT_ORDER: readonly QualificationStatus[] = ["selected", "qualified", "eligible", "on-track", "at-risk", "not-in-contention", "not-selected", "withdrawn"];

/** "1 qualified · 2 on track · 1 at risk": the count of each status, best standing first. */
function statusCounts(entries: PotentialEntry[]) {
  return COUNT_ORDER.map((status) => [status, entries.filter((e) => e.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${QUALIFICATION_STATUS_LABELS[status].toLowerCase()}`)
    .join(" · ");
}

/** Spec story 45: each potential Entry with its tracks (✓ / ✗ / pending) and its status badge. */
function Qualification({ data }: { data: Extract<PhasePanelData, { phase: "qualification" }> }) {
  return (
    <>
      <h3>Qualification</h3>
      {data.closesOn ? (
        <p className="note">
          {`Qualification window closes ${formatDate(data.closesOn)}`}
          {data.closesIn !== null && data.closesIn >= 0 ? ` · ${data.closesIn} days left` : " · closed"}
          <SourceAndCheck {...data.closes} />
        </p>
      ) : null}
      {data.entries.length > 0 ? (
        <>
          <p className="meta">{statusCounts(data.entries)}</p>
          <table aria-label="Potential Entries">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Qualification tracks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    {data.games ? <span className="dot" style={{ background: sportColour(e.sport) }}></span> : null}
                    <Link to={e.who.kind === "team" ? `/teams/${e.who.id}` : `/athletes/${e.who.id}`}>{e.who.name}</Link>
                    <div className="sub">{e.event}</div>
                  </td>
                  <td>
                    {e.tracks.map((t) => (
                      <div key={t.id}>
                        <TrackMark state={t.state} /> {t.name} <span className="sub">{`need ${t.needed} · has ${t.has}`}</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <QualificationBadge status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="sub">No Qualification statuses recorded yet.</p>
      )}
    </>
  );
}

const SELECTION_KIND = { "press-release": "press release", "entry-list": "IF entry list" } as const;

/** Each distinct Selection behind the list ("Selected by … · date · source"). */
function selectionsBehind(entries: PotentialEntry[]) {
  const seen = new Map<string, NonNullable<PotentialEntry["selection"]>>();
  for (const e of entries) if (e.selection) seen.set(JSON.stringify(e.selection), e.selection);
  return [...seen.values()];
}

function EntryCells({ entry, games }: { entry: PotentialEntry; games: boolean }) {
  return (
    <>
      <td>
        {games ? <span className="dot" style={{ background: sportColour(entry.sport) }}></span> : null}
        <Link to={entry.who.kind === "team" ? `/teams/${entry.who.id}` : `/athletes/${entry.who.id}`}>{entry.who.name}</Link>
      </td>
      <td className="sub">{entry.event}</td>
    </>
  );
}

function EntryTable({ label, entries, games, badge = false }: { label: string; entries: PotentialEntry[]; games: boolean; badge?: boolean }) {
  return (
    <table aria-label={label}>
      <thead>
        <tr>
          <th>Entry</th>
          <th>Event</th>
          {badge ? <th>Status</th> : null}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <EntryCells entry={e} games={games} />
            {badge ? (
              <td>
                <QualificationBadge status={e.status} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Spec stories 46, 64 and 67 (ticket #40): the selector's final list with each
 * Entry's external Expectation (the latest Seed, its method and date, and how
 * the monthly world rank moved before the final Seed) and the owner's pick.
 */
function SelectedTable({ data }: { data: Extract<PhasePanelData, { phase: "selection" }> }) {
  return (
    <table aria-label="Selected Entries">
      <thead>
        <tr>
          <th>Entry</th>
          <th>Event</th>
          <th className="n">Seed</th>
          {data.games ? <th className="n">Gracenote</th> : null}
          <th className="n">Pick</th>
        </tr>
      </thead>
      <tbody>
        {data.selected.map((e) => {
          const x = data.expectations[e.id];
          return (
            <tr key={e.id}>
              <EntryCells entry={e} games={data.games} />
              <td className="n">
                {x?.seed ? (
                  <>
                    {placeRangeLabel(x.seed)}
                    <div className="sub">{`${x.seed.method ? SEED_METHOD_LABELS[x.seed.method] : "seed"} · ${formatDay(x.seed.asOf)}`}</div>
                    {x.worldRanks.length > 0 ? <div className="sub">{`world ranking ${x.worldRanks.map((s) => placeRangeLabel(s)).join(" → ")}`}</div> : null}
                  </>
                ) : (
                  "–"
                )}
              </td>
              {data.games ? (
                <td className="n">
                  {x?.gracenote ? (
                    <>
                      {placeRangeLabel(x.gracenote)}
                      <div className="sub">
                        {"Gracenote via "}
                        {x.gracenote.sourceUrl ? <a href={x.gracenote.sourceUrl}>{hostOf(x.gracenote.sourceUrl)}</a> : "Gracenote"}
                        {` · ${formatDay(x.gracenote.asOf)}`}
                      </div>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
              ) : null}
              <td className="n">
                {x?.pick ? (
                  <>
                    {x.pick.label}
                    {x.pick.label !== placeRangeLabel(x.pick) ? <div className="sub">{placeRangeLabel(x.pick)}</div> : null}
                  </>
                ) : (
                  "–"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The owner's pick per Selected Entry, right on the reader page (spec stories
 * 67–70): plain forms posting to the owner's expectations action under
 * /curate (owner-only, never cached offline), which comes back here.
 */
function MyPicks({ data, picks }: { data: Extract<PhasePanelData, { phase: "selection" }>; picks: NonNullable<Extract<PhasePanelData, { phase: "selection" }>["picks"]> }) {
  return (
    <section aria-label="My picks">
      <h3>My picks</h3>
      <p className="sub">Gold, Silver, Bronze, Medal, Top 8, a round exit (QF exit), a place (5) or a range (5-8).</p>
      {data.selected.map((e) => {
        const pick = data.expectations[e.id]?.pick ?? null;
        return (
          <div key={e.id}>
            <form method="post" action={picks.action} aria-label={`Pick for ${e.who.name} · ${e.event}`}>
              <input type="hidden" name="intent" value="pick" />
              <input type="hidden" name="entryId" value={e.id} />
              <input type="hidden" name="return" value={picks.returnTo} />
              <label>
                {`${e.who.name} · ${e.event} `}
                <input name="pick" defaultValue={pick?.shortcut ?? ""} required size={8} />
              </label>{" "}
              <button type="submit">Save pick</button>
            </form>
            {pick ? (
              <form method="post" action={picks.action} aria-label={`Clear the pick for ${e.who.name} · ${e.event}`}>
                <input type="hidden" name="intent" value="clear-pick" />
                <input type="hidden" name="entryId" value={e.id} />
                <input type="hidden" name="return" value={picks.returnTo} />
                <button type="submit">Clear</button>
              </form>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

/** Spec story 46: the selector's final list, the non-selected Entries underneath; others may still be qualifying. */
function Selection({ data }: { data: Extract<PhasePanelData, { phase: "selection" }> }) {
  return (
    <>
      <h3>Selection</h3>
      {selectionsBehind(data.selected).map((s, i) => (
        <p className="meta" key={i}>
          {`Selected by ${s.selector ?? "the selector"}${s.on ? ` · ${formatDate(s.on)}` : ""} · `}
          {s.source ? <a href={s.source}>{SELECTION_KIND[s.kind]}</a> : SELECTION_KIND[s.kind]}
        </p>
      ))}
      {data.selected.length > 0 ? (
        <>
          <SelectedTable data={data} />
          <p className="sub">{`Personal picks lock ${formatDate(belgianDate(new Date(data.picksLockAt)))}, ${formatBelgianClock(data.picksLockAt)} (Belgian time).`}</p>
          {data.picks ? <MyPicks data={data} picks={data.picks} /> : null}
        </>
      ) : (
        <p className="sub">No Entry Selected in these sports yet.</p>
      )}
      {data.notSelected.length > 0 ? (
        <>
          <h3>Not selected</h3>
          <EntryTable label="Not selected Entries" entries={data.notSelected} games={data.games} />
        </>
      ) : null}
      {data.stillQualifying.length > 0 ? (
        <>
          <h3>Still qualifying</h3>
          <EntryTable label="Entries still qualifying" entries={data.stillQualifying} games={data.games} badge />
        </>
      ) : null}
    </>
  );
}

/** "2 provisional · 1 allocated": the count of each lifecycle state, in lifecycle order. */
function placeCounts(places: QuotaPlaceView[]) {
  return QUOTA_PLACE_STATES.map((state) => [state, places.filter((p) => p.state === state).length] as const)
    .filter(([, n]) => n > 0)
    .map(([state, n]) => `${n} ${QUOTA_PLACE_STATE_LABELS[state].toLowerCase()}`)
    .join(" · ");
}

/**
 * Spec stories 78–81 (ADR 0002): Belgium's Quota places at the Games, a
 * separate fact from the Entries' statuses above: each place's event, whether
 * it is NOC-owned or named, its lifecycle state, the Entry it is linked to
 * (an NOC-owned place only from Selection), and its source and last check.
 */
function QuotaPlaces({ places }: { places: QuotaPlaceView[] }) {
  return (
    <>
      <h3>Quota places</h3>
      {places.length > 0 ? (
        <>
          <p className="meta">{placeCounts(places)}</p>
          <table aria-label="Quota places">
            <thead>
              <tr>
                <th>Event</th>
                <th>Place</th>
                <th>State</th>
                <th>Entry</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {places.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="dot" style={{ background: sportColour(p.sport) }}></span>
                    {`${p.sport} · ${p.event}`}
                    {p.of > 1 ? <div className="sub">{`place ${p.number} of ${p.of}`}</div> : null}
                  </td>
                  <td>{QUOTA_PLACE_KIND_LABELS[p.kind]}</td>
                  <td>
                    <span className={`badge qp-${p.state}`}>{QUOTA_PLACE_STATE_LABELS[p.state]}</span>
                    {p.earnedVia || p.reallocated ? (
                      <div className="sub">{[p.earnedVia ? `via ${p.earnedVia}` : null, p.reallocated ? "reallocated" : null].filter(Boolean).join(" · ")}</div>
                    ) : null}
                  </td>
                  <td>
                    {p.entry ? (
                      <Link to={p.entry.who.kind === "team" ? `/teams/${p.entry.who.id}` : `/athletes/${p.entry.who.id}`}>{p.entry.who.name}</Link>
                    ) : (
                      <span className="sub">{p.kind === "noc" ? "at Selection" : "–"}</span>
                    )}
                  </td>
                  <td className="sub">
                    {/^https?:\/\//.test(p.source) ? <a href={p.source}>{p.source}</a> : p.source}
                    {` · checked ${formatDate(p.checkedOn)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="sub">No Quota places recorded yet.</p>
      )}
    </>
  );
}

const whoHref = (who: AfterRow["who"]) => (who.kind === "team" ? `/teams/${who.id}` : `/athletes/${who.id}`);

const ORDINAL_MEDAL = ["G", "S", "B"] as const;

/** The outcome as published: the place, Withdrawn, or the result's status (DNF, DSQ); "no place" without a result. */
function outcomeText(o: AfterRow["outcome"]) {
  if (o.place !== null) return placeRangeLabel({ from: o.place, to: o.place });
  if (o.withdrawn) return "Withdrawn";
  return o.status && o.status !== "finished" ? o.status : "no place";
}

function ComparedCell({ c }: { c: Compared }) {
  return (
    <td className="n">
      {c ? (
        <>
          {placeRangeLabel(c)} <span className={`verdict v-${c.verdict}`}>{VERDICT_LABELS[c.verdict]}</span>
        </>
      ) : (
        "–"
      )}
    </td>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Spec stories 48, 51–52 and 71–75 (ticket #41): each Entry's Expectations
 * (Seed, Gracenote at the Games, the owner's pick) with the raw places and a
 * Verdict, the outcome, a Beat/Met/Missed tally per source, Belgium's medal
 * and top-8 counts against the BOIC target and the implied counts, and
 * Belgium's best results.
 */
function After({ view }: { view: AfterView }) {
  return (
    <>
      <h3>Expectation vs outcome</h3>
      {view.rows.length > 0 ? (
        <>
          <table aria-label="Expectations vs outcome">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Event</th>
                {view.sources.map((s) => (
                  <th key={s} className="n">
                    {AFTER_SOURCE_LABELS[s]}
                  </th>
                ))}
                <th className="n">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {view.games ? <span className="dot" style={{ background: sportColour(row.sport) }}></span> : null}
                    <Link to={whoHref(row.who)}>{row.who.name}</Link>
                  </td>
                  <td className="sub">{row.event}</td>
                  {view.sources.map((s) => (
                    <ComparedCell key={s} c={row.compared[s]} />
                  ))}
                  <td className="n">
                    <b>{outcomeText(row.outcome)}</b>
                    {row.outcome.performance ? <div className="sub">{row.outcome.performance}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sub">
            Seeds and Gracenote picks as they stood the day before the start; picks as locked. A pick for an Entry withdrawn before the lock is voided.
          </p>
          {view.gracenoteUpdates.map((u) => (
            <p className="sub" key={`${u.asOf} ${u.sourceUrl}`}>
              {"Gracenote via "}
              <a href={u.sourceUrl}>{hostOf(u.sourceUrl)}</a>
              {` · ${formatDate(u.asOf)}`}
            </p>
          ))}

          <h3>Tally</h3>
          <table aria-label="Tally">
            <thead>
              <tr>
                <th>Source</th>
                <th className="n">Beat</th>
                <th className="n">Met</th>
                <th className="n">Missed</th>
              </tr>
            </thead>
            <tbody>
              {view.tallies.map(({ source, tally }) => (
                <tr key={source}>
                  <td>{AFTER_SOURCE_LABELS[source]}</td>
                  <td className="n">{tally.beat}</td>
                  <td className="n">{tally.met}</td>
                  <td className="n">{tally.missed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="sub">No Selected Entries to compare in these sports.</p>
      )}

      <h3>Medals and top 8</h3>
      <table aria-label="Medals and top 8">
        <thead>
          <tr>
            <th></th>
            <th className="n">Medals</th>
            <th className="n">Top 8</th>
          </tr>
        </thead>
        <tbody>
          {view.counts.map((c, i) => (
            <tr key={c.label} className={i === 0 ? "bel" : undefined}>
              <td>{c.sourceUrl ? <a href={c.sourceUrl}>{c.label}</a> : c.label}</td>
              <td className="n">{c.counts.medals ?? "–"}</td>
              <td className="n">{c.counts.top8 ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub">A pick or Seed that is a range counts toward a medal or the top 8 only when the whole range lies inside it.</p>

      {view.best.length > 0 ? (
        <>
          <h3>Best results</h3>
          <table aria-label="Best results">
            <thead>
              <tr>
                <th>Place</th>
                <th>Entry</th>
                <th className="n">Performance</th>
              </tr>
            </thead>
            <tbody>
              {view.best.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.outcome.place! <= 3 ? (
                      <span className={`medal m${row.outcome.place}`}>{ORDINAL_MEDAL[row.outcome.place! - 1]}</span>
                    ) : (
                      placeRangeLabel({ from: row.outcome.place!, to: row.outcome.place! })
                    )}
                  </td>
                  <td>
                    {view.games ? <span className="dot" style={{ background: sportColour(row.sport) }}></span> : null}
                    <Link to={whoHref(row.who)}>{row.who.name}</Link>
                    <div className="sub">{row.event}</div>
                  </td>
                  <td className="n">{row.outcome.performance ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}
