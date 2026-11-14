// Wikidata crosswalk for the roster seed (research/belgian-roster-seeding §3):
// every item with a Team Belgium athlete ID (P10963), with its Olympedia
// (P8286) and World Athletics (P1146) IDs where Wikidata has them. One public
// SPARQL query per seed run. Community-edited, so these IDs are hints that the
// owner can correct.
import type { ExternalId } from "~/domain";

const QUERY = `SELECT ?item ?teamBelgium ?olympedia ?worldAthletics WHERE {
  ?item wdt:P10963 ?teamBelgium .
  OPTIONAL { ?item wdt:P8286 ?olympedia }
  OPTIONAL { ?item wdt:P1146 ?worldAthletics }
}`;

export const WIKIDATA_CROSSWALK_URL = `https://query.wikidata.org/sparql?${new URLSearchParams({ format: "json", query: QUERY })}`;

type Binding = Record<string, { value: string } | undefined>;

/** Team Belgium slug → the external IDs Wikidata knows for that person. */
export function parseCrosswalk(json: string): Map<string, ExternalId[]> {
  const bindings: Binding[] = JSON.parse(json).results.bindings;
  const crosswalk = new Map<string, ExternalId[]>();
  for (const b of bindings) {
    const slug = b.teamBelgium?.value;
    const qid = b.item?.value.split("/").pop();
    if (!slug || !qid) continue;
    const ids = crosswalk.get(slug) ?? [];
    const add = (scheme: string, value: string | undefined) => {
      if (value && !ids.some((x) => x.scheme === scheme && x.value === value)) ids.push({ scheme, value });
    };
    add("wikidata", qid);
    add("olympedia", b.olympedia?.value);
    add("world-athletics", b.worldAthletics?.value);
    crosswalk.set(slug, ids);
  }
  return crosswalk;
}
