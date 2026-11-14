// D1 schema (Drizzle). After changing this file run `npm run db:generate` to
// write the next migration into db/migrations; never edit applied migrations.
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** A Belgian Athlete (see GLOSSARY.md). Internal ID; external IDs live in athlete_external_id. */
export const athlete = sqliteTable("athlete", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  /** YYYY-MM-DD */
  dateOfBirth: text("date_of_birth"),
  /** Optional free-text profile note. */
  note: text("note"),
  /** YYYY-MM-DD of the first senior international performance for Belgium. */
  athleteSince: text("athlete_since"),
  /** Competition of that first performance, as the source titled it. */
  athleteSinceCompetition: text("athlete_since_competition"),
  /** The raw copy (e.g. a Team Belgium profile) this Athlete was created from; null when entered by hand. */
  rawCopyId: text("raw_copy_id").references(() => rawCopy.id),
});

/** Known external ID schemes, in display order. */
export const EXTERNAL_ID_SCHEMES = {
  "team-belgium": "Team Belgium",
  "world-athletics": "World Athletics",
  isu: "ISU",
  fis: "FIS",
  fivb: "FIVB",
  "world-archery": "World Archery",
  "world-triathlon": "World Triathlon",
  olympedia: "Olympedia",
  wikidata: "Wikidata",
} as const;

/** Where each external ID links to; `$1` is the ID. */
export const EXTERNAL_ID_LINKS: Record<string, string> = {
  "team-belgium": "https://www.teambelgium.be/atleten/$1",
  "world-athletics": "https://worldathletics.org/athletes/_/$1",
  olympedia: "https://www.olympedia.org/athletes/$1",
  wikidata: "https://www.wikidata.org/wiki/$1",
};

/** An Athlete's ID in another system: an IF ID per sport, Team Belgium, Olympedia or Wikidata. */
export const athleteExternalId = sqliteTable(
  "athlete_external_id",
  {
    athleteId: text("athlete_id")
      .notNull()
      .references(() => athlete.id),
    /** e.g. "world-athletics", "wikidata"; see EXTERNAL_ID_SCHEMES. */
    scheme: text("scheme").notNull(),
    value: text("value").notNull(),
    /** The raw copy this ID came from; null when entered by hand. */
    rawCopyId: text("raw_copy_id").references(() => rawCopy.id),
  },
  (t) => [primaryKey({ columns: [t.scheme, t.value] })],
);


/**
 * Every automatic fetch and every paste, as received. The body lives in R2
 * under `r2Key`; rows produced from it reference this row.
 */
export const rawCopy = sqliteTable("raw_copy", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Source key, e.g. "world-athletics". */
  source: text("source").notNull(),
  url: text("url").notNull(),
  r2Key: text("r2_key").notNull().unique(),
  contentType: text("content_type"),
  /** ISO 8601 instant of the fetch or paste. */
  fetchedAt: text("fetched_at").notNull(),
});

/**
 * A data source (spec #20, Ingest). Tier and cadence are data, so they change
 * without a deploy; the health columns are written by every run. Each
 * Automatic source has an adapter registered under `key` in
 * app/ingest/sources/index.ts.
 */
export const source = sqliteTable("source", {
  /** e.g. "isu-speed-skating"; also the source key of its raw copies. */
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  /** "automatic" | "assisted" | "manual" (SourceTier). */
  tier: text("tier").notNull(),
  cadenceDays: integer("cadence_days").notNull(),
  /** ISO instants from here on. */
  addedAt: text("added_at").notNull(),
  lastAttemptAt: text("last_attempt_at"),
  /** Last run that fetched and wrote everything it needed. */
  lastSuccessAt: text("last_success_at"),
  /** Last run that inserted or changed a row. */
  lastChangeAt: text("last_change_at"),
  lastFailureAt: text("last_failure_at"),
  lastError: text("last_error"),
  /** Set when the source refused a Worker request; it is then Assisted until cleared. */
  blockedAt: text("blocked_at"),
  blockedReason: text("blocked_reason"),
  /**
   * When the owner last acknowledged the source's problem in the Run sheet
   * (acknowledge, keep on Assisted, or retry). A newer problem reopens it.
   */
  acknowledgedAt: text("acknowledged_at"),
  /** The sport its pasted results belong to; prefills the paste importer. */
  sport: text("sport"),
  /** External ID scheme of the IF IDs in its tables, e.g. "isu"; the key when null. */
  idScheme: text("id_scheme"),
  /** The paste importer's saved column mapping (JSON SavedColumnMapping), set on the first confirmed paste. */
  columnMapping: text("column_mapping", { mode: "json" }).$type<Record<string, string>>(),
  /** When a paste for this source was last confirmed (the Paste imports step's cadence). */
  lastPastedAt: text("last_pasted_at"),
});

/**
 * One curation session on a Run sheet (spec #20, Curation workspace). Open
 * until the owner finishes it on the last step; the next visit starts a new one.
 */
export const runSheetSession = sqliteTable("run_sheet_session", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** "weekly" (the Live day pass comes later). */
  sheet: text("sheet").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

/**
 * The session log: every action the owner took in a session, in order. A
 * "pass" entry marks a step the owner moved on from (✓ in the rail).
 */
export const runSheetLog = sqliteTable("run_sheet_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .notNull()
    .references(() => runSheetSession.id),
  at: text("at").notNull(),
  /** Run sheet step key, e.g. "source-health". */
  step: text("step").notNull(),
  /** e.g. "pass", "acknowledge", "retry", "link". */
  action: text("action").notNull(),
  message: text("message").notNull(),
});

/**
 * One Monthly checklist item (spec #20, story 111): a slow-moving source the
 * owner looks at by hand, grouped under a topic (e.g. "2030 IF qualification
 * systems" → "FIS"). Due in the weekly Run sheet from `dueOn`; ticking it
 * moves `dueOn` `everyMonths` months past the tick.
 */
export const checklistItem = sqliteTable("checklist_item", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  topic: text("topic").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  everyMonths: integer("every_months").notNull().default(1),
  /** YYYY-MM-DD (Belgian date). */
  dueOn: text("due_on").notNull(),
  /** ISO instant of the last tick. */
  lastCheckedAt: text("last_checked_at"),
  /** "no change" | "changed" at the last tick. */
  lastOutcome: text("last_outcome"),
  /** What changed, when the owner said so. */
  lastNote: text("last_note"),
});

/** A competition as a source publishes it: a Championship, the Games, or a circuit event. */
export const competition = sqliteTable(
  "competition",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    sport: text("sport").notNull(),
    /** "championship" | "games" | "circuit" (CompetitionKind). */
    kind: text("kind").notNull(),
    /** YYYY-MM-DD, venue-local. */
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    city: text("city"),
    /** IOC code of the host country. */
    country: text("country"),
    /** IANA zone of the venue. */
    venueZone: text("venue_zone"),
    source: text("source").notNull(),
    /** The source's own ID for this competition. */
    sourceRef: text("source_ref").notNull(),
    rawCopyId: text("raw_copy_id")
      .notNull()
      .references(() => rawCopy.id),
  },
  (t) => [uniqueIndex("competition_source_ref").on(t.source, t.sourceRef)],
);

/**
 * An incoming identity that matched no Athlete (spec #20, stories 4 and 6),
 * waiting for the owner to link it, create an Athlete from it, or mark it
 * "not an Athlete". One item per external ID.
 */
export const mergeQueueItem = sqliteTable(
  "merge_queue_item",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    source: text("source").notNull(),
    name: text("name").notNull(),
    dateOfBirth: text("date_of_birth"),
    sport: text("sport").notNull(),
    /** The incoming IF ID. */
    scheme: text("scheme").notNull(),
    value: text("value").notNull(),
    rawCopyId: text("raw_copy_id")
      .notNull()
      .references(() => rawCopy.id),
    createdAt: text("created_at").notNull(),
    /** "open" | "linked" | "created" | "not-an-athlete". */
    status: text("status").notNull().default("open"),
    athleteId: text("athlete_id").references(() => athlete.id),
    resolvedAt: text("resolved_at"),
  },
  (t) => [uniqueIndex("merge_queue_item_external_id").on(t.scheme, t.value)],
);

/**
 * A Team (GLOSSARY "Team", ADR 0001): two or more Athletes competing together
 * for Belgium in one event. By default one per Belgium + event, keeping its
 * identity as its roster changes; where Belgium can field several at once
 * (beach volleyball pairs, doubles, boats) one per standing partnership.
 * `key` is the identity from the domain rule `teamIdentity`.
 */
export const team = sqliteTable("team", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  /** Event as the Team competes in it, e.g. "Team Pursuit Women", "Men". */
  event: text("event").notNull(),
  /** "default" | "partnership" (TeamKind). */
  kind: text("kind").notNull(),
  /** YYYY-MM-DD the partnership dissolved (its "retirement"); null while it stands. */
  dissolvedOn: text("dissolved_on"),
  /** The raw copy this Team was first seen in; null when entered by hand. */
  rawCopyId: text("raw_copy_id").references(() => rawCopy.id),
});

/**
 * A Team's roster at one competition (GLOSSARY "Roster"): whoever the official
 * result or squad list credits. A member is an Athlete, or a merge-queue item
 * while that identity is unresolved.
 */
export const rosterMember = sqliteTable(
  "roster_member",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id),
    athleteId: text("athlete_id").references(() => athlete.id),
    mergeQueueItemId: text("merge_queue_item_id").references(() => mergeQueueItem.id),
    rawCopyId: text("raw_copy_id")
      .notNull()
      .references(() => rawCopy.id),
  },
  (t) => [
    uniqueIndex("roster_member_athlete").on(t.teamId, t.competitionId, t.athleteId),
    uniqueIndex("roster_member_merge_queue_item").on(t.teamId, t.competitionId, t.mergeQueueItemId),
  ],
);

/**
 * A Belgian result in one event of a competition (spec #20, Data model). It
 * belongs to an Entry, an Athlete or a Team (ADR 0001), or to a merge-queue
 * item while an Athlete's identity is unresolved.
 */
export const result = sqliteTable(
  "result",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id),
    athleteId: text("athlete_id").references(() => athlete.id),
    mergeQueueItemId: text("merge_queue_item_id").references(() => mergeQueueItem.id),
    /** Set for a Team's result; its members are the Team's roster at this competition. */
    teamId: text("team_id").references(() => team.id),
    /** Event as the source titles it, e.g. "1000m Women". */
    event: text("event").notNull(),
    /** YYYY-MM-DD, venue-local. */
    date: text("date").notNull(),
    /** Official classification place; null when there is none. */
    place: integer("place"),
    /** "finished" | "eliminated" | "DNF" | "DSQ" (ResultStatus). */
    status: text("status").notNull(),
    /** As published, e.g. "1:18.060". */
    performance: text("performance"),
    source: text("source").notNull(),
    sourceRef: text("source_ref").notNull(),
    rawCopyId: text("raw_copy_id")
      .notNull()
      .references(() => rawCopy.id),
  },
  (t) => [uniqueIndex("result_source_ref").on(t.source, t.sourceRef)],
);

/**
 * An Athlete named on a competition's entry list (e.g. ISU's competitors
 * list) before event start lists exist. Shown under Upcoming on the Athlete page.
 */
export const entrant = sqliteTable(
  "entrant",
  {
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id),
    athleteId: text("athlete_id")
      .notNull()
      .references(() => athlete.id),
    rawCopyId: text("raw_copy_id")
      .notNull()
      .references(() => rawCopy.id),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.athleteId] })],
);
