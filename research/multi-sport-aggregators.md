# Multi-sport data aggregators and APIs

Research for issue #2. Researched 2026-11-13. Vocabulary follows `GLOSSARY.md` (Athlete, International level, Championship, Olympic cycle, Expectation).

## Summary

**No multi-sport aggregator covers what BelgianSportsHub needs within €10/month.** No single source covers Championships (incl. junior/U23/youth), World Cups and EYOF across all Olympic sports, for every Belgian Athlete, with an API and terms that allow it.

- **Commercial feeds (Sportradar, Stats Perform/Opta, Gracenote, SportsDataIO) are out.** They are B2B and quote-only. Third-party estimates run from about €1,000 to over €10,000 a month. Sportradar's free trial is limited by its terms to "internal testing and evaluation" and stops after 30 days. Their Olympic coverage is also narrow: medal tables plus team and ball sports, and for the Winter Games only curling and ice hockey.
- **Olympics.com has no public API.** Its terms forbid automated systems that harm the service, and the site blocked automated access during this research. It is only usable for occasional manual checks during the Games.
- **Olympedia is the best reference for the Games and the YOG.** It has athlete-level results for every Olympic Games and every Youth Olympic Games, including Belgium's YOG pages. It has no API, publishes no reuse licence (only "© OlyMADMen") and asks crawlers for a 10-second crawl delay. It does not cover Championships, World Cups or EYOF.
- **Wikidata is the only free, openly licensed (CC0) structured source.** Its SPARQL API costs nothing. It works as an identity and cross-reference layer: about 7,540 people with "country for sport = Belgium", of whom 1,175 have an Olympedia ID and 738 an Olympics.com ID. It does not hold results, and coverage of junior athletes is patchy.
- **TheSportsDB ($9/month) is cheap but built around leagues and teams.** Its sport list has no swimming or judo, and no Olympic or Championship competitions appeared.

**Implication for the spec:** the backbone has to be **per-sport federation sources** (issues #3 and #4) plus manual curation. Wikidata supplies the identity cross-references and Olympedia the Games/YOG reference data (low volume, polite access). Commercial aggregators drop out on cost and licence alone.

## Per-source detail

| Source | Summer / winter | Youth & junior | Belgian coverage | Access | Freshness | Terms | Cost |
|---|---|---|---|---|---|---|---|
| **Olympics.com (IOC)** | Both, Games only (plus YOG pages) | YOG on site; no junior Championships | All Belgian Olympians at the Games | No public API. Scraping only; JSON paths such as `OG2024/data/` are reported by third-party projects (unverified) | Live during Games | ToS forbids automated systems ("robots", "spiders") that harm the service (search snippet; full text not verified) | Free, but no licence to reuse |
| **Olympic Data Feed (ODF)** | Both; Games, Winter Games and YOG | YOG | n/a (a message standard) | Documentation only; the feed itself goes to accredited partners | Live | Licence agreement on the documentation site | Not available to us |
| **Olympedia** | Both, all Games | All YOG editions 2010–2028 listed; Belgium YOG pages have athlete results | Every Belgian Olympian and YOG participant | HTML only, no API; robots.txt `Crawl-delay: 10` | Maintained (2026 Games present, recent deaths dated Nov 2026) | No reuse licence; "© OlyMADMen 2006–2026" | Free |
| **Wikidata** | Both, all sports | Patchy: some bulk-imported youth (e.g. Belgian U18 basketball, short-track) | ~7,540 items with P1532 = Belgium; 1,175 with Olympedia ID (P8286); 738 with Olympics.com ID (P5815); ~370 born 2006 or later | SPARQL endpoint, REST/Action API, dumps; free | Community-edited, lag varies | **CC0** | Free |
| **Sportradar** | Both, but Olympic coverage = Medals API + team/ball/racket sports; winter = curling & ice hockey only | Not mentioned | Only within those sports | REST, server-side only (B2B) | Real time | Trial "for internal testing and evaluation purposes only"; no commercial use or display | No public pricing; third-party estimates €1,300 to $10,000+/month |
| **Stats Perform (Opta)** | Mainly major team sports; Olympic ice hockey is the only Olympic event confirmed in its coverage list | Not found | Not verified | Enterprise feeds | Real time | Contract | Quote only |
| **Gracenote (Nielsen)** | Both; Virtual Medal Table built from Games, World Championships and World Cups | Not stated | Country-level medal forecasts | B2B feeds; VMT articles public | VMT updated monthly before a Games | Licence terms not published | Quote only |
| **SportsDataIO Olympics API** | 2026 Winter live; history 1896 to Tokyo 2020 | Not mentioned | Not verified | API, contact sales | Live during Games | Not checked | Quote only; free trial link |
| **TheSportsDB** | Some (athletics, cycling, gymnastics, skiing, skating); no swimming or judo listed | No | Not verified; league/team-centric | REST JSON | Community-edited | Can "scrape, copy and modify" API content; must credit as source | Free (limited queries, 30 req/min); $9/month (100 req/min) |

### Notes per source

**Olympics.com / IOC.** There is no documented public results API. A third-party marketplace listing states that no public developer API is offered. Community projects have pulled JSON from paths under `olympics.com/OG2024/data/`, but these URLs change per Games and are unofficial. The IOC's machine-readable standard is the [Olympic Data Feed](https://odf.olympictech.org); the feed itself goes to rights holders and media partners. The site's [Terms of Service](https://olympics.com/en/terms-of-service) prohibit launching automated systems such as "robots" or "spiders" that "detrimentally affect the Services". This could only be verified from a search snippet: olympics.com timed out or was blocked for automated fetches during this research, which itself shows that scraping it is fragile.

**Olympedia.** It is run by the OlyMADMen, a group of Olympic historians and statisticians, mostly ISOH members ([About](https://www.olympedia.org/static/about)). The [editions list](https://www.olympedia.org/editions) includes every summer and winter YOG through Dakar 2026 and Dolomiti Valtellina 2028. Country-per-edition pages carry athlete results, e.g. [Belgium at Innsbruck 2012 YOG](https://www.olympedia.org/countries/BEL/editions/66). There is no API and no stated licence ([FAQ](https://www.olympedia.org/static/faq)). [robots.txt](https://www.olympedia.org/robots.txt) only sets `Crawl-delay: 10`, which is compatible with a weekly polite crawl of a few hundred Belgian pages. Not verified: whether Dakar 2026 YOG results (the Games end today) are already loaded.

**Wikidata.** Structured data is [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing). Access is through the [SPARQL query service, APIs and dumps](https://www.wikidata.org/wiki/Wikidata:Data_access), with a required descriptive User-Agent and backoff on 429 responses. Counts above come from live SPARQL queries run on 2026-11-13 against `query.wikidata.org` (property P1532 "country for sport" = Q31 Belgium). The count includes footballers and non-Olympic sports, and broader queries timed out, so treat the numbers as indicative. Its value is as an ID crosswalk: Olympedia, Olympics.com, World Athletics (P1146), World Rowing (P2091) and other federation IDs.

**Sportradar.** It is a [B2B service](https://developer.sportradar.com/getting-started/docs/get-started), not for client-side calls. Trial defaults are 30 days, 1,000 requests per rolling 30 days and 1 QPS ([your account](https://developer.sportradar.com/getting-started/docs/your-account)). The [Terms and conditions](https://developer.sportradar.com/terms-and-conditions) §1.14 and §3.1–3.2 limit trials to internal evaluation, with no commercial use or display. The [Olympic Medals API](https://developer.sportradar.com/more-sports/reference/olympic-medals-overview) has three endpoints (seasons, countries, medal table). Olympic events otherwise appear only inside the badminton, basketball, curling, field hockey, golf, handball, ice hockey, rugby sevens, soccer, table tennis, tennis, volleyball and water polo APIs. There are no individual endurance or judged sports, and nothing junior-level. Pricing is unpublished; the figures quoted above are third-party estimates (e.g. [sportsapis.dev](https://sportsapis.dev/apis/sportradar)), not verified.

**Stats Perform / Opta.** No dedicated Olympic feed was found. The [additional sports page](https://www.statsperform.com/team-performance/additional-sports) lists men's and women's Olympic hockey. Coverage is set by client demand ([coverage and data rights](https://developers.statsperform.com/coverage-and-data-rights)). Enterprise pricing; not verified further.

**Gracenote.** The [Virtual Medal Table](https://www.gracenote.com/virtual-medal-table/) is a model built on results from Games, World Championships and World Cups. Gracenote clearly holds broad Olympic-sport results data, but sells it to broadcasters and publishers, with no published licence or price. Its public VMT articles could still serve as an external **Expectation** source (see issue #7).

**SportsDataIO.** The [Olympics API page](https://sportsdata.io/olympics-api) offers a live feed (2026 Winter) and history from 1896 to Tokyo 2020. Pricing is "Get in touch", so it is outside the budget in practice.

**TheSportsDB.** [Pricing](https://www.thesportsdb.com/pricing): free (most queries limited, 30 req/min), $9/month, or $20/month. Its [terms](https://www.thesportsdb.com/docs_terms_of_use.php) allow reuse of API content with credit. The [sport list](https://www.thesportsdb.com/sport/list) is league- and team-oriented; no Olympic or Championship competitions showed up. It does not fit individual Olympic sports.

## Not verified / open

- The full text of the Olympics.com terms (the site blocked automated fetches).
- Whether any free source carries **EYOF** results in structured form. EYOF is run by the European Olympic Committees; none of the aggregators above covers it.
- Actual Sportradar / Stats Perform / Gracenote prices. No official figures are published.
