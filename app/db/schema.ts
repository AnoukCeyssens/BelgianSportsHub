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
  /**
   * YYYY-MM-DD of the latest senior international performance on the Athlete's
   * Team Belgium profile when the roster seed read it. Counts towards the
   * Active rule alongside stored results, so seeded Athletes with no result in
   * the last 12 months start inactive and recent ones start Active.
   */
  profileLatestPerformanceOn: text("profile_latest_performance_on"),
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
  "world-aquatics-gms": "World Aquatics (GMS)",
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
  /** "weekly" or "live" (the Live day pass). */
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
    /**
     * The recurring competition this is one edition of, e.g.
     * "isu:world-championships" or "isu:world-cup:calgary"; the previous
     * edition is the latest earlier one with the same series. Europeans and
     * Worlds, indoor and outdoor, short and long course are separate series
     * (each its own Championship). Null when the source gives no way to tell.
     */
    series: text("series"),
    /**
     * Phase inputs (ticket #31), curated by the owner for Championships and
     * the Games: when the qualification system or entry standards are
     * expected (YYYY-MM-DD) and, once out, when they were published (Belgian
     * date), where, and what they say (one line per event or track).
     */
    standardsExpectedOn: text("standards_expected_on"),
    standardsPublishedOn: text("standards_published_on"),
    standardsUrl: text("standards_url"),
    standardsText: text("standards_text"),
    /**
     * YYYY-MM-DD the qualification window closes for this target (ticket
     * #32; LA28: 11 Jun 2028, its last qualification event), curated with the
     * standards. The Athlete page counts down to it.
     */
    qualificationClosesOn: text("qualification_closes_on"),
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
 * One sport's first and last competition day at a Games (spec #20, story 60;
 * ticket #35), curated by the owner in the Run sheet's Schedules step until
 * the full session schedule is imported. Each sport is in its own Phase from
 * these days. Always inside the Games' own dates.
 */
export const gamesSportWindow = sqliteTable(
  "games_sport_window",
  {
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    sport: text("sport").notNull(),
    /** YYYY-MM-DD, venue-local. */
    firstDay: text("first_day").notNull(),
    lastDay: text("last_day").notNull(),
    /** Where the owner read the days (e.g. the organiser's competition schedule). */
    sourceUrl: text("source_url").notNull(),
    /** Belgian date of the owner's last check. */
    checkedOn: text("checked_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.sport] })],
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
    /**
     * The event's sport where the competition spans several (a reference
     * Games' owner row, ticket #46); null means the competition's own sport.
     */
    sport: text("sport"),
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

/**
 * The owner's word on a competition's Participation (spec #20, stories 96,
 * 109 and 114), from the Run sheet's Selections & likely step. Confirmed and
 * likely Participations from sources are not stored: they are derived from
 * `entrant` (entry lists), `result` and earlier editions by the domain rule
 * `participation()`. One row per competition.
 */
export const participationCuration = sqliteTable("participation_curation", {
  competitionId: text("competition_id")
    .primaryKey()
    .references(() => competition.id),
  /** ISO instant the owner added it by hand as a likely Participation; null when it became likely from a source. */
  addedAt: text("added_at"),
  /** "confirmed" | "kept" | "dropped"; null when only added. */
  decision: text("decision"),
  /** Where the owner saw it (e.g. an entry list or a federation post), when given. */
  sourceUrl: text("source_url"),
  /** ISO instant of the owner's last check. */
  checkedAt: text("checked_at").notNull(),
});

/**
 * An Entry (GLOSSARY "Entry", ADR 0001): an Athlete or a Team competing for
 * Belgium in one event at one competition. Named by the owner per event when
 * storing a timetable in the Schedules step (ticket #37); Selection (#34)
 * adds its status. Exactly one of `athleteId` / `teamId` is set.
 */
export const entry = sqliteTable(
  "entry",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    sport: text("sport").notNull(),
    /** Event as the timetable names it, e.g. "Women's 500 m". */
    event: text("event").notNull(),
    athleteId: text("athlete_id").references(() => athlete.id),
    /** Set instead of `athleteId` for a multi-athlete Entry (a Team, #27). */
    teamId: text("team_id").references(() => team.id),
    /** The round the Entry starts in after a bye; null when it starts in the event's first round. */
    firstRound: text("first_round"),
    /** Where the owner read the Entry (the timetable version's source), and the Belgian date of the last check. */
    sourceUrl: text("source_url"),
    checkedOn: text("checked_on").notNull(),
    /**
     * The Entry's Qualification status for this competition as a target
     * (GLOSSARY "Qualification status", ticket #32): "not-in-contention" |
     * "at-risk" | "on-track" | "eligible" | "qualified" | "selected" |
     * "not-selected" | "withdrawn" (QualificationStatus); null when none is
     * recorded. Set on the Athlete or Team only, never on roster members.
     * #33 suggests it, #34 sets Selected / Not selected.
     */
    qualificationStatus: text("qualification_status"),
    /** Where the owner read the status (a URL or a short description), and the Belgian date it was last checked. */
    qualificationSource: text("qualification_source"),
    qualificationCheckedOn: text("qualification_checked_on"),
  },
  (t) => [
    uniqueIndex("entry_athlete").on(t.competitionId, t.event, t.athleteId),
    uniqueIndex("entry_team").on(t.competitionId, t.event, t.teamId),
  ],
);

/**
 * One version of a competition's timetable (spec #20, story 61), as pasted
 * (or fetched, #39). Storing a new version replaces the previous version's
 * Sessions; the version rows stay as the history of changes.
 */
export const timetableVersion = sqliteTable("timetable_version", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  competitionId: text("competition_id")
    .notNull()
    .references(() => competition.id, { onDelete: "cascade" }),
  /** The organiser's version stamp, e.g. "v4.1". */
  version: text("version").notNull(),
  /** YYYY-MM-DD the organiser published it, when known. */
  publishedOn: text("published_on"),
  /** Where it was published, when known (a pasted PDF's URL). */
  sourceUrl: text("source_url"),
  /** Role per lower-cased header, reused for the next version (and for other competitions from the same source). */
  columnMapping: text("column_mapping", { mode: "json" }).$type<Record<string, string>>(),
  /** ISO instant the owner stored it. */
  storedAt: text("stored_at").notNull(),
  rawCopyId: text("raw_copy_id")
    .notNull()
    .references(() => rawCopy.id),
});

/**
 * A Session (GLOSSARY "Session"): a timed block of a competition's schedule
 * with one or more event rounds. Times are venue-local wall-clock times plus
 * the venue's IANA zone. Only Sessions with a round of an event with a
 * Belgian Entry are kept (spec #20, story 63).
 */
export const session = sqliteTable("session", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  competitionId: text("competition_id")
    .notNull()
    .references(() => competition.id, { onDelete: "cascade" }),
  timetableVersionId: text("timetable_version_id")
    .notNull()
    .references(() => timetableVersion.id),
  /** The organiser's code (LA28 "ATH02"); null when the timetable has no blocks. */
  code: text("code"),
  sport: text("sport").notNull(),
  /** YYYY-MM-DD, venue-local. */
  date: text("date").notNull(),
  /** "YYYY-MM-DDTHH:mm", venue-local; null when no time is published. */
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  /** IANA zone of the venue. */
  venueZone: text("venue_zone").notNull(),
});

/** An event round in a Session, in the order the timetable lists it. */
export const sessionRound = sqliteTable("session_round", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .notNull()
    .references(() => session.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  round: text("round").notNull(),
  position: integer("position").notNull(),
});

/**
 * An Entry's round attachment (spec #20, Data model; stories 56 and 58;
 * ticket #38): what the Live day pass learnt about an Entry in one round of
 * its event, keyed by the round's name so it outlives timetable versions.
 * The outcome moves later rounds on ("advanced") or drops them
 * ("eliminated"); the optional heat or match detail (any of it may be
 * missing) shows on the day view and, once given, means a start list names
 * the Entry in that round.
 */
export const entryRound = sqliteTable(
  "entry_round",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entryId: text("entry_id")
      .notNull()
      .references(() => entry.id, { onDelete: "cascade" }),
    /** The round as the timetable names it, e.g. "Semi-finals". */
    round: text("round").notNull(),
    /** "advanced" | "eliminated" (RoundOutcome); null while not known. */
    outcome: text("outcome"),
    /** Heat, race, group or table, as the start list names it. */
    heat: text("heat"),
    lane: text("lane"),
    /** The opponent in a match, e.g. "LI Wen (CHN)". */
    opponent: text("opponent"),
    /** Exact start, venue-local "HH:mm", when the start list gives one. */
    startsAt: text("starts_at"),
    /** ISO instant the owner last looked for heat or match detail (saved, or none published). */
    detailCheckedAt: text("detail_checked_at"),
    /** ISO instant of the owner's last change. */
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("entry_round_round").on(t.entryId, t.round)],
);

/**
 * The other nations' medal counts at a competition, as the owner last pasted
 * them from the official medal table (ticket #38). Belgium's own row is
 * never stored: it is counted from Belgian results (`belgiumMedals`).
 */
export const medalStanding = sqliteTable(
  "medal_standing",
  {
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    nation: text("nation").notNull(),
    gold: integer("gold").notNull(),
    silver: integer("silver").notNull(),
    bronze: integer("bronze").notNull(),
    /** ISO instant of the paste. */
    pastedAt: text("pasted_at").notNull(),
    rawCopyId: text("raw_copy_id")
      .notNull()
      .references(() => rawCopy.id),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.nation] })],
);

/**
 * The owner's curated facts behind the Active rule (GLOSSARY "Active",
 * "Hold"; spec #20, stories 20–23 and 114), at most one per kind per Entry
 * (an Athlete or a Team):
 * - "hold": keep Active until `date`, `note` the reason;
 * - "retirement" (Athlete) / "dissolution" (Team): inactive from `date`
 *   until a later performance;
 * - "nationality-change" (Athlete): inactive from `date` until the owner
 *   deletes the fact; `note` the new sporting nationality.
 * Every fact carries its source and the Belgian date it was last checked.
 */
export const activeFact = sqliteTable(
  "active_fact",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    athleteId: text("athlete_id").references(() => athlete.id),
    teamId: text("team_id").references(() => team.id),
    /** "hold" | "retirement" | "dissolution" | "nationality-change" (ActiveFactKind). */
    kind: text("kind").notNull(),
    /** YYYY-MM-DD: the Hold's keep-active-until date, or the day it happened. */
    date: text("date").notNull(),
    note: text("note"),
    /** Where the owner read it: a URL or a short description. */
    source: text("source").notNull(),
    /** Belgian date of the owner's last check. */
    checkedOn: text("checked_on").notNull(),
  },
  (t) => [uniqueIndex("active_fact_athlete").on(t.athleteId, t.kind), uniqueIndex("active_fact_team").on(t.teamId, t.kind)],
);

/**
 * One Qualification track of an Entry for its competition (GLOSSARY
 * "Qualification track", ticket #32): one route or requirement (an entry
 * standard, a ranking position, a quota place, a selection), what it needs,
 * what the Entry has so far, and whether it is met. `changedOn` moves only
 * when `needed`, `has` or `state` change, so the Qualification review (#33)
 * can list Entries whose track changed.
 */
export const qualificationTrack = sqliteTable("qualification_track", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryId: text("entry_id")
    .notNull()
    .references(() => entry.id, { onDelete: "cascade" }),
  /** Display order within the Entry. */
  position: integer("position").notNull(),
  /** e.g. "Entry standard", "World Ranking", "Quota place", "BOIC selection". */
  name: text("name").notNull(),
  /** What it needs, as written: "6 500 pts", "Top 24", "Criteria TBA". */
  needed: text("needed").notNull(),
  /** What the Entry has so far: "6 640 · Birmingham, Aug 2026", "#31". */
  has: text("has").notNull(),
  /** "met" | "not-met" | "pending" (TrackState). */
  state: text("state").notNull(),
  /** "higher" | "lower" (TrackBetter): which way the figures improve; null reads it from the text. */
  better: text("better"),
  /** Where it was read (a URL or a short description), when given. */
  source: text("source"),
  /** Belgian date of the last check, and of the last change to needed / has / state. */
  checkedOn: text("checked_on").notNull(),
  changedOn: text("changed_on").notNull(),
});

/**
 * One Quota place for Belgium in one event at one Olympic Games (GLOSSARY
 * "Quota place", ADR 0002, ticket #36): a separate fact from any Entry's
 * Qualification status. Championships have none. Numbered within its event
 * ("place 2 of 3") as recorded; a nation ranking that earns n places records
 * n rows.
 */
export const quotaPlace = sqliteTable("quota_place", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** The Games (a `games` competition, never a reference Games). */
  competitionId: text("competition_id")
    .notNull()
    .references(() => competition.id, { onDelete: "cascade" }),
  sport: text("sport").notNull(),
  /** Event as the qualification system names it, matching its Entries' `event`, e.g. "Men", "Men's double sculls". */
  event: text("event").notNull(),
  /** 1, 2, … within the competition's sport and event, in the order recorded. */
  number: integer("number").notNull(),
  /** "noc" (NOC-owned) | "named" (QuotaPlaceKind). */
  kind: text("kind").notNull(),
  /** "provisional" | "allocated" | "accepted" | "entered" | "declined" | "lost" (QuotaPlaceState), moved only by `quotaPlaceTransition`. */
  state: text("state").notNull(),
  /** Gained through reallocation (it started at Allocated). */
  reallocated: integer("reallocated", { mode: "boolean" }).notNull().default(false),
  /** How it was earned, as written: "FIH Pro League 2026–27", "UCI nation ranking". */
  earnedVia: text("earned_via"),
  /** The Entry it belongs to: a named place's from when it is earned, an NOC-owned place's from Selection; null until then. */
  entryId: text("entry_id").references(() => entry.id, { onDelete: "set null" }),
  /** Where it was read (a URL or a short description), and the Belgian date it was last checked. */
  source: text("source").notNull(),
  checkedOn: text("checked_on").notNull(),
});
