// The seam between one Automatic source and the rest of ingest (spec #20,
// Ingest). An adapter knows its source's URLs and payloads, and nothing about
// D1, R2, identity matching or source health: it fetches through `run.fetch`
// (which keeps the raw copy and detects a refusal) and hands what it parsed
// to `run.rows` (which keeps Belgian rows only, matches identities and links
// every row to its raw copy). runSource() in ./source-run.ts does the rest.
// Register each adapter in ./sources/index.ts under its Source row's key.

export type SourceAdapter = {
  run(run: SourceRun): Promise<void>;
  /**
   * The Source whose rows this adapter writes, when not its own: a
   * Championship timetable source (#39) fetches on its own cadence and health
   * row, but its competitions are its federation's results source's, so both
   * find the same competition by that source's IDs.
   */
  writesAs?: string;
};

export type SourceRun = {
  /** The time of this run. */
  now: Date;
  /** Start of the last successful run, or null on the first run: fetch only what changed since. */
  since: Date | null;
  /**
   * Fetches a public URL politely and keeps the body as received in R2.
   * Throws SourceBlocked when the source refuses the Worker, and a plain
   * error for anything else that is not 2xx (the job is then retried).
   */
  fetch(url: string, init?: FetchInit): Promise<Fetched>;
  /**
   * Like fetch, for large or binary payloads (FIS ZIPs): the body goes to R2
   * as a stream and is read back as one, so it is never held in memory whole.
   */
  fetchStream(url: string): Promise<FetchedStream>;
  /**
   * A credential the owner set as a Worker secret (e.g. World Triathlon's API
   * key), or undefined when it is not set. Send it in a header, never in the
   * URL: URLs are kept with every raw copy.
   */
  secret(name: string): string | undefined;
  rows: BelgianRows;
};

export type FetchInit = {
  /** Extra request headers, e.g. an API key. They are not kept with the raw copy. */
  headers?: Record<string, string>;
  /**
   * Sends a POST with this form (application/x-www-form-urlencoded, fields in
   * the given order) instead of a GET, for sources whose grids only answer
   * POSTs (UCI DataRide). The form is kept with the raw copy, as the URL is.
   */
  form?: Record<string, string>;
};

export type Fetched = {
  text: string;
  /** The raw copy every row parsed from this body must carry. */
  rawCopyId: string;
};

export type FetchedStream = {
  /** The body as received, read back from its raw copy. */
  body: ReadableStream<Uint8Array>;
  /** The raw copy every row parsed from this body must carry. */
  rawCopyId: string;
};

export type CompetitionKind = "championship" | "games" | "circuit";

export type CompetitionInput = {
  name: string;
  sport: string;
  kind: CompetitionKind;
  /** YYYY-MM-DD, venue-local. */
  startDate: string;
  endDate: string;
  city: string | null;
  /** IOC code of the host country. */
  country: string | null;
  /** IANA zone of the venue. */
  venueZone: string | null;
  /** The source's own ID for the competition. */
  sourceRef: string;
  /**
   * The recurring competition this is an edition of (e.g.
   * "isu:world-championships", "isu:world-cup:calgary"): stable from one
   * edition to the next, so a Belgian at the previous edition makes this one a
   * likely Participation. Europeans and Worlds, indoor and outdoor, short and
   * long course each get their own series. Leave out when the source gives no
   * way to tell.
   */
  series?: string | null;
  rawCopyId: string;
};

/** A person as a source names them. */
export type Person = {
  name: string;
  /** YYYY-MM-DD, when the source gives it. */
  dateOfBirth: string | null;
  /** IOC code of the sporting nationality the source lists. */
  nationality: string;
  /** The person's ID at this source's federation, e.g. { scheme: "isu", value: "692" }. */
  ifId: { scheme: string; value: string };
};

/** DNS is never a performance: adapters leave it out; only the Manual results form records one. */
export type ResultStatus = "finished" | "eliminated" | "DNF" | "DSQ" | "DNS";

export type ResultInput = {
  /** From BelgianRows.competition(). */
  competitionId: string;
  /** As the source titles it, e.g. "1000m Women". */
  event: string;
  /** The event's sport, only where the competition spans several (a reference Games); the competition's sport otherwise. */
  sport?: string | null;
  /** YYYY-MM-DD, venue-local. */
  date: string;
  /** Official classification place, or null when none was given. */
  place: number | null;
  status: ResultStatus;
  performance: string | null;
  /** The source's own ID for this result; a re-fetch updates the same row. */
  sourceRef: string;
  rawCopyId: string;
} & (
  | { person: Person }
  /** An Athlete the owner already named (the Manual results form): no identity matching. */
  | { athleteId: string }
  /** A Team and the Athletes its result credits, as the owner named them (a reference Games result by hand). */
  | { teamId: string; roster: string[] }
);

/**
 * One Belgian Team's result (ADR 0001): a relay, team pursuit, pair, boat or
 * national side. The writer finds or creates the Team (by default one per
 * Belgium + event; one per partnership where Belgium can field several, see
 * the domain rule `teamIdentity`) and adds the credited Belgians to its roster
 * at this competition.
 */
export type TeamResultInput = Omit<ResultInput, "person" | "athleteId"> & {
  /** IOC code of the nation the Team competes for. */
  nationality: string;
  /**
   * The event the Team is identified by, when the result's event title is
   * more specific (ISU "Team Pursuit Women Division B" → "Team Pursuit Women").
   */
  teamEvent?: string;
  /** Everyone the official result (or the squad list) credits; unnamed reserves are left out. */
  roster: Person[];
};

/** A Team as a ranking names it: a pair's members, or none for a nation ranking (the default Team). */
export type TeamInput = {
  sport: string;
  event: string;
  members: Person[] | null;
  rawCopyId: string;
};

/** One event round of a fetched timetable. Times are venue-local. */
export type TimetableRoundInput = {
  /** YYYY-MM-DD, venue-local. */
  date: string;
  /** HH:mm venue-local; null when the source gives none. */
  start: string | null;
  end: string | null;
  /** The organiser's Session code, when its rounds share one timed block; null otherwise (each round its own Session). */
  session: string | null;
  /** As the source names it ("Women's 100 Metres"); the writer matches it to the Entries the way `sameEvent` does. */
  event: string;
  round: string;
};

/**
 * A Championship's timetable as the source publishes it now (spec #20,
 * stories 61–63; ticket #39): every round, Belgian or not. The writer keeps a
 * new version only when it differs from every version seen before, and makes
 * Sessions of the rounds of events with a Belgian Entry.
 */
export type TimetableInput = {
  /** From BelgianRows.competition(). */
  competitionId: string;
  /** The source's own version stamp, if it has one; otherwise the writer stamps "fetched <date>". */
  version: string | null;
  /** YYYY-MM-DD the source says it published this version, when it does. */
  publishedOn: string | null;
  /** The page or API URL a reader can check it at. */
  sourceUrl: string;
  /** IANA zone of the venue; the competition's when null. Without either, nothing is stored. */
  venueZone: string | null;
  rounds: TimetableRoundInput[];
  rawCopyId: string;
};

/**
 * Where an adapter puts what it parsed. Only performances count as results:
 * an adapter leaves out DNS and withdrawals. Non-Belgian people are ignored
 * here, but adapters should filter by nationality early to keep work small.
 */
export type BelgianRows = {
  /** Creates or updates a competition; returns its id. Only qualification-relevant senior competitions belong here. */
  competition(input: CompetitionInput): Promise<string>;
  /** Writes one result for a Belgian: to the matched (or named) Athlete, or to a merge-queue item. */
  result(input: ResultInput): Promise<void>;
  /** Writes one Belgian Team's result and adds its credited Belgians to the Team's roster at the competition. */
  teamResult(input: TeamResultInput): Promise<void>;
  /** Finds or creates the Team a ranking row belongs to (pair → its partnership, nation → the default Team); returns its id. */
  team(input: TeamInput): Promise<string>;
  /** Replaces a competition's entry list: the Belgians it names who are already Athletes. */
  entrants(competitionId: string, people: Person[], rawCopyId: string): Promise<void>;
  /** Stores a Championship's timetable as a new version when it changed, and its Belgian Sessions. An empty timetable (not published yet) is ignored. */
  timetable(input: TimetableInput): Promise<void>;
};

/** The source refused the Worker (e.g. 401, 403, a bot challenge): it drops to Assisted. */
export class SourceBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceBlocked";
  }
}
