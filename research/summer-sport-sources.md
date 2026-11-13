# Data sources per summer sport (LA 2028)

Research for [#3 Data sources per summer sport](https://github.com/AnoukCeyssens/BelgianSportsHub/issues/3). Researched 2026-11-13.

## Summary

**The question:** for each LA28 sport, what is the primary source for results, calendar, entry lists and world rankings? How can it be accessed? Does it cover youth and junior events? Can it be filtered by BEL? How fresh is it, and what do the terms of use allow?

**The answer:**

- **The international federation (IF) is the primary source for all 36 sports.** Continental bodies (European Athletics, European Aquatics, EJU, UEC, CEV and so on) are only needed for European and European-youth championships. Usually those are mirrored on the IF platform anyway (judo, archery, rowing, triathlon, volleyball). The one third party worth noting is **swimrankings.net** for swimming. The aggregator question belongs to the sibling ticket.
- **3 sports have a documented, official API:**
  - Archery: World Archery API, public, no key.
  - Triathlon: World Triathlon API, free key after app registration.
  - Volleyball and beach volleyball: FIVB VIS web service, public XML.
- **About 9 more expose an undocumented JSON backend** behind their own website: aquatics, judo, rowing, golf (OWGR), athletics (GraphQL), cycling (UCI DataRide), climbing (results.info), fencing (server-side rendered page state) and table tennis. These are usable in practice but have no contract, so they can break without notice.
- **About 21 need HTML scraping.** This covers most team sports, the combat sports apart from judo, and the sports added by LA28.
- **No sport is truly PDF-only.** Gymnastics, boxing and taekwondo are **PDF-heavy**, meaning detailed results or rankings often exist only as PDFs, and canoe and modern pentathlon partly so.
- **Every sport meets the freshness need.** IF sites publish results the same day during Championships and Games, which covers the daily requirement. Rankings update weekly to monthly.
- **Youth and junior coverage is good on IF platforms** for individual sports. Junior and youth championships sit on the same database. For team sports, youth tournaments are on IF or continental sites but have thinner athlete-level data.
- **Terms of use are the real constraint.** Every IF whose terms I read forbids building a database or using scrapers without written permission: World Athletics, World Aquatics, World Triathlon and World Archery. Even World Archery's terms say "retrieval of data to compile a collection, database or directory is also prohibited", despite its public API. A private app for a small circle is low risk in practice, but it is not *permitted*. See the open questions at the end.

**Implication for the spec:** about 12 sports can be ingested automatically and cheaply (3 by contract, 9 by tolerance). The long tail of about 24 sports is better handled by *manual curation*, with a scraper only where Belgian volume justifies one. Belgium has few athletes in cricket, flag football, lacrosse, baseball/softball and squash, and only national teams in handball, rugby and similar sports.

## LA28 programme (confirmed)

36 sports, 51 disciplines, per [LA28's Olympic sports page](https://la28.org/en/games-plan/olympics.html), fetched 2026-11-13. Boxing was added by the IOC Session on 20 March 2025, with **World Boxing** as the responsible IF. Sources: [World Boxing](https://worldboxing.org/world-boxing-welcomes-decision-by-ioc-to-include-boxing-at-la28/) and [OCA](https://oca.asia/news/6061-boxing-to-be-part-of-la28.html). Breaking is not on the LA28 programme.

The five sports proposed by LA28 are baseball/softball, cricket, flag football, lacrosse and squash. They were approved in 2023, per the [IOC news release](https://www.olympics.com/ioc/news/la28-event-programme-marks-strong-commitment-towards-innovation-and-gender-equality). That page timed out when I fetched it, so the 36-sport count comes from LA28's own list. The IOC release puts the medal-event count at 353, while press reports say 351. This does not matter for this ticket.

Renames to note in the domain model:

| Old name | New name | Source |
|---|---|---|
| IFSC | **World Climbing** (Dec 2025); the World Cup is now the World Climbing Series | [worldclimbing.com](https://www.worldclimbing.com/ifsc) |
| ICF | **Paddle Worldwide** (official July 2026; canoeicf.com redirects to paddleworldwide.com) | [olympics.com](https://www.olympics.com/ioc/paddle-worldwide), HTTP redirect observed |
| European Canoe Association | **Paddle Europe** (paddle-europe.eu) | redirect observed |
| LEN | **European Aquatics** (europeanaquatics.org) | redirect observed |
| ITF (tennis) | itftennis.com redirects to **world.tennis** | redirect observed |
| WSF (squash) | **World Squash** (worldsquash.sport) | redirect observed |

## How to read the table

- **Access** is one of the following:
  - **API**: documented and officially offered.
  - **JSON\***: an undocumented JSON or XML backend that the IF's own site uses. It is reachable but has no contract.
  - **Scrape**: HTML only.
  - **PDF**: the key data is only in PDFs.
- **BEL filter** means the source can return Belgian athletes directly, either through an API parameter or a site filter. "UI" means a filter on the website only.
- **Youth** covers whether junior, U23 and youth championships are on the same source.
- **Freshness**: unless noted, results are posted on event days, which is enough for the daily requirement.
- **Terms**: "ToU read" means I read the terms of use myself. "Not checked" means I did not. Assume a standard "no database, no scraping without consent" clause for any terms I did not read.
- **Verified** means I probed the endpoint or page on 2026-11-13. "Knowledge" means the claim comes from prior knowledge and I could not confirm it this session. Treat those as leads, not facts.

## Per-sport table

| # | Sport (LA28 disciplines) | Primary source (IF) | European source | Access | BEL filter | Youth / junior | Terms | Verified? |
|---|---|---|---|---|---|---|---|---|
| 1 | **Aquatics** (swimming, diving, artistic swimming, open water, water polo) | World Aquatics, [worldaquatics.com](https://www.worldaquatics.com/) with backend `api.worldaquatics.com/fina/...` | European Aquatics ([europeanaquatics.org](https://europeanaquatics.org/)); third party **swimrankings.net** (Swiss Timing; covers national meets too) | JSON\* (rankings and results endpoints return JSON; there is a `countryId` parameter) | Yes (`countryId`) | Yes: World Junior Championships on the same site | [ToU read](https://www.worldaquatics.com/legal): §3B bans "data mining, robots or similar data gathering or extraction methods"; personal use only | Endpoint verified; swimrankings is knowledge |
| 2 | **Archery** | World Archery, [api.worldarchery.org](https://api.worldarchery.org/v3/API/) | World Archery Europe (archery.eu); results are on the WA API | **API** (public, no key; JSON; endpoints for athletes, competitions, matches, rankings, entries, schedule and live) | Yes: `ATHLETES/?Country=BEL` returned 698 BEL athletes | Yes: youth championships and categories are covered | [ToU read](https://www.worldarchery.sport/terms-and-conditions): non-commercial informational use allowed, but "retrieval of data to compile a collection, database or directory is also prohibited" | Verified |
| 3 | **Athletics** | World Athletics, [worldathletics.org](https://worldathletics.org/) (results, world rankings, athlete profiles, calendar) | European Athletics (european-athletics.com; returned 403 to a plain client) | JSON\* (the site runs on a GraphQL backend with a key embedded in the site) | Yes (UI and query) | Yes: U20 Worlds, and U18/U20/U23 Europeans on the European Athletics site | [ToU read](https://worldathletics.org/terms-and-conditions): §3.1.1 bans creating a database; §4.1 bans any robot, spider, crawler or scraper without written authorisation | ToU verified; GraphQL is knowledge |
| 4 | **Badminton** | BWF ([bwfbadminton.com](https://bwfbadminton.com/)); tournaments run on **tournamentsoftware.com** | Badminton Europe (also on tournamentsoftware) | Scrape (bot-protected: 403 to a plain client) | UI (player and country search on tournamentsoftware) | Yes: BWF World Juniors and European U15/U17/U19 are on tournamentsoftware | Not checked | Knowledge; 403 observed |
| 5 | **Baseball / Softball** | WBSC ([wbsc.org](https://www.wbsc.org/)) | WBSC Europe | Scrape (bot-protected: 403) | Team pages per nation | U12 to U23 World Cups are on WBSC | Not checked | Knowledge; 403 observed |
| 6 | **Basketball** (5x5, 3x3) | FIBA ([fiba.basketball](https://www.fiba.basketball/)); 3x3 player rankings on **play.fiba3x3.com** | FIBA Europe | JSON\* or scrape (both sites returned 403 to a plain client). 3x3 has *individual* player rankings filterable by federation, which is the most valuable Belgian data here. | UI | Yes: U16 to U20 Europeans and U17/U19 Worlds on FIBA | Not checked | Knowledge; 403 observed |
| 7 | **Boxing** | World Boxing ([worldboxing.org](https://worldboxing.org/)); rankings published after events, latest seen 3 Jul 2026 | European Boxing (EUBC, [eubcboxing.org](https://eubcboxing.org/)): results as daily PDFs | **PDF-heavy** / scrape (news posts with rankings, PDF result sheets) | No | Yes: U19 and U23 Europeans are on EUBC as PDFs | Not checked | [Rankings post](https://worldboxing.org/world-boxing-publishes-updated-rankings-following-world-boxing-cup-in-china/), [EUBC PDF example](https://eubcboxing.org/wp-content/uploads/2025/02/results-day-6.pdf) |
| 8 | **Canoe** (slalom, sprint) | Paddle Worldwide (formerly ICF): canoeicf.com redirects to [paddleworldwide.com/results](https://paddleworldwide.com/results), which links to canoeresults.eu | Paddle Europe | Scrape; partly PDF | UI (per event) | Yes: junior/U23 Worlds and Europeans | Not checked | Redirect verified; detail is knowledge |
| 9 | **Cricket** | ICC ([icc-cricket.com](https://www.icc-cricket.com/rankings)); Belgium is an associate member | ICC Europe | Scrape | Team pages (T20I) | Limited | Not checked | Page verified |
| 10 | **Cycling** (road, track, MTB, BMX racing, BMX freestyle) | UCI ([uci.org](https://www.uci.org/)); rankings and results are served by **dataride.uci.ch** iframes | UEC ([uec.ch](https://www.uec.ch/)); third party **ProCyclingStats** (road only, rich data) | JSON\* or scrape: DataRide iframes (Kendo grids with `/iframe/...` endpoints) | UI (nation filter in rankings) | Yes: junior and U23 categories in all disciplines | UCI terms page not readable via fetch | DataRide verified; endpoint detail not verified |
| 11 | **Equestrian** | FEI ([fei.org](https://www.fei.org/)), FEI Database (data.fei.org) | none needed | Scrape (403 to a plain client). The FEI **web-services API exists but is only for National Federations and organising committees** | UI (athlete and nation search) | Yes: young riders, juniors and ponies are in the FEI Database | Not checked | [FEI support](https://howto.fei.org/content/14/205/en/how-to-grant-access-to-nf-members-on-the-fei-database.html), [NF web services](https://inside.fei.org/node/7513168) |
| 12 | **Fencing** | FIE ([fie.org](https://fie.org/)): results, rankings and athlete database | European Fencing Confederation ([eurofencing.info](https://www.eurofencing.info/)) | JSON\* (Nuxt page with an embedded `window.__NUXT__` state); otherwise scrape | Yes (UI filter on nationality) | Yes: junior and cadet rankings and circuits on FIE | Footer says no reproduction or storage "in a retrieval system" without written approval | Nuxt verified |
| 13 | **Flag football** | IFAF ([americanfootball.sport](https://americanfootball.sport/)) | IFAF Europe | Scrape | Team pages | Limited | Not checked | Page verified |
| 14 | **Football** | FIFA ([inside.fifa.com](https://inside.fifa.com/fifa-world-ranking/men)), UEFA ([uefa.com](https://www.uefa.com/)) | UEFA | Scrape (both sites run on JSON backends, not checked) | Team pages | Yes: U17, U19 and U21 on UEFA and FIFA | Not checked | Pages verified |
| 15 | **Golf** | OWGR ([owgr.com](https://www.owgr.com/), JSON at `apiweb.owgr.com`); women: Rolex Rankings; amateur: WAGR ([wagr.com](https://www.wagr.com/)) | European Golf Association ([ega-golf.ch](https://www.ega-golf.ch/)) for amateur and junior championships | JSON\* (OWGR rankings endpoint returned JSON) | Yes (`countryId` parameter on OWGR) | Amateur and junior via WAGR and EGA | Not checked | OWGR verified |
| 16 | **Gymnastics** (artistic, rhythmic, trampoline) | FIG ([gymnastics.sport](https://www.gymnastics.sport/site/)): athlete database, calendar | European Gymnastics ([europeangymnastics.com](https://www.europeangymnastics.com/)) | **PDF-heavy**: detailed results are PDF books from the timing provider; FIG athlete pages are HTML | UI (athlete search by nation) | Yes: Junior Worlds and junior Europeans | Not checked | Page verified (huge page); detail is knowledge |
| 17 | **Handball** | IHF ([ihf.info](https://www.ihf.info/)) | EHF ([eurohandball.com](https://www.eurohandball.com/)): the richest source for Belgium | Scrape | Team pages | Yes: youth and junior EHF EUROs | EHF terms via iubenda, not read | Pages verified |
| 18 | **Hockey** | FIH ([fih.hockey](https://www.fih.hockey/)): Pro League, world rankings | EuroHockey ([eurohockey.org](https://www.eurohockey.org/)) | Scrape (FIH uses live-stats providers) | Team pages | Yes: Junior World Cup, EuroHockey U18/U21 | Not checked | Pages verified |
| 19 | **Judo** | IJF: [judobase.ijf.org](https://judobase.ijf.org/) with backend `data.ijf.org/api/get_json` | EJU ([eju.net](https://www.eju.net/)); EJU events are also in Judobase | JSON\* (`competition.get_list` returned JSON with no auth) | Yes (country filters in Judobase) | Yes: cadet and junior events (including EJU) are in the same list | IJF terms PDF not machine-readable | Endpoint verified |
| 20 | **Lacrosse** (sixes) | World Lacrosse ([worldlacrosse.sport](https://worldlacrosse.sport/)) | European Lacrosse ([europeanlacrosse.org](https://www.europeanlacrosse.org/)) | Scrape | Team pages | U20 Worlds | Not checked | Pages verified |
| 21 | **Modern pentathlon** | UIPM ([uipmworld.org](https://www.uipmworld.org/)): world rankings by category, athlete search, past events | European Modern Pentathlon Confederation (EMPC) | Scrape; partly PDF | UI (athlete search) | Yes: rankings from U11 up, plus junior and youth championships | Not checked | Page verified |
| 22 | **Rowing** (incl. coastal beach sprints) | World Rowing ([worldrowing.com](https://www.worldrowing.com/)) with backend `world-rowing-api.soticcloud.net/stats/api/...` | European Rowing; Europeans are on World Rowing | JSON\* (JSON:API-style; `person?filter[country.CountryCode]=BEL` returned Belgian rowers) | Yes | Yes: U19, U23, Europeans and coastal events | Not checked | Endpoint verified |
| 23 | **Rugby sevens** | World Rugby ([world.rugby](https://www.world.rugby/)), SVNS series | Rugby Europe ([rugbyeurope.eu](https://www.rugbyeurope.eu/)): Belgium plays the Europe Sevens series | Scrape | Team pages | U18/U20 on Rugby Europe | [Terms page](https://www.world.rugby/terms-and-conditions) exists, not read | Pages verified |
| 24 | **Sailing** | World Sailing ([sailing.org](https://www.sailing.org/)): Olympic class rankings about nine times a year | Class associations and event sites (Manage2Sail, etc.) | Scrape; results live on **per-event sites** | Rankings: UI | Yes: Youth Worlds; class junior events on class sites | Not checked | Ranking cadence via [Scuttlebutt](https://www.sailingscuttlebutt.com/2025/09/12/world-sailing-olympic-rankings-2/) (secondary source) |
| 25 | **Shooting** | ISSF ([issf-sports.org](https://www.issf-sports.org/)): athletes database, results, rankings | European Shooting Confederation ([esc-shooting.org](https://www.esc-shooting.org/)) | Scrape (plus PDF result books) | UI | Yes: junior Worlds and junior World Cups | Not checked | Page verified; filters not confirmed |
| 26 | **Skateboarding** | World Skate ([worldskate.org](https://www.worldskate.org/), [skateboarding.worldskate.org](https://www.skateboarding.worldskate.org/)) | World Skate Europe | Scrape and PDF | No | Limited | Not checked | Pages verified |
| 27 | **Sport climbing** | World Climbing (formerly IFSC): results at [ifsc.results.info](https://ifsc.results.info/) | World Climbing Europe | JSON\* (`/api/v1/...` returns 401 without a site session, so reuse needs session handling) | Yes (athlete nation) | Yes: youth Worlds and European youth | Not checked | 401 verified |
| 28 | **Squash** | PSA World Tour ([psasquashtour.com](https://www.psasquashtour.com/)) for pros; World Squash ([worldsquash.sport](https://www.worldsquash.sport/)) for championships | European Squash ([europeansquash.com](https://www.europeansquash.com/)) | Scrape | UI | World Juniors and European Juniors | Not checked | Pages verified |
| 29 | **Surfing** | ISA ([isasurf.org](https://isasurf.org/), 403 to a plain client) is the Olympic IF; the WSL is a third party | Eurosurf ([eurosurfing.org](https://www.eurosurfing.org/)) | Scrape | No | ISA World Junior Championships | Not checked | Pages verified |
| 30 | **Table tennis** | ITTF and WTT ([worldtabletennis.com](https://www.worldtabletennis.com/)); ITTF results database at [results.ittf.link](https://results.ittf.link/) | ETTU ([ettu.org](https://www.ettu.org/)) | JSON\* or scrape (the WTT site uses JSON services; results.ittf.link is HTML with filters) | UI (association filter) | Yes: WTT Youth series and youth rankings | Not checked | Pages verified; JSON is knowledge |
| 31 | **Taekwondo** | World Taekwondo ([worldtaekwondo.org](https://www.worldtaekwondo.org/)): rankings were historically PDF and now sit on the WT GMS platform; event results on SimplyCompete | European Taekwondo Union | **PDF-heavy** / scrape (SimplyCompete returned 403 to a plain client) | No (rankings are per weight class) | Yes: junior and cadet championships | Not checked | [WT notice board](https://www.worldtaekwondo.org/notice/list.html?mcd=F02); current format not verified |
| 32 | **Tennis** | ITF ([world.tennis](https://www.world.tennis/)) for juniors and the ITF World Tennis Tour, plus Davis/BJK Cup; ATP and WTA for pro rankings (third parties, but de facto primary) | Tennis Europe (juniors; old URL 404) | Scrape | UI (nation filter in rankings) | Yes: ITF juniors | Not checked | Redirect verified |
| 33 | **Triathlon** | World Triathlon, [developers.triathlon.org](https://developers.triathlon.org/) | Europe Triathlon; events are on the same platform | **API** (key via app registration at apps-api.triathlon.org; the `api.triathlon.org/v1` endpoint returns 401 without one) | Yes (country filter documented in the Statistics API) | Yes: junior, U23 and youth events | [ToU read](https://triathlon.org/terms-and-conditions): §5 bans "automated extraction of competition results or rankings" without written permission. Get that permission together with the API key. | Verified |
| 34 | **Volleyball** (indoor, beach) | FIVB **VIS web service** ([docs](https://www.fivb.org/VisSDK/VisWebService/)), public XML at `fivb.org/Vis2009/XmlRequest.asmx` | CEV ([cev.eu](https://www.cev.eu/)); CEV beach events also appear in VIS | **API** (`GetPlayerList` with `FederationCode="BEL"` returned 1,193 players, no auth) | Yes | Yes: U19 and U21 Worlds are in VIS | Not checked | Verified |
| 35 | **Weightlifting** | IWF ([iwf.sport](https://iwf.sport/results/results-by-events/), 403 to a plain client) | European Weightlifting Federation | Scrape (HTML results per event) | UI | Yes: youth and junior Worlds | Not checked | 403 observed |
| 36 | **Wrestling** | United World Wrestling ([uww.org/athletes-results](https://uww.org/athletes-results)) | UWW Europe | Scrape (site likely JSON-backed, not checked) | UI | Yes: U15, U17, U20 and U23 | Not checked | Page verified |

## Cross-cutting findings

- **Entry lists** are the weakest data type everywhere. The API and JSON\* sources have them (archery `Entries`, FIVB, triathlon start lists, judo draws, rowing). Elsewhere, entry lists appear as PDFs or start lists only a day or two before the event. Expect manual curation.
- **Calendars** are available from every IF site, but in structured form only from the API and JSON\* sources. A twice-yearly manual calendar import would be enough for the other sports.
- **Bot protection** stopped plain non-browser requests (HTTP 403) on BWF, ITTF rankings, FIBA, FIBA 3x3, WBSC, IWF, ISA, SimplyCompete, the FEI Database and European Athletics. Scraping these needs a headless browser, which works against the €10/month budget and the terms of use. These are good candidates for manual entry.
- **EYOF and YOG** results are not IF-owned (EOC and IOC). They are left to the aggregator ticket.
- **Continental bodies are needed** for European championships in handball (EHF), hockey (EuroHockey), rugby (Rugby Europe), boxing (EUBC) and athletics (European Athletics). In archery, judo, rowing, triathlon and volleyball the European events already appear in the IF data.

## Not verified / limits of this research

- Endpoints marked JSON\* are undocumented. I probed only a few without spoofing headers: aquatics, judo, rowing, OWGR, climbing (401) and the FIE page state. World Athletics GraphQL, the WTT JSON services and the UCI DataRide AJAX calls are from prior knowledge.
- I read the terms of use for only five IFs: World Athletics, World Aquatics, World Archery, World Triathlon and FIE (footer only). The IJF terms PDF could not be parsed. The UCI terms page does not render without a browser.
- **The repo has no `GLOSSARY.md`**, although map issue #1 refers to it. The terms used here (Belgian Athlete, Championship) follow issue #1's notes.

## Open questions surfaced

1. **Terms-of-use stance.** Do we accept "private, small-circle, non-commercial" as our risk position for undocumented endpoints? Or do we ask the IFs for written permission, starting with World Triathlon (needed anyway with the key), World Archery and World Athletics?
2. **Automation threshold per sport.** Where does curating by hand beat building a scraper? This depends on how many Belgian athletes each sport has, which the BOIC/Belgian NF rosters would tell us.
3. **Athlete identity across sources.** Each IF has its own athlete ID (WA ID, FIE licence, IJF ID, FEI ID, VIS No and so on). The domain model needs a cross-source identity for a Belgian Athlete.
4. **Fragility budget.** About 9 JSON\* integrations can break silently. We need monitoring or a "last successful fetch" indicator per source.
