# Seeding the Belgian athlete roster

Research for [#5](https://github.com/AnoukCeyssens/BelgianSportsHub/issues/5). Checked 2026-11-13. Vocabulary follows `GLOSSARY.md` (Athlete, International level).

## Summary

**No single Belgian source lists every Athlete. The roster should be derived from results rather than seeded from a status list.**

- **Belgian status and contract lists are partial and mostly not structured.** Sport Vlaanderen publishes press releases naming its contract holders (75 for 2026) but no named list of its roughly 2,000-strong topsport population. Adeps publishes an HTML list of 80 "Adeps Pro" contract holders, but its status page (SHN, espoir, jeune talent, ...) names no one. Both lists are about funding and are split by Community. They make useful hints but do not define who is an Athlete.
- **Team Belgium (BOIC) is the best Belgian seed.** teambelgium.be has about 927 athlete profiles. They are listed in its sitemap, and each one carries structured JSON with a stable ID, date of birth, sport and results, including youth events such as YOG Dakar 2026. It covers Olympians and Games/YOG/EYOF delegations, not every junior who went to a Championship. Its active/retired flags are unreliable.
- **IF databases are the authority on sporting nationality.** The Glossary defines sporting nationality as the nation an athlete represents in their IF's system, so each IF athlete database filtered by BEL is the source of truth for whether someone is BEL in a given sport. These databases are complete but over-inclusive: FIS alone lists 561 BEL alpine competitor records, most of them below International level. Whether a database is structured varies by IF; sibling tickets #3 and #4 cover that sport by sport.
- **The recommended mechanism:** an Athlete is created when a BEL entrant appears in the results of an International-level event that we ingest. Seed once from Team Belgium (plus Wikidata for crosswalk IDs), then let weekly and daily results ingest add new Athletes. Use the Flemish and Adeps lists only as manual cross-checks.
- **Linking identities:** there is no public cross-sport Belgian athlete ID. Use an internal Athlete ID with a table of external IDs: the IF ID (FIS code, World Athletics ID, the 11-digit UCI ID, ...) as the per-sport key, plus the Team Belgium ID, Olympedia ID and Wikidata QID. Match on IF ID first and on normalised name + date of birth second, with a manual merge queue for anything ambiguous.

## 1. Belgian sources

### 1.1 BOIC / Team Belgium

- **Structure.** BOIC has 86 member federations. Category 1 members are the national federations affiliated to Olympic IFs, and "only one federation per sporting discipline may be admitted as an effective member". Community-level leagues stay autonomous but are grouped into a single national federation per sport, and only that national federation has international jurisdiction. Source: <https://www.teambelgium.be/en/about-boic/members>.
- **Athlete profiles.** `https://www.teambelgium.be/atleten/<Name>-<id>` (nl), `/fr/athletes/...`, `/en/athletes/...`. Overview: <https://www.teambelgium.be/atleten/alle-atleten>.
  - The sitemap index <https://www.teambelgium.be/sitemap.xml>, with sitemap-0 to sitemap-2, held 927 distinct athlete IDs on 2026-11-13; the highest ID was 998. robots.txt allows everything.
  - The site is Next.js. Each profile page embeds `__NEXT_DATA__` JSON with `id`, `remote_id`, `full_name`, `slug`, `date_of_birth`, `sports[]`, `is_olympic_athlete`, `is_active`, `is_retired`, social links, an image URL and `results[]`. Each result has date, rank, result, medal, the `game` (e.g. "Jeugd Olympische Zomerspelen Dakar 2026") and the discipline. Verified on <https://www.teambelgium.be/atleten/Daan-Wilmsen-996>.
  - **Data quality caveat:** that same record, a 17-year-old who won YOG gold two days earlier, has `is_active: false, is_retired: true`, and its image credit is "Dummy". Do not trust the status flags.
  - No public JSON API was found. Plain paths under `content-api.teambelgium.be` return 404; only `/_media/` is used. Scraping the page JSON works but is undocumented and could break.
- **Coverage:** Olympians plus the athletes Team Belgium sends to the Games, YOG and EYOF (delegations: 165 at Paris 2024 and 30 at Milano-Cortina 2026, per Belga: <https://www.belganewsagency.eu/belgium-sends-165-athletes-to-paris-olympics-largest-delegation-since-1928>, <https://www.belganewsagency.eu/belgium-heads-to-winter-olympics-with-record-delegation-of-30-athletes>). It does **not** cover juniors and U23s who only compete at Championships or World Cups. **Not verified:** whether every EYOF participant gets a profile.
- **Wikidata link:** property P10963 "Team Belgium athlete ID", formatter `https://www.teambelgium.be/atleten/$1`, is used on 514 items. That is about half of the site.

### 1.2 Sport Vlaanderen (Flemish Community)

- **Topsport population:** Statistiek Vlaanderen reports 373 elite athletes and 1,644 "beloftevolle jongeren" for 2025, 2,017 in total. It gives aggregate counts only, no names, and the counts include non-Olympic sports such as football. Source: <https://www.vlaanderen.be/statistiek-vlaanderen/sport/aantal-topsporters>.
- **Contracts:** 75 topsporters have a full-time or half-time contract for 2026 (<https://www.sport.vlaanderen/nieuws/75-topsporters-hebben-een-vlaams-topsportcontract-beet-voor-2026/>), and winter-sport contracts are announced separately (<https://www.sport.vlaanderen/nieuws/8-wintersporters-behouden-hun-vlaams-topsportcontract-en-2-federaties-worden-ondersteund/>). About 300 more athletes are supported through performance programmes or a monthly allowance (<https://www.sport.vlaanderen/nl/topsporters/hoe-ondersteunen-we-topsporters/individuele-ondersteuning/>). Those ~300 are not named.
- **Athlete directory:** <https://www.sport.vlaanderen/topsporters/wie-zijn-onze-topsporters/> showed "Geen fiches gevonden" (no profiles) on 2026-11-13.
- **Verdict:** names appear only in press releases, for contract holders, about once a year. This source is not structured and not complete.

### 1.3 Adeps / Fédération Wallonie-Bruxelles (French Community)

- **Statuses** are granted by the minister on the federation's proposal: sportif de haut niveau, espoir sportif, jeune talent, partenaire d'entraînement, reconversion, arbitre. The status page names nobody: <https://www.sport-adeps.be/index.php?id=5923>. The status criteria are set per federation. Example for athletics (LBFA): <https://lbfa.be/uploads/pdf/2024/Crit%C3%A8res%20statuts%20ADEPS%20-%20LBFA%20111024.pdf>.
- **Adeps Pro contracts:** a named HTML list of 80 athletes for 2026, grouped by contract type (SHN / ACS / APE) and sport: <https://www.sport-adeps.be/ladeps-vous-accompagne/adeps-pro/sportifs-sous-contrat/>.
- **Verdict:** this is an HTML list of funded athletes only. It is semi-structured (scrapeable), small and annual.

### 1.4 German-speaking Community

Not researched. The community is small, and its athletes still appear through national federations and IFs.

### 1.5 Federation structure and its effect on the roster

- In most sports a national umbrella body holds IF membership and makes international selections, while the Community leagues hold licences and propose regional statuses (BOIC members page, above).
- **Athletics example:** Belgian Athletics is the umbrella over Atletiek Vlaanderen (formerly VAL) and LBFA. It runs the national championships and international delegations, and the leagues run everything else (statutes: <https://lbfa.be/uploads/pdf/2024/BA-statuts%20MB%202024.pdf>; Atletiek Vlaanderen policy plans on <https://www.atletiek.be>).
- **Effect:** national selection announcements, made per Championship on the national federation's site, are the most precise "who represents BEL at International level" signal. They are press releases, however, so they are not structured. Regional federation member databases hold licence numbers but are not public. **Not verified:** whether any federation publishes a machine-readable selection list.

## 2. International-federation databases

- **Sporting nationality is decided by the IF.** The IF's athlete record (nation code) is therefore the authority for "BEL in this sport", and changes of allegiance show up there.
- **The databases are complete but over-inclusive.** Example: the FIS biography search with `nationcode=BEL` lists 561 alpine, 136 snowboard, 58 cross-country, 53 freestyle, 13 ski-jumping and 12 Nordic-combined competitor records. Each has a FIS code (e.g. 65003), and the lists include historical and FIS-race-only (sub-International-level) skiers. Source: <https://www.fis-ski.com/DB/general/biographies.html?sectorcode=AL&nationcode=BEL&search=true>.
- **Usage:** these lists can confirm and look up an athlete, but they should not seed the roster wholesale. Their filtering has to come from results at International-level events.
- **Probed briefly, not confirmed** as BEL-filterable endpoints that work without JavaScript: the IJF country page (<https://www.ijf.org/countries/BEL>, content loads dynamically), World Athletics, World Aquatics, World Rowing, IBU and FEI (the FEI person search returned 403). Per-sport access belongs to #3 and #4.
- **Per-sport IDs to store (examples):**
  - World Athletics athlete ID, P1146 on Wikidata: `https://worldathletics.org/athletes/-/<id>`.
  - FIS code / competitor ID, P2772 for alpine.
  - The UCI ID, an 11-digit lifetime number per licence holder that is common to all cycling disciplines and assigned on the first licence through the national federation (Cycling Canada 2026 licence memo: <https://cyclingcanada.ca/wp-content/uploads/2025/12/Cycling-Canada-2026-Licence-Memo-ENG-Final.pdf>; UCI regulation text not checked first-hand). This is distinct from Wikidata's P11020 "UCI rider ID", the uci.org page ID.
  - World Rowing, World Aquatics, FIE, FIG and other IF IDs, where they exist.

## 3. Crosswalk sources

- **Wikidata** (live query on query.wikidata.org, 2026-11-13).
  - 7,365 humans have "country for sport" (P1532) = Belgium, across all sports and eras.
  - Among those, the most-used Olympic identifiers are: Olympedia (1,175), World Athletics (972), Olympics.com (738), World Rowing (142), World Aquatics (92) and FIS alpine (7).
  - For those born in 1995 or later: Team Belgium 220, Olympedia 179, World Athletics 165, UCI 69, World Gymnastics 55, European Athletics 29.
  - **Verdict:** Wikidata is a good crosswalk for established athletes and very thin for juniors and winter sports. It is community-edited, so treat it as a hint.
- **Olympedia** (P8286, `https://www.olympedia.org/athletes/<id>`): covers Olympians only. It is useful for reference backfill of Paris 2024 and Milano-Cortina 2026.

## 4. Identity linking

- **No public cross-sport Belgian athlete identifier was found.** Neither Sport Vlaanderen nor Adeps exposes one. The Team Belgium ID is the closest thing, but it only covers Team Belgium's subset.
- **Recommended model** (for the domain-modeling and grilling sessions to confirm):
  - An internal Athlete ID.
  - An `external_ids` table with source, external ID and sport, holding: IF ID(s), Team Belgium ID, Olympedia ID and Wikidata QID.
  - **Matching order:**
    1. Exact IF ID within a sport.
    2. Existing crosswalk via Wikidata or Team Belgium.
    3. Normalised name (accents, particles such as "Van"/"De", double surnames) plus date of birth.
    4. Otherwise, a manual merge queue.
  - Date of birth is available from Team Belgium and most IF bios and is the strongest disambiguator.
- **Multi-sport athletes** (e.g. track cycling to road cycling, or athletics to bobsleigh) keep one Athlete with several IF IDs.

## 5. Keeping the roster current

- **New Athletes:** a weekly results ingest creates an Athlete for each new BEL entrant at an International-level event. A daily ingest does the same during Championships and Games.
- **Re-sync:** a monthly Team Belgium sitemap diff, which surfaces new profile IDs.
- **Nationality changes:** detected when an IF record's nation changes away from BEL. Per the Glossary, the athlete then leaves the active roster but keeps their history.
- **Spot checks:** the Sport Vlaanderen and Adeps contract announcements, once a year.
- **Inactivity:** "active" should be computed from the date of the athlete's latest International-level result, not read from Team Belgium's flags.

## Not verified / gaps

- No public bulk or JSON API was confirmed for Team Belgium (only page-embedded JSON) or for IJF, World Athletics, World Aquatics, World Rowing, IBU or FEI.
- The size of the true roster (all BEL International-level athletes, youth included) was not measured. A rough guess is low thousands across both cycles. That guess is an estimate, not a sourced figure.
- The German-speaking Community and the Belgian Defence elite-sport scheme were not researched.
- Image rights for Team Belgium photos are not covered here (see "Athlete profile content" on the map).
