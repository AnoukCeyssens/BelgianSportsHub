# Live Olympic qualification status sources per sport

Research for [#15](https://github.com/AnoukCeyssens/BelgianSportsHub/issues/15). Researched 2026-11-13. This builds on [#6](https://github.com/AnoukCeyssens/BelgianSportsHub/issues/6), which covers the qualification *systems*. This ticket covers where *live status* is published.

## Summary

**The question:** for each LA28 sport, where is live Olympic qualification status published? For each source: does it show NOC quota places or named athletes, can it be filtered by BEL, how is it accessed, how often is it updated, and what do its terms say? Which sports need status worked out by hand?

**The answer (36 LA28 sports):**

- **3 sports have an official live tracker today that shows Olympic standing per NOC or per athlete:**
  - **Judo:** the [IJF Olympic ranking for LA28](https://www.ijf.org/wrl_olympic). It shows named athletes with a "Qualified" label and has a country filter.
  - **Canoe (sprint and slalom):** [Paddle Worldwide's LA28 Qualification Rankings](https://rankings.canoeicf.com/). The event rankings are live and there is a [Belgium NOC page](https://rankings.canoeicf.com/noc/BEL). It is NOC and boat level, with no names.
  - **3x3 basketball:** the FIBA 3x3 NOC (Federation) Ranking. It sets the quota directly and is updated daily, according to #6.
- **4 sports have an official tracker that is announced or expected but not live yet.** Athletics: World Athletics' "Road to LA", from late 2027. Badminton: the LA28 Olympic Ranking, from May 2027. Beach volleyball: the Olympic Ranking, with points counting from 1 Nov 2026. Triathlon: the Olympic Qualification Ranking. Its window opened in May 2026, but I could not find it on the website.
- **12 sports publish an Olympic-relevant ranking but no status.** Status can be **computed mechanically**: rank cut-off plus per-NOC cap, read from the #6 system. The sports are golf, cycling, taekwondo, weightlifting, shooting, skateboarding, tennis, table tennis, modern pentathlon, fencing, sport climbing and squash. This is automatable once the ranking is ingested, but the rules engine is per sport.
- **17 sports qualify through events.** Status has to be **derived by hand** from event results and IF announcements: aquatics, archery, baseball/softball, boxing, cricket, equestrian, flag football, football, gymnastics, handball, hockey, lacrosse, rowing, rugby sevens, sailing, surfing and wrestling. Some of these also have a ranking pathway, such as archery's compound mixed team and wrestling's seeding, but the places that matter for Belgium come from events.
- **No official cross-sport tracker exists.** Olympics.com has none that I could find (it was unreachable from this environment), and neither does the BOIC. The only all-sport, per-NOC view is the community-run [Totallympics LA28 qualification tracker](https://totallympics.com/qualification-tracker/los-angeles-2028/), which has a [Belgium page](https://totallympics.com/qualification-tracker/los-angeles-2028/qualification-by-nation/belgium/qualification-tracker-r3258/). It is useful as a **cross-check for curation**, not as an ingest source. It is unofficial, its athlete lists look unreliable, and its robots.txt carries content-use reservations.
- **Belgium's status today** is small enough to curate by hand. Men's hockey qualified by winning the 2025-26 FIH Pro League (confirmed in an [FIH news item](https://fih.hockey/news/belgium-crowned-mens-pro-league-champions-secure-la28-olympic-ticket)). According to Totallympics (last updated 21 Aug 2026), Belgium also holds team places in equestrian jumping, dressage and eventing from the 2026 FEI World Championships in Aachen. **I could not verify the equestrian places against an FEI source.**

**Implication for the spec:** live status should be a **curated field**. Official trackers are inputs to it, not the source of truth. At most 3 sources can be polled usefully today (judo, canoe, 3x3), rising to about 7 by mid-2027. The weekly cadence works: the owner checks those trackers, applies the #6 rules to about 12 rankings the app already ingests (sibling ticket #3), and records event outcomes as they happen. Totallympics serves as a "did I miss something" check.

## How to read the table

- **Status shown:** what the source tells you.
  - **Quota (NOC):** places per NOC.
  - **Named:** an athlete is labelled qualified or provisionally qualified.
  - **Ranking only:** you apply the cut-off and caps yourself.
  - **Events:** status follows from results at named events.
- **BEL filter:** "Yes" means the page itself can show only Belgium.
- **Access:** the codes are the same as in the [#3 findings](https://github.com/AnoukCeyssens/BelgianSportsHub/blob/research/summer-sport-sources/research/summer-sport-sources.md).
  - **HTML:** scrape or read by hand.
  - **JSON\*:** an undocumented backend.
  - **API:** documented.
  - **PDF**.
  - **403** means a plain HTTP client was blocked.
- **Terms:** I read no new terms of use for this ticket. The #3 finding still applies: World Athletics, World Aquatics, World Archery and World Triathlon forbid database-building and scraping without written permission. Assume the same for every IF not listed there.
- **Verified:**
  - **V:** I loaded the page on 2026-11-13 and saw what is described.
  - **S:** the claim comes from an IF announcement, an IF document or a reputable secondary source found by search, but I did not see the page itself.
  - **K:** prior knowledge of the Paris 2024 cycle. Treat it as a lead.

## Per-sport table (LA 2028)

Tiers: **1** = live official tracker with status; **2** = official tracker announced or expected; **3** = ranking only, compute status; **4** = event-based, derive by hand.

| Sport | Tier | Where live status is published | Status shown | BEL filter | Access | Update frequency | Verified |
|---|---|---|---|---|---|---|---|
| **Judo** | 1 | [IJF Olympic ranking LA28](https://www.ijf.org/wrl_olympic): individual ranking with a "Qualified"/"Qualified\*"/"Host nation" column, plus a team section ("Team Invitation") | **Named** (labels not defined on the page; I could not tell direct from continental places) | Yes ("All countries" filter) | HTML; the Judobase backend `data.ijf.org/api/get_json` is JSON\* (#3) | After each ranking event (no date shown on the page) | V (page); continental-quota logic not shown |
| **Canoe sprint** | 1 | [Paddle Worldwide LA28 Qualification Rankings](https://rankings.canoeicf.com/): "OQR Live", 10 events, 90 NOCs. Quota view at [/road-to-la28](https://rankings.canoeicf.com/road-to-la28) says "No Quota Data Yet … Quota allocation will begin after ranking lists are locked" | Ranking per NOC and boat class now; **Quota (NOC)** later | **Yes**: [NOC page /noc/BEL](https://rankings.canoeicf.com/noc/BEL) (e.g. K2 Men #7, K2 Women #7, K4 Men #14) | HTML (Next.js; data embedded in the page) | "Provisional standings updated as PW-sanctioned competitions complete" | V |
| **Canoe slalom** | 1 | Same site: "OQR Live", 6 events | Same as sprint | Yes (same NOC page; K1 Men #32) | HTML | Per competition | V |
| **Basketball 3x3** | 1 | FIBA 3x3 Federation (NOC) Ranking at [fiba3x3.com](https://fiba3x3.com/en/rankings/federation.html); [Olympics hub](https://fiba3x3.com/en/olympics/intro.html). A 24-month window started 1 Dec 2025; cut-off 1 Dec 2027 ([FIBA](https://about.fiba.basketball/en/news/new-24-month-federation-ranking-for-3x3-basketball-begins-today)) | **Quota (NOC)** via rank per continent; the player is not named until the NOC enters | UI (per federation) | 403 to plain clients | Daily (per #6) | S (403 here) |
| Basketball 5x5 | 4 | FIBA: 2027 World Cup, then OQTs | Events | n/a | 403 | Per event | S (#6) |
| **Athletics** | 2 | World Athletics **Road to LA**, "the official qualification monitoring tool", to be published "in the latter part of 2027" ([WA, 10 Nov 2026](https://worldathletics.org/competitions/olympic-games/la28/news/article/qualification-system-la28-olympic-games)). [/stats-zone/road-to/la28](https://worldathletics.org/stats-zone/road-to/la28) has no LA28 content yet. Until then: entry standards plus the World Rankings | **Named** (by entry standard or by ranking; marathon "filtered" 3-per-NOC list) | Yes (UI; country filter on Road to Paris, K) | JSON\* (GraphQL, #3); ToU bans scraping | Weekly in the Paris cycle (K) | V (not live); S (date) |
| **Badminton** | 2 | BWF **LA28 Olympic Ranking**, window 3 May 2027 to 30 Apr 2028, initial qualifiers from the ranking of 2 May 2028 ([BWF](https://corporate.bwfbadminton.com/news-single/2025/12/15/ioc-approves-badminton-qualification-regulations-for-la-2028)). Paris had a "Race to Paris" ranking on bwfbadminton.com (K) | Named (athlete/pair) | UI | 403 to plain clients | Weekly, Tuesdays (K) | S |
| **Triathlon** | 2 | Individual and Mixed Relay **Olympic Qualification Ranking**, window from 18 May 2026, snapshot 18 May 2028 ([World Triathlon](https://triathlon.org/news/the-olympic-qualification-pathways-to-the-la28-start-line)). **Not listed** on [triathlon.org/world-rankings](https://triathlon.org/world-rankings), which shows only World, Para and Continental rankings | Ranking (named athletes; you apply the NOC cap of 2 or 3) | Probably via the API's country filter (#3) | API (key); ToU §5 bans automated extraction without permission | Unknown | V (absent from site); the API ranking list was not checked |
| **Beach volleyball** | 2 | FIVB **Olympic Ranking**: points from 1 Nov 2026, cut-off 29 Feb to 31 Mar 2028 (TBC). Continental and Worlds places are announced as news, e.g. [Netherlands qualify](https://www.fivb.com/netherlands-qualify-for-la28/). The [rankings page](https://www.fivb.com/beach-volleyball/rankings) shows no Olympic ranking yet | Quota (NOC) via ranking (pair named, but the place is the NOC's) | VIS API `FederationCode` (#3) | API (VIS XML) | Weekly (K) | V (not on site); S (rules) |
| Volleyball (indoor) | 4 | 2026 continentals, 2027 World Cup, then the FIVB ranking in Jun 2028 | Events, then ranking | VIS | API | Per event | S (#6) |
| **Golf** | 3 | IGF [Men's](https://igfgolf.org/olympic-golf-ranking/mens-olympic-golf-ranking) and Women's **Olympic Golf Ranking**. Women's points count from 8 Jun 2026 ([IGF](https://www.igfgolf.org/news/2026/06/09/olympic-golf-qualification-process-officially-underway-for-la28-olympic-games)) | Ranking only (no "projected qualifier" flag seen); apply top-15/max 4, otherwise max 2 per NOC | No filter on the page; OWGR JSON has `countryId` (#3) | HTML (table loads client-side); JSON\* via OWGR | **Weekly**: calculated Monday, posted Tuesday | V |
| **Cycling** (road, track, MTB, BMX) | 3 | UCI: Road World Ranking by **nations** (cut-off 19 Oct 2027); **Track Olympic Qualification Ranking**; **MTB Olympic Qualification Ranking** (30 May 2028); BMX nation ranking; all in DataRide ([UCI release](https://www.uci.org/pressrelease/los-angeles-2028-olympic-games-qualification-systems-and-quotas-for-cycling/43qivaAiGWBf621RhQBvDI)) | Ranking by nation → **Quota (NOC)** by rule (road 4/3/2/1) | UI (nation filter) | JSON\*/HTML (DataRide iframes) | Weekly in season (K) | S; the DataRide Olympic ranking pages were not opened |
| **Taekwondo** | 3 | WT **Olympic Ranking**, published monthly in PDF on worldtaekwondo.org. Top 5 per category in the **January 2028** ranking qualify. The points cycle reset in July 2026 ([WT](https://www.worldtaekwondo.org/wtnews/view.html?nid=142099)) | Ranking only → Quota (NOC) | No | PDF / HTML (400 to plain clients) | Monthly | S |
| **Weightlifting** | 3 | IWF **Olympic Qualification Ranking** (27 Jul 2026 to 7 May 2028; top 8 per category, 1 per NOC) on [iwf.sport](https://iwf.sport/) | Ranking; Totallympics also lists a "Provisional Qualification by NOC", source unclear | UI | 403 to plain clients | After each qualifier (K) | S |
| **Shooting** | 3 (+4) | ISSF: quota places won at Worlds, World Cups and continentals ([ISSF news](https://www.issf-sports.org/news/4880)), plus the **Olympic Ranking** of 1 May 2028. For Paris the ISSF kept a quota-places-by-NOC table (K) | Quota (NOC) from events; **Named** from Olympic Ranking places | UI (K) | HTML | Per event | S; no LA28 quota table URL found |
| **Skateboarding** | 3 | World Skate **World Skateboarding Ranking** (snapshot 11 Jun 2028), [ranking page](https://www.worldskate.org/skateboarding/ranking-wsr.html) | Ranking only → Named | No | HTML/PDF | Per event | S (link seen, page not opened) |
| **Tennis** | 3 | ATP/WTA rankings of 12 Jun 2028 (and combined doubles) per the [ITF system](https://www.itftennis.com/media/15928/tennis-la28-qualification-system.pdf); no tracker on [world.tennis/olympics](https://www.world.tennis/olympics) (empty page) | Ranking only → Named (top 4 per NOC) | UI | HTML | Weekly | S |
| **Table tennis** | 3 (+4) | ITTF/WTT world ranking (singles, 5 Jun 2028) plus team and mixed-doubles events | Ranking → Named; events → Quota (NOC) | UI | 403 (ittf.com); WTT JSON\* | Weekly (K) | S |
| **Modern pentathlon** | 3 | UIPM **Olympic Pentathlon World Ranking**. The live [Olympic Games ranking page](https://www.uipmworld.org/world-ranking/modern-pentathlon/men-senior-olympic-games-ranking-18) still shows Paris-cycle data (latest event Jun 2024) | Ranking only → Named | No (category/gender/age only) | HTML | Unknown for LA28 | V (stale) |
| **Fencing** | 3 | FIE team ranking (top 8 teams per event) and zonal individual ranking ("adjusted official ranking") | Ranking only → Quota (NOC) / Named | Yes (nationality) | JSON\* (Nuxt state, #3) | After each World Cup | S/K |
| **Sport climbing** | 3 (+4) | World Climbing world ranking plus **Olympic Q-Series 2028** ranking (`/olympics/2028-q-series`); the [LA28 event page](https://www.worldclimbing.com/events/olympic-games-la28) has no tracker | Ranking + events → Named | Yes (nation) | JSON\* (401 without a session) | Per event | V (no tracker) |
| **Squash** | 3 | PSA World Rankings (top 50 required) | Ranking only → Named | UI | HTML | Monthly (K) | S |
| **Aquatics** (swimming, open water, diving, artistic, water polo) | 4 | Swimming: A/B **entry standards**. No live list; the "invited B" list appears only after the entry deadline (K). Open water: 2027 Worlds plus a world ranking. Diving and water polo: events | Named (swimming A times; you check the times yourself) | `countryId` (#3) | JSON\* | n/a | S/K |
| **Archery** | 4 | Events (Worlds, continentals, final qualifier) plus the compound mixed-team ranking. For Paris, World Archery published a [quota tracker PDF](https://extranet.worldarchery.sport/documents/index.php/Events/Olympic_Games/2024_Paris/Paris_2024_Olympic_Games_Archery_Quota_Tracker.pdf); expect the same for LA28 | Quota (NOC) | PDF lists all NOCs | **PDF**; API for results | Per event | S (Paris PDF link); LA28 PDF not found |
| **Boxing** | 4 | World Boxing qualification tournaments (1 Apr 2027 to 31 May 2028); results as news and PDFs | **Named** | No | 403 / PDF | Per event | S (#6) |
| **Equestrian** | 4 | FEI: team places from 2026 Worlds (Aachen) and 2027 Europeans; **FEI Olympic Rankings** for individuals | Quota (NOC) | UI | 403 | Per event, plus monthly ranking (K) | S; no FEI page reachable |
| **Gymnastics** (artistic, rhythmic, trampoline) | 4 | FIG: Worlds 2026/2027, apparatus World Cup series rankings, continentals. The [FIG Olympic page](https://www.gymnastics.sport/site/events/olympic-games.php) returned "Page Not Found" | Mixed: Quota (NOC) and Named | No | HTML/PDF | Per event | V (404) |
| **Hockey** | 4 | FIH: Pro League winners, continentals, Olympic qualifiers. Belgium men qualified via the 2025-26 Pro League ([FIH](https://fih.hockey/news/belgium-crowned-mens-pro-league-champions-secure-la28-olympic-ticket)) | Quota (NOC) | n/a | HTML | Per event | S |
| **Rowing** | 4 | World Rowing: 2027 Worlds boat places, continental regattas, Final Qualification Regatta | Quota (NOC), per boat | Yes (#3 JSON) | JSON\* | Per event | S (#6) |
| **Sailing** | 4 | World Sailing: 2027 class Worlds, continentals, Last Chance Regatta. The [LA28 page](https://www.sailing.org/olympics/la28/) has no quota table | Quota (NOC) | No | HTML | Per event | V (no tracker) |
| **Wrestling** | 4 | UWW: 2027 Worlds, continental qualifiers, World Qualifier. The [Olympics page](https://uww.org/olympics) has no tracker | Quota (NOC) | UI | HTML | Per event | V (no tracker) |
| **Surfing** | 4 | ISA World Games / continentals plus WSL CT ranking | Mixed | No | 403 | Per event | S (#6) |
| Team sports: handball, rugby sevens, football, baseball/softball, cricket, flag football, lacrosse | 4 | Each IF's qualification events (see #6) | Quota (NOC) | n/a | HTML | Per event | S (#6) |

### Cross-sport sources

| Source | What it shows | Use for us | Verified |
|---|---|---|---|
| [Totallympics LA28 tracker](https://totallympics.com/qualification-tracker/los-angeles-2028/), with pages [by sport](https://totallympics.com/qualification-tracker/los-angeles-2028/qualification-by-sport/), [by NOC](https://totallympics.com/qualification-tracker/los-angeles-2028/qualification-by-nation/) (about 208 NOCs) and [qualification rankings](https://totallympics.com/qualification-tracker/los-angeles-2028/qualification-rankings/) (mirrors of about 36 IF rankings) | Quota places per event and NOC, the route used, and sometimes names. The [Belgium page](https://totallympics.com/qualification-tracker/los-angeles-2028/qualification-by-nation/belgium/qualification-tracker-r3258/) showed 25 athletes, from equestrian (3 team places) and men's hockey, last updated 21 Aug 2026 | Weekly **manual cross-check** only. The site is community-maintained (an Invision forum), its rosters look stale (23 hockey names for a quota of 16), its robots.txt declares EU DSM Art. 4 content-signal reservations, and its terms were not read | V |
| Wikipedia "X at the 2028 Summer Olympics – Qualification" pages | Per-sport quota tables | Tertiary cross-check | S |
| Olympics.com / IOC | No LA28 tracker found. The site timed out from this environment, as it did in #6 | none | Not verified |
| BOIC / teambelgium.be | No qualification list found. Only selection news at selection time | Selection layer (#6) | S |

## French Alps 2030: Milano-Cortina 2026 as precedent

The 2030 systems are not published (#6), so this only shows how winter IFs published status last cycle.

| IF | MiCo 2026 status publication | Source |
|---|---|---|
| FIS (alpine, cross-country, jumping, freestyle, snowboard, NC) | Provisional quota calculations during the season, then a final **Olympic Quota Allocation List on 19 Jan 2026** in the FIS database (`/DB/v2/quota/list/owg/<disc>/2026`) and the OWG 2026 document library. Unused places were reallocated 21–22 Jan. The database URL now returns **404**, so the lists disappear after the Games | [Olympics.com alpine guide](https://olympics.com/en/news/alpine-skiing-how-to-qualify-milano-cortina-2026-winter-olympic-games) (S); 404 observed |
| IBU (biathlon) | Nations Cup ranking sets quota size. Allocation was announced in a **press release** on 18 Jan 2026 ("all 210 Olympic quota places have been awarded to NOCs"), with the list attached | [IBU](https://www.biathlonworld.com/news/olympic-games-biathlon-qualification-milano-cortina-2026/SGxoAWSfNByUtGeaxZfHm) (V) |
| ISU (speed skating, short track) | **SOQC** lists published on fixed dates (speed: 19 Dec 2025; short track allocation 10 Dec 2025, final 26 Jan 2026) | [Olympics.com](https://olympics.com/en/news/speed-skating-how-to-qualify-olympic-winter-games-milano-cortina-2026), Wikipedia (S) |
| IBSF, FIL, WCF, IIHF, ISMF | Not researched | n/a |

The pattern: winter quotas are NOC-owned, and status appears as **provisional lists during the season plus one final list on a fixed date in January** of the Games year. There is no continuously live tracker. Belgian example: biathlon relay places were reported by [Sporza](https://sporza.be/nl/2025/03/25/belgische-biatleten-mogen-met-3-estafetteteams-naar-winterspelen-2026-in-milaan-en-cortina~1742902048103/) almost a year before the Games, from the Nations Cup ranking.

## Not verified / limits

- **Not opened:** FIBA 3x3, BWF, IWF, ITTF, FEI, ISA and World Boxing all blocked plain clients with HTTP 403. The descriptions for these come from IF announcements, #6, or knowledge of the Paris cycle.
- **IJF labels:** I could not tell whether IJF's "Qualified" label also covers continental-quota places.
- **Gaps in the LA28 trackers:** I found no LA28 Olympic ranking on the UIPM, triathlon or beach volleyball sites, no ISSF quota table, and no World Archery quota-tracker PDF. They may be published under URLs I did not find, or not yet.
- **Equestrian:** Belgium's equestrian team places come from Totallympics only.
- **Terms of use:** none were re-read for the tracker pages. The canoe rankings site and the IJF have no terms checked at all.

## Open questions surfaced

1. **Status as a curated field vs. computed.** Do we build per-sport rule engines for the 12 ranking-only sports (cut-off, per-NOC caps, continental places)? Or does the owner set status by hand each week, with the rankings shown alongside? This is the main spec decision this ticket feeds.
2. **Totallympics as a curation aid.** Do we accept linking to it, or reading it by hand, as the "missed something" check? Scraping it is not advisable.
3. **Labels for provisional status.** Trackers show "provisionally in on today's ranking" long before anything is final. The status model from #6 needs a clear provisional state and a "last checked on" date per sport.
4. **Equestrian verification.** Confirm Belgium's Aachen 2026 team places through the FEI or the Belgian federation, which is a curation task rather than a ticket.
