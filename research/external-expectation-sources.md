# Sources of external Expectations

Research for issue #7. Researched 2026-11-13. This document informs a decision; it does not build anything.

Note: the brief pointed to `GLOSSARY.md` for the definition of *Expectation*, but no such file exists on `origin/main` (it holds only `README.md`). Here an **external Expectation** means a statement, made before an event by someone other than the user, about how a Belgian Athlete or team will place in that event.

## Summary

No single source gives per-athlete Belgian Expectations for every event. The sources fall into three layers, and v1 can be built from them with no paid feed:

1. **Rankings and seeds (every Championship and Games, per athlete per event, free, structured).** The most reliable and widely available signal. Use the athlete's **world-ranking position and/or seed in the entry list at the entry deadline** as the default external Expectation, for example "seeded 3rd". Each federation publishes its own list. World Athletics, for instance, updates its rankings every Wednesday. The sibling ranking-source tickets cover access per sport. Timing: rankings are always available; for the Games, entry lists firm up after the sport entries deadline, which was about 18 days before Paris 2024 opened.
2. **Gracenote Virtual Medal Table (Games only, per athlete per event in the model, a commercial feed).** Gracenote, part of Nielsen, is the only well-known statistical medal projection. It publishes country totals free in press releases. The athlete-level picks come through licensed "data feeds" for broadcasters and media, with no public price. For Belgium, **Sporza/VRT republished the per-athlete Belgian picks** at each update for Paris 2024: 1 year, about 9 months, 6 months, 100 days, 30 days and about 4 days before the Games. Practical route: manual entry from those articles, with attribution. Track record: Tokyo predicted 11 and Belgium won 7; Paris predicted 12 and Belgium won 10. **Not verified:** whether Gracenote published a VMT for Milano-Cortina 2026 at all. No release was found.
3. **Belgian targets (BOIC, Sport Vlaanderen, Adeps): delegation-level or framework-level, not per event.** BOIC states team ambitions in press and interviews, not as formal documents. Examples: "more than Tokyo's 7 medals, more top-8s" for Paris; "7 top-8s including 3 medals would be nice" for 2026. Sport Vlaanderen and Adeps set per-athlete objectives in their contracts and status criteria, but they do not publish them per athlete. These suit a **delegation-level Expectation** (target counts) plus an optional "named medal chance" flag taken from press, entered by hand.

Recommendation for the spec: model an external Expectation as `{source, scope (athlete-event | delegation), kind (rank/seed | projected medal | target count | named chance), value, as-of date}`. Ingest rankings and seeds automatically where the ranking sources allow. Enter the VMT picks and BOIC targets by hand, a handful per Games. Betting odds and fan forecasts are not worth a source slot in v1.

## Comparison

| Source | Availability | Granularity | Timing before event | Access | Cost / terms |
|---|---|---|---|---|---|
| Federation world rankings | All Olympic sports, continuously | Athlete × event | Always; weekly updates are typical (WA: Wednesdays) | Federation websites, some with JSON behind them (see the sibling tickets) | Free to view; terms per federation |
| Seeds in entry lists / draws | Every Championship and Games | Athlete × event | Entry lists: days to ~2 weeks before; draws: about 1–2 days before | Federation / organiser publications | Free to view |
| Entry-list projections (sorting the field by SB/PB/ranking) | Derivable for timed and measured sports | Athlete × event | Once entry lists are out | Computed by us from entry lists + rankings | Free; our own derivation |
| Gracenote Virtual Medal Table | Olympic Games only; no evidence for Worlds | Model: athlete × event; free releases: country totals | Paris 2024: from 1 year out, roughly quarterly, then monthly, final about 3 days before | Licensed feed (B2B); Belgian picks republished by Sporza/VRT | Commercial, price not public; Gracenote Terms of Use |
| Media "medal chances" lists (Sporza etc.) | Before major Games | Named athletes, sometimes events | About 1–3 weeks before | Articles; manual | Free to read; editorial |
| BOIC delegation ambition | Before each Games | Delegation (medals, top-8s) | Months to days before | Press conferences / interviews; manual | Free; informal |
| Sport Vlaanderen / Adeps objectives | Contract and status cycle | Per athlete, but not published | Annual / per Olympiad | Not public beyond press snippets | Not available |
| Betting odds | Patchy for Olympic sports | Athlete × event | Days before | Bookmakers; The Odds API lists no Olympics markets | Not recommended |
| Fan forecasts (Totallympics) | Games | Event-level picks | Months before | Forum threads | Unstructured; low trust |

## Per-source detail

### 1. World rankings and seedings

- **What it gives:** a per-athlete, per-event position that exists for nearly every Olympic event, and that federations use to qualify and seed athletes. It is the most objective external Expectation and the easiest to compare with an outcome, for example "ranked 5th, finished 3rd".
- **Example, athletics:** World Athletics rankings are per event ("single event rankings") and "are issued every Wednesday". https://worldathletics.org/world-rankings/introduction
- **Example, judo seeding:** at Paris 2024 the IJF's pre-draw previews list the projected seeds, the top 8 of the World Ranking List placed at the quarter-final positions. The IJF itself notes that "rarely are the seedings followed to the letter". https://www.ijf.org/news/show/what-the-draw-might-offer-on-day-one-48-kg-and-60-kg
- **Timing for the Games:** for Paris 2024, NOCs had to submit final sport entries by 23:59 on 8 July 2024 (https://inside.fei.org/node/8320463; IWF: https://iwf.sport/2024/06/21/confirmed-athletes-list-for-the-paris-2024-olympics-is-now-available/). The Games opened on 26 July. World Athletics published its entry lists on 12 July 2024 (https://worldathletics.org/news/press-releases/entry-lists-published-paris-2024-olympic-games). The lead time is therefore roughly 2 weeks. The LA28 and 2030 deadlines are not yet published (not verified).
- **Caveat:** ranking formats differ by sport: points tables, World Cup standings, FIS points, season-best lists. Some sports have no meaningful individual ranking, such as team sports outside FIH/FIVB-style lists. The sibling ticket on ranking sources owns the per-sport access details. This ticket's conclusion is only that the *rank or seed at the entry deadline* is the external Expectation to snapshot.

### 2. Entry-list based projections

- **What it gives:** in timed and measured sports (athletics, swimming, speed skating, rowing, cycling time trials and the like), sorting the entered field by season-best, personal-best or ranking gives a projected placing per athlete. This is a computation on the entry list plus results data, not a published source.
- **Assessment:** cheap and fully automatic once rankings and results are ingested. It is a good fallback where no ranking exists. It is our own derivation, so it should be labelled as such, for example "source: entry-list projection (SB)", rather than presented as an external authority.
- No third-party published entry-list projection with an open API was found.

### 3. Gracenote Virtual Medal Table (VMT)

- **What it is:** "a statistical model based on individual and team results in previous Olympics Games, World Championships and World Cups to forecast the most likely gold, silver and bronze medal winners by country." https://www.nielsen.com/news-center/2022/nielsen-gracenote-releases-final-virtual-medal-table-forecast/
- **Granularity:** the model works at athlete and event level. The 2022 release names projected winners, for example Eileen Gu with two golds, and lists Bart Swings (BEL) as top-ranked in the men's mass start (same URL). The free press releases publish **country totals** only. For Paris 2024 Belgium was projected at 4 gold, 2 silver and 6 bronze, 12 medals in all. https://www.nielsen.com/news-center/2024/virtual-medal-table-forecast/
- **Timing and cadence (Paris 2024):** a forecast exactly 100 days out (17 April 2024), "updated monthly" (https://gracenote.com/insights/virtual-medal-table-forecast/); a 30-days-out update with a final "around three days before the opening ceremony" (https://www.nielsen.com/news-center/2024/virtual-medal-table-forecast-30-days/). Sporza reported earlier updates: 1 year out on 25 July 2023 (https://sporza.be/nl/2023/07/25/hoeveel-medailles-haalt-belgie-in-parijs-exact-1-jaar-voor-spelen-voorspelt-databedrijf-recordoogst~1690298769333/), 2 November 2023 (https://sporza.be/nl/2023/11/02/het-geloof-van-statistiekenbureau-in-belgisch-medaillemandje-op-de-spelen-slinkt~1698920248695/), and 26 January 2024 (https://sporza.be/nl/2024/01/26/statistiekenbureau-dikt-de-belgische-medaillebuit-in-parijs-heel-licht-aan~1706264137879/). For Beijing 2022 Gracenote re-released at about 100 days out and gave a final two days before the Games (2022 URL above).
- **Access and terms:** delivered as "seamless data feeds that enable broadcasters, media publishers and pay TV operators" (30-days URL above). No public price, API documentation or licence for individuals was found, and the documentation host `sportsdemo1.gracenote.com` did not resolve. Treat it as an enterprise licence well outside a €10/month budget.
- **Belgian per-athlete picks, the practical route:** Sporza/VRT published a per-athlete, per-event table of Belgian projected medals at each update. Example: the final Paris forecast of 22 July 2024 lists 12 Belgian picks, among them Nafi Thiam (heptathlon, gold), the Red Lions (hockey, bronze) and Nina Derwael (uneven bars, bronze). https://sporza.be/nl/2024/07/22/de-laatste-voorspelling-voor-de-spelen-12-belgische-medailles-dankzij-de-terugkeer-van-een-oude-bekende~1721647221193/ (also https://www.vrt.be/vrtnws/nl/2024/07/22/laatste-prognose-gracenote-voor-de-olympische-spelen/). With about 12 rows per update, manual entry with "source: Gracenote via Sporza, date" is feasible. Whether keeping these picks in a private app is acceptable under Gracenote's or VRT's terms was **not verified**. A private, attributed record of a handful of picks seems low-risk, but that is a judgement, not a finding.
- **Track record for Belgium (Sporza):** Tokyo predicted 11 and Belgium won 7; Paris predicted 12 and Belgium won 10 (https://brusselstimes.com/1179785/paris-olympics-team-belgium-wins-ten-medals).
- **Milano-Cortina 2026: not verified.** Searches of nielsen.com, gracenote.com and Sporza found no 2026 VMT release. Aggregator pages leave the Gracenote column empty (https://www.topendsports.com/events/winter/medal-tally/predicted-2026.htm). Pre-Games Belgian coverage relied on editorial "medal chances" instead. Either the VMT was not published or it was not published openly. The spec should not assume a VMT exists for LA28 or the French Alps 2030.
- **Championships:** no evidence of a VMT for World or European Championships. Rankings and seeds are the only external Expectations there.

### 4. Media "medal chances" lists

- Before the Games, Sporza and similar outlets publish editorial lists of Belgian medal chances, with their reasoning. For example, three days before Milano-Cortina, Sporza named Swings, Hanne Desmet, Meylemans and Drion as the chances, with Stijn Desmet, Tas, Hendrickx/Pinzarrone and others as outsiders. https://sporza.be/nl/2026/02/03/welke-belg-skiet-schaatst-of-glijdt-het-olympisch-podium-op-onze-grootste-kansen-opgelijst~1770131182235/
- **Assessment:** useful as a "named medal chance" flag, entered by hand. It is editorial, with no projected placing.

### 5. BOIC (Belgian Olympic and Interfederal Committee / Team Belgium)

- **Form:** a delegation-level ambition stated in press or interviews. No formal published target document was found on teambelgium.be (not verified exhaustively). BOIC's stated mission is to increase the number of Belgians in the world top 8 at the Games (https://www.teambelgium.be/en/vision-mission).
- **Paris 2024:** CEO Cédric Van Branteghem aimed to beat Tokyo's 7 medals and to achieve more top-8 places. https://sporza.be/nl/2023/07/26/team-belgium-1-jaar-voor-parijs-2024-beter-doen-dan-7-medailles-in-tokio-met-in-beste-geval-173-atleten~1690353975744/ Outcome: 10 medals, 33 top-8 places (https://brusselstimes.com/1179785/paris-olympics-team-belgium-wins-ten-medals).
- **Milano-Cortina 2026:** BOIC sports director Olav Spahl said "Zeven top 8-plaatsen en daarin 3 medailles zou mooi zijn" (seven top-8 places, three of them medals, would be nice) and "realistisch om … te mikken op meer medailles" (realistic to aim for more medals). https://sporza.be/nl/2026/01/23/-het-is-realistisch-om-te-mikken-op-meer-medailles-dan-de-vorige-keer-belgie-trekt-met-gepaste-ambities-naar-winterspelen~1769179414273/ Outcome: 8 top-8s, 1 medal (https://www.lavenir.net/sports/2026/02/22/sentiment-mitige-pour-le-team-belgium-a-la-fin-des-jo-2026-meme-si-tous-les-indicateurs-sont-en-hausse-nous-avons-une-medaille-en-moins-6RW2B2FFWVHHZOD74APY6OC64I/).
- **Timing:** from about a year out to days before the Games. These are Games-only targets, with no evidence of formal BOIC targets for World Championships.
- **Fit:** a delegation-level Expectation (target medal count and top-8 count), entered by hand about twice per cycle.

### 6. Sport Vlaanderen

- Sport Vlaanderen evaluates contracted top athletes every year "op vooraf vastgelegde doelstellingen" (against objectives set in advance). In general terms these are top-8 places at the Olympics and Worlds in Olympic disciplines. Per-athlete objectives are not published, except in occasional press quotes such as "een plaats in de mondiale top 8" (a place in the world top 8) during the Olympiad for newly contracted athletes. https://sporza.be/nl/2026/10/15/jente-hauttekeete-elien-vekemans-en-lowie-nulens-krijgen-topsportcontract-bij-sport-vlaanderen~1792067682893/
- Individual support goes to athletes who show the potential for a top-8 place at the Games. https://sporza.be/nl/2023/07/24/hoe-stoomt-sport-vlaanderen-zijn-topsporters-klaar-voor-de-olympische-spelen-in-parijs~1690227187111/
- **Fit:** not usable as a per-event Expectation. At most, holding a contract or status could be an athlete attribute ("Sport Vlaanderen contract"), not an Expectation.

### 7. Adeps (Fédération Wallonie-Bruxelles)

- Adeps grants statuses (Espoir sportif, Sportif de haut niveau, Partenaire d'entraînement). Each federation sets its own criteria, which are often based on ranking or championship-placing thresholds. Example: https://lfph.be/wp-content/uploads/2026/07/Criteres-et-procedure-obtention-statut-sportif-ADEPS-Edition-06-2026.pdf. The minister publishes an annual list of athletes under Adeps contract, about 80 for 2026 (https://www.lavenir.net/regions/brabantwallon/2025/11/20/plusieurs-sportifs-brabancons-parmi-les-80-elus-sous-contrat-adeps-YXNA6JXIJ5FDHKK7XF5HLDRPBQ/).
- **Fit:** as with Sport Vlaanderen, this is an athlete attribute, not an event Expectation. No per-event Adeps targets were found.

### 8. Rejected or low value

- **Betting odds:** The Odds API lists no Olympic sports markets (https://the-odds-api.com/sports-odds-data/sports-apis.html). Bookmaker coverage of niche Olympic events is patchy, and scraping it raises terms issues.
- **Fan forecasts:** Totallympics forum threads give event-by-event picks and track Gracenote's totals, but they are unstructured and low-trust. https://totallympics.com/forums/topic/20500-summer-olympic-games-paris-2024-medal-predictions/page/12

## Not verified / open

- Whether Gracenote produced a VMT for Milano-Cortina 2026, and whether it will for LA28 and 2030.
- The licence terms for keeping republished Gracenote picks in a private app.
- The entry deadlines for LA28 and the French Alps 2030.
- Whether BOIC publishes a formal target document anywhere beyond the press.
