// Team Belgium (BOIC) athlete profiles, the roster seed source
// (research/belgian-roster-seeding §1.1). The site has no API: profile URLs
// come from its sitemaps (robots.txt allows everything) and each profile page
// embeds its data as Next.js JSON. Only the ID (slug), name, date of birth,
// sports and results are read; bios, photos and the unreliable active/retired
// flags are ignored.
import type { Performance } from "~/domain";

export const TEAM_BELGIUM_SITEMAP_URL = "https://www.teambelgium.be/sitemap.xml";

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

/** Child sitemap URLs listed by the sitemap index. */
export function childSitemaps(indexXml: string): string[] {
  return locs(indexXml);
}

/** Dutch athlete profile URLs ("…/atleten/<Name>-<id>") in a sitemap; French duplicates and overview pages are skipped. */
export function athleteProfileUrls(sitemapXml: string): string[] {
  return locs(sitemapXml).filter((url) => /^https:\/\/www\.teambelgium\.be\/atleten\/[^/]+-\d+$/.test(url));
}

export type TeamBelgiumProfile = {
  /** The Team Belgium athlete ID, as used in profile URLs and by Wikidata (P10963). */
  slug: string;
  name: string;
  dateOfBirth: string | null;
  /** English names of the Olympic sports on the profile; non-Olympic sports are dropped. */
  olympicSports: string[];
  /** Results in those Olympic sports only. */
  results: (Performance & { date: string })[];
};

type RawAthlete = {
  slug: string;
  full_name: string;
  date_of_birth: string | null;
  sports: { id: string; slug: string }[];
  results: {
    date: string;
    rank: string | null;
    game: { title: string } | null;
    sportDiscipline: { sport: { id: string } | null } | null;
  }[];
};

export function parseProfile(html: string): TeamBelgiumProfile {
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
  if (!json) throw new Error("Team Belgium profile without __NEXT_DATA__");
  const queries: { queryKey: unknown[]; state: { data: { athlete?: RawAthlete } } }[] =
    JSON.parse(json).props.pageProps.dehydratedState.queries;
  const athlete = queries.find((q) => q.queryKey[0] === "athletes" && q.state.data.athlete)?.state.data.athlete;
  if (!athlete) throw new Error("Team Belgium profile without athlete data");
  const olympicSportById = new Map(
    athlete.sports.flatMap((s) => {
      const name = OLYMPIC_SPORTS[s.slug.replace(/-(nl|fr|en|de)$/, "")];
      return name ? [[s.id, name] as const] : [];
    }),
  );
  return {
    slug: athlete.slug,
    name: athlete.full_name.trim(),
    dateOfBirth: athlete.date_of_birth || null,
    olympicSports: [...new Set(olympicSportById.values())],
    results: athlete.results
      .filter((r) => olympicSportById.has(r.sportDiscipline?.sport?.id ?? ""))
      .map((r) => ({ date: r.date, competition: r.game?.title ?? "", place: r.rank ?? "" })),
  };
}

/**
 * Team Belgium sport slugs (Dutch) for sports on the LA 2028 or French Alps
 * 2030 programme, with their English names. Team Belgium also covers World
 * Games, Deaflympics and other non-Olympic sports; those are not listed.
 */
const OLYMPIC_SPORTS: Record<string, string> = {
  // Summer (LA 2028)
  Atletiek: "Athletics",
  Badminton: "Badminton",
  "Baseball---Softball": "Baseball/softball",
  Basketbal: "Basketball",
  "Basketbal-3x3": "3x3 basketball",
  Beachvolleybal: "Beach volleyball",
  Boksen: "Boxing",
  Cricket: "Cricket",
  Gewichtheffen: "Weightlifting",
  Golf: "Golf",
  Handbal: "Handball",
  Handboogschieten: "Archery",
  Hockey: "Hockey",
  Judo: "Judo",
  "Kanovaren-Slalom": "Canoe slalom",
  "Kanovaren-Sprint": "Canoe sprint",
  Kleischieten: "Shooting",
  "Lacrosse-Sixes": "Lacrosse",
  "Moderne-Vijfkamp": "Modern pentathlon",
  Openwaterzwemmen: "Marathon swimming",
  "Paardensport-min--Dressuur": "Equestrian dressage",
  "Paardensport-min--Eventing": "Equestrian eventing",
  "Paardensport-min--Springen": "Equestrian jumping",
  "Ritmische-Gymnastiek": "Rhythmic gymnastics",
  Roeien: "Rowing",
  "Rugby-Sevens": "Rugby sevens",
  Schermen: "Fencing",
  Schieten: "Shooting",
  Schoonspringen: "Diving",
  Skateboarden: "Skateboarding",
  Sportklimmen: "Sport climbing",
  Squash: "Squash",
  Synchroonzwemmen: "Artistic swimming",
  Taekwondo: "Taekwondo",
  Tafeltennis: "Table tennis",
  Tennis: "Tennis",
  Trampolinespringen: "Trampoline",
  Triatlon: "Triathlon",
  Turnen: "Artistic gymnastics",
  Vlagvoetbal: "Flag football",
  Voetbal: "Football",
  Volleybal: "Volleyball",
  Waterpolo: "Water polo",
  Baanwielrennen: "Cycling track",
  Wegwielrennen: "Cycling road",
  "Wielrennen-BMX-Freestyle": "Cycling BMX freestyle",
  "Wielrennen-BMX-Racen": "Cycling BMX racing",
  "Wielrennen-Mountainbiken": "Cycling mountain bike",
  Worstelen: "Wrestling",
  Zeilen: "Sailing",
  Zwemmen: "Swimming",
  // Winter (French Alps 2030)
  Alpineskien: "Alpine skiing",
  Biatlon: "Biathlon",
  Bobsleeen: "Bobsleigh",
  Curling: "Curling",
  Freestyleskien: "Freestyle skiing",
  IJshockey: "Ice hockey",
  Kunstschaatsen: "Figure skating",
  Langlaufen: "Cross-country skiing",
  "Noordse-combinatie": "Nordic combined",
  Rodelen: "Luge",
  Schansspringen: "Ski jumping",
  Shorttrack: "Short track speed skating",
  Skeleton: "Skeleton",
  "Ski-Mountaineering": "Ski mountaineering",
  Snelschaatsen: "Speed skating",
  Snowboarden: "Snowboard",
};
