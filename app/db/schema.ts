// D1 schema (Drizzle). After changing this file run `npm run db:generate` to
// write the next migration into db/migrations; never edit applied migrations.
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
