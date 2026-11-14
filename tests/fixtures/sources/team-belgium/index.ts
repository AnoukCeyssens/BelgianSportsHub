// The recorded Team Belgium seed run: sitemap index, the three child sitemaps
// (trimmed to five athlete profiles), those five profile pages, and the
// Wikidata crosswalk query. Ready for stubOutboundFetch().
import type { RecordedResponse } from "../../../support/outbound-fetch";
import sitemap from "./sitemap.xml?raw";
import sitemapMeta from "./sitemap.xml.meta.json";
import sitemap0 from "./sitemap-0.xml?raw";
import sitemap0Meta from "./sitemap-0.xml.meta.json";
import sitemap1 from "./sitemap-1.xml?raw";
import sitemap1Meta from "./sitemap-1.xml.meta.json";
import sitemap2 from "./sitemap-2.xml?raw";
import sitemap2Meta from "./sitemap-2.xml.meta.json";
import thiam from "./Nafissatou-Thiam-347.html?raw";
import thiamMeta from "./Nafissatou-Thiam-347.html.meta.json";
import nafy from "./Nafy-Thiam-836.html?raw";
import nafyMeta from "./Nafy-Thiam-836.html.meta.json";
import desmet from "./Hanne-Desmet-353.html?raw";
import desmetMeta from "./Hanne-Desmet-353.html.meta.json";
import vanhoutte from "./Fran-Vanhoutte-147.html?raw";
import vanhoutteMeta from "./Fran-Vanhoutte-147.html.meta.json";
import lieze from "./Lieze-Desmet-951.html?raw";
import liezeMeta from "./Lieze-Desmet-951.html.meta.json";
import crosswalk from "../wikidata/team-belgium-crosswalk.json?raw";
import crosswalkMeta from "../wikidata/team-belgium-crosswalk.json.meta.json";

export const teamBelgiumSeedRun: RecordedResponse[] = [
  { ...sitemapMeta, body: sitemap },
  { ...sitemap0Meta, body: sitemap0 },
  { ...sitemap1Meta, body: sitemap1 },
  { ...sitemap2Meta, body: sitemap2 },
  { ...thiamMeta, body: thiam },
  { ...nafyMeta, body: nafy },
  { ...desmetMeta, body: desmet },
  { ...vanhoutteMeta, body: vanhoutte },
  { ...liezeMeta, body: lieze },
  { ...crosswalkMeta, body: crosswalk },
];
