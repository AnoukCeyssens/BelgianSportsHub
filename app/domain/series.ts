// The recurring competition a competition row is an edition of (GLOSSARY
// "Participation": a Belgian Entry at the previous edition makes the next one
// likely). Adapters, the paste importer and the owner's forms set
// `competition.series` with this rule, or with a sharper one of their own
// where the source gives more (ISU's venue city, FIS's sector): a key stable
// from one edition to the next, prefixed by source. Years, seasons and edition
// numbers never belong in it; a Championship moves host, so its city does not
// either, while a circuit leg recurs by its city.
import { olympicCycleOf } from "./sports";

/** "championship" | "games" | "circuit", as competition rows store it. */
export type CompetitionKindName = "championship" | "games" | "circuit";

/** A name as a series key part: no accents, years, seasons or edition ordinals; lower-case words joined by hyphens. */
export function seriesSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:19|20)\d{2}(?:\s*[/-]\s*\d{2,4})?\b/g, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type SeriesInput = {
  /** The source key, the series' prefix. */
  source: string;
  name: string;
  kind: CompetitionKindName;
  sport: string;
  city?: string | null;
};

/**
 * The series of a competition: the Games are "olympic-games" or
 * "olympic-winter-games" (by the sport's cycle); a Championship is its name
 * without the host city; a circuit leg is its name, with the city added when
 * the name lacks it.
 */
export function seriesKey(input: SeriesInput): string {
  if (input.kind === "games") return olympicCycleOf(input.sport) === "winter" ? "olympic-winter-games" : "olympic-games";
  let key = seriesSlug(input.name);
  const city = input.city ? seriesSlug(input.city) : "";
  const hasCity = city !== "" && new RegExp(`(^|-)${city}(-|$)`).test(key);
  if (input.kind === "championship" && hasCity) key = key.replace(new RegExp(`(^|-)${city}(?=-|$)`), "").replace(/^-+|-+$/g, "");
  if (input.kind === "circuit" && city !== "" && !hasCity) key = `${key}:${city}`;
  return `${input.source}:${key}`;
}
