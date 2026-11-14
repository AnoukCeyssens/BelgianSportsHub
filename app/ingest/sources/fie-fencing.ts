// FIE fencing through the page state fie.org renders into each page
// (`__NUXT_DATA__`, Nuxt's devalue format; research/summer-sport-sources).
// Plain GETs, no contract.
//
// One run:
// 1. the competitions page: the latest tournaments and the next ones;
// 2. for each senior World Cup, Grand Prix, Championship or Games that ended
//    since the last run (or is running): its tournament page, with its events;
// 3. for each individual senior event that has started: its results page,
//    written once the event is decided (someone is ranked first).
// The results page carries the top 24 of the final ranking, the pool ranking
// and the direct-elimination table; a Belgian outside the top 24 gets the
// round they went out in, without a place. The competitions page shows a
// limited number of past tournaments, so the first run's backfill is only as
// deep as that page. Team events wait for Teams (#27). There are no full
// entry lists in the page state, so there is no Upcoming.
import type { CompetitionKind, Person, SourceAdapter, SourceRun } from "../source-adapter";

const SITE = "https://fie.org";
const SPORT = "Fencing";
const FIRST_RUN_LOOKBACK_DAYS = 365;

/** The tournament types that count for the FIE official ranking (the Olympic qualification ranking). */
const KIND_BY_TYPE: Record<string, CompetitionKind> = {
  "Olympic Games": "games",
  "World Championship": "championship",
  "World Championships": "championship",
  "Zonal Championship": "championship",
  "Zonal Championships": "championship",
  "Grand Prix": "circuit",
  "World Cup": "circuit",
};

const WEAPONS: Record<string, string> = { E: "Épée", F: "Foil", S: "Sabre" };

type Tournament = {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  type: string;
  startDate: string;
  endDate: string;
  categories: string[];
};

type FieEvent = {
  competitionId: number;
  season: number;
  isTeam: boolean;
  category: string;
  weapon: string;
  gender: "M" | "F";
  startDate: string;
  endDate: string;
};

type Ranked = { rank: number | null; fencer: { id: number; name: string; date: string | null; countryCode: string } };
type PoolRow = { fencerId: number; nationality: string; name: string; victory: number; matches: number; qualified: boolean };
type Bout = { fencer1: Fencer; fencer2: Fencer };
type Fencer = { id: number | null; name: string; nationality: string; isWinner: boolean };
type Tableau = { suiteTableId: string; rounds: Record<string, Bout[]> }[];

type Query = { queryKey: unknown[]; state: { data?: { body?: unknown } } };

export const fieFencing: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const windowStart = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);

    const listing = await run.fetch(`${SITE}/competitions`);
    const seasons = new Map([...listing.text.matchAll(/href="\/tournaments\/(\d{4})\/(\d+)"/g)].map((m) => [Number(m[2]), m[1]]));
    const tournaments = new Map<number, Tournament>();
    for (const q of queries(listing.text)) {
      if (q.queryKey[0] !== "tournaments") continue;
      for (const t of (q.state.data?.body as { items?: Tournament[] })?.items ?? []) tournaments.set(t.id, t);
    }

    for (const t of [...tournaments.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id)) {
      const kind = KIND_BY_TYPE[t.type];
      const season = seasons.get(t.id);
      if (!kind || !season || !t.categories.includes("S") || t.endDate < windowStart) continue;
      const competitionId = await run.rows.competition({
        name: t.name,
        sport: SPORT,
        kind,
        startDate: t.startDate,
        endDate: t.endDate,
        city: t.city || null,
        country: t.country || null,
        venueZone: null,
        sourceRef: String(t.id),
        rawCopyId: listing.rawCopyId,
      });
      if (t.startDate > today) continue;

      const page = await run.fetch(`${SITE}/tournaments/${season}/${t.id}`);
      const events = queries(page.text)
        .filter((q) => q.queryKey[0] === "tournaments" && q.queryKey[1] === t.id)
        .flatMap((q) => (q.state.data?.body as { events?: FieEvent[] })?.events ?? []);
      for (const e of events) {
        if (e.isTeam || e.category !== "S" || e.startDate > today) continue;
        const fetched = await run.fetch(`${SITE}/tournaments/${season}/${t.id}/event/${e.competitionId}/results`);
        const cached = queries(fetched.text);
        const body = <T>(...key: unknown[]) =>
          cached.find((q) => key.every((k, i) => q.queryKey[i] === k))?.state.data?.body as T | undefined;
        const ranking = body<{ items?: Ranked[] }>("competitions", "results", e.competitionId)?.items ?? [];
        // Not decided yet: come back on the next run.
        if (!ranking.some((r) => r.rank === 1)) continue;
        const pools = body<{ rows?: PoolRow[] }>("competitions", "pool", "results", e.competitionId)?.rows ?? [];
        const tableau = body<{ tableau?: Tableau }>("competitions", "results", "tableau", e.competitionId)?.tableau ?? [];

        for (const belgian of belgians(ranking, pools)) {
          const top = ranking.find((r) => r.fencer.id === belgian.id);
          const pool = pools.find((r) => r.fencerId === belgian.id);
          const out = top?.rank ? null : wentOut(belgian.id, pool, tableau);
          if (!top?.rank && !out) continue;
          await run.rows.result({
            competitionId,
            person: belgian,
            event: `${e.gender === "M" ? "Men" : "Women"}'s ${WEAPONS[e.weapon] ?? e.weapon}`,
            date: e.endDate,
            place: top?.rank ?? null,
            status: top?.rank ? "finished" : "eliminated",
            performance: out,
            sourceRef: `${t.id}/${e.competitionId}/${belgian.id}`,
            rawCopyId: fetched.rawCopyId,
          });
        }
      }
    }
  },
};

/** Every Belgian in the event: the ranked ones (with a date of birth) and those only in the pools. */
function belgians(ranking: Ranked[], pools: PoolRow[]): (Person & { id: number })[] {
  const people = new Map<number, Person & { id: number }>();
  for (const { fencer } of ranking) {
    if (fencer.countryCode !== "BEL") continue;
    people.set(fencer.id, { id: fencer.id, ...person(fencer.id, fencer.name, fencer.date) });
  }
  for (const row of pools) {
    if (row.nationality !== "BEL" || people.has(row.fencerId)) continue;
    people.set(row.fencerId, { id: row.fencerId, ...person(row.fencerId, row.name, null) });
  }
  return [...people.values()];
}

function person(id: number, name: string, dateOfBirth: string | null): Person {
  return { name, dateOfBirth, nationality: "BEL", ifId: { scheme: "fie", value: String(id) } };
}

/** "Pools (2/6)" for a fencer out after the pools; "Table of 64" for the round of the table they lost. */
function wentOut(id: number, pool: PoolRow | undefined, tableau: Tableau): string | null {
  if (pool && !pool.qualified) return `Pools (${pool.victory}/${pool.matches})`;
  for (const [n, suite] of tableau.entries()) {
    for (const [round, bouts] of Object.entries(suite.rounds)) {
      if (!bouts.some((b) => [b.fencer1, b.fencer2].some((f) => f.id === id && !f.isWinner))) continue;
      const size = round.match(/\d+$/)?.[0] ?? round;
      // With two suites, the first is the preliminary table.
      return tableau.length > 1 && n === 0 ? `Preliminary table of ${size}` : `Table of ${size}`;
    }
  }
  return null;
}

/** The vue-query cache Nuxt renders into the page: each query's key and fetched body. */
function queries(html: string): Query[] {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("FIE page without __NUXT_DATA__ (format changed?)");
  const root = devalue(JSON.parse(m[1]) as unknown[]) as { state?: Record<string, { queries?: Query[] }> };
  return root.state?.["$svue-query"]?.queries ?? [];
}

/** Revives Nuxt's devalue payload: a flat array where objects and arrays refer to other entries by index. */
function devalue(flat: unknown[]): unknown {
  const revived = new Map<number, unknown>();
  const at = (i: number): unknown => {
    if (i < 0) return i === -1 ? undefined : null;
    if (revived.has(i)) return revived.get(i);
    const v = flat[i];
    let out: unknown = v;
    if (Array.isArray(v)) {
      if (typeof v[0] === "string") {
        const [type, ...rest] = v as [string, ...number[]];
        if (["Reactive", "ShallowReactive", "Ref", "ShallowRef"].includes(type)) out = at(rest[0]);
        else if (type === "Set") out = rest.map(at);
        else out = null;
      } else {
        out = (v as number[]).map(at);
      }
    } else if (v !== null && typeof v === "object") {
      out = Object.fromEntries(Object.entries(v as Record<string, number>).map(([k, j]) => [k, at(j)]));
    }
    revived.set(i, out);
    return out;
  };
  return at(0);
}

function isoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
