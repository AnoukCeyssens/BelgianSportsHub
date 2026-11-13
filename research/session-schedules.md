# Session schedules for Championships and the Games

Research for [#17 Session schedules for Championships and the Games](https://github.com/AnoukCeyssens/BelgianSportsHub/issues/17). Researched 2026-11-13. It builds on the per-sport source tables in [#3](https://github.com/AnoukCeyssens/BelgianSportsHub/blob/research/summer-sport-sources/research/summer-sport-sources.md) and [#4](https://github.com/AnoukCeyssens/BelgianSportsHub/blob/research/winter-sport-sources/research/winter-sport-sources.md) and does not repeat them.

## Summary

**The question:** the **Live** phase of a Championship or Games needs the session schedule: day, local time, event and round. Where does it come from, when is it published, in what format, and how often does it change? For the Games, is the schedule specific enough to attach Belgian **Entries** to?

**The answer:**

- **The Games: the organising committee's PDFs are the only official schedule before Games time.** LA28 publishes three PDFs on [la28.org](https://la28.org/en/games-plan/olympics.html#olympic-competition-schedule): by day, by session and by event. There is no API, JSON, CSV or iCal. Each version moves to a new URL folder, so an importer has to find the link on the page first.
- **The by-event PDF is detailed enough to attach Entries to an event and round, but not to a heat or match.** Each of the about 842 sessions has a stable session code (`ATH02`, `HOC23`), a date, a Games day, a session type, start and end times in Pacific Time, and the list of events and rounds in it. Two examples: "Women's 100m Semifinal" and "Men's 400m Hurdles Round 1". Three things are missing:
  - the order of events within a session;
  - heat assignments;
  - which teams play in each team-sport session. Hockey only says "Men's Pool (2 Matches)", and beach volleyball says "Men's and/or Women's Preliminaries (3 Matches)". Football kickoff times are "TBD".
- **Lead time and churn at LA28:** the first by-session version came out three years before the Games (14 July 2025). The by-event version followed 32 months before (12 November 2025). There have been 8 versions in 15 months, about one every two months. Most changes are start-time tweaks. Between V2 and V4.1, 124 of 842 sessions changed time and 5 moved date, if you leave out football's block move. Events also move between sessions; for example, the men's 1500m round 1 moved from the morning to the afternoon. The latest change (V4.0 to V4.1) was only a venue rename.
- **Precedent:** Milano Cortina 2026 published at least 12 versions as a grid PDF. Version 12 is dated 22 December 2025, about six weeks before the Games. Once the draw was known it named the hockey match-ups (for example "ITA-FRA"). Paris 2024 published its sport-by-sport schedule two years out (12 October 2022) and called it provisional until the end of the Games.
- **French Alps 2030 has no schedule yet.** The venue map was approved in June 2026. Going by Milano Cortina and LA28, expect a first version two to three years out, so between 2027 and early 2028.
- **During the Games, heat-level detail comes from the IFs, not the OCOG PDFs.** The World Aquatics JSON backend holds Paris 2024 heat by heat. Each heat has a local and UTC start time and nation codes, which places a BEL swimmer in "Heat 8" and then "Semifinal 1". Olympics.com has a unit-level schedule too, but it refused plain clients from here. The official IOC feed (ODF) is meant for media partners.
- **Championships: the IF or local organising committee publishes the timetable, between 3 and 14 months ahead, mostly as HTML or PDF:**
  - **World Athletics:** the minute-by-minute timetable for every event and round comes out about 13 months ahead. Tokyo 25 was approved on 31 July 2024 for September 2025, published as PDF and HTML.
  - **World Aquatics:** sport-level dates come about 13 months ahead; the detailed schedule about 7 months ahead. In the JSON backend, each event lists its phases and heats with times.
  - **ISU speed skating:** races appear as a `schedule` in the open API, with start-list and result links, but only close to the event. For the European Championships of January 2027 it was still empty on 13 November 2026.
  - **FIS (Crans-Montana 2027):** an HTML and PDF race programme with times for runs 1 and 2. **Alpine qualification rounds have no time**, and that is where Belgian technical skiers may well start.
  - **IBU (Otepää 2027):** start times for each race are on the local organising committee's page about three months out. They have already moved once (mixed relay 17:30 → 17:10).
  - **FIH World Cup 2026:** host-team match times were published about 10.5 months ahead. The full fixture list with teams came only after the draw in March 2026, about 5 months ahead.
  - **UCI Road Worlds:** the day for each race is known about a year ahead. Start times come late.
- **Implication for the spec:** treat the session schedule as **curated data with a version stamp**, not as a live feed. Import the OCOG by-event PDF (or the IF timetable) a few times before the event. Attach each Belgian Entry to an **event + round** (+ session code for the Games). Fill in heat, lane or match details daily during the Live phase from IF start lists. Show times in the venue's local time with Belgian time next to them, and mark the whole schedule "subject to change".

## The Games

### LA28 (summer, 14 to 30 July 2028)

**Source and format.** The [LA28 Olympics page](https://la28.org/en/games-plan/olympics.html#olympic-competition-schedule) links three PDFs per version. They are Excel exports, and `pdftotext -layout` extracts them cleanly:

| File | Content | Pages (V4.1) |
|---|---|---|
| [By Day](https://la28.org/content/dam/latwentyeight/competition-schedule-imagery/uploaded-oct-25-oly-4-1/LA28OlympicGamesCompetitionScheduleByDayV4.1.pdf) | One-page overview grid | 1 |
| [By Session](https://la28.org/content/dam/latwentyeight/competition-schedule-imagery/uploaded-oct-25-oly-4-1/LA28OlympicGamesCompetitionScheduleBySessionV4.1.pdf) | Venue × day grid of session time windows, with gold and bronze medal sessions marked | 3 |
| [By Event](https://la28.org/content/dam/latwentyeight/competition-schedule-imagery/uploaded-oct-25-oly-4-1/LA28OlympicGamesCompetitionScheduleByEventV4.1.pdf) | One row per session (see below) | 34 |

The columns of the by-event PDF are Sport, Venue, Zone, **Session Code**, Date, **Games Day**, **Session Type** (Preliminary, Quarterfinal, Semifinal, Final and so on), **Session Description** (the events and rounds), Start Time and End Time. Its header reads: *"This competition schedule is subject to change until the conclusion of the Los Angeles 2028 Games. Events listed in the Session Description are not necessarily listed in the order in which they will occur within the session during Games time. Kickoff times for the Football (Soccer) tournaments will be announced at a later date. All times listed are in Pacific Time (PT)…"*

Example rows from V4.1:

```
Athletics (Track & Field)  LA Memorial Coliseum  ATH02  Saturday, July 15  Day 1  Final  17:00–20:15
    Women's 100m Semifinal / Women's 400m Hurdles Round 1 / Women's Shot Put Final /
    Men's 10,000m Final / Women's 100m Final / Men's Decathlon 100m Heats / …
Hockey            Carson Field  HOC23  Monday, July 24  Day 10  Quarterfinal  9:00–14:00
    Men's Quarterfinal (2 Matches)
Beach Volleyball  Allianz Beach Arena  VBV01  Saturday, July 15  Day 1  Preliminary  9:00–12:00
    Men's and/or Women's Preliminaries (3 Matches)
```

**Granularity verdict.**

- **Individual sports:** the event and round are named, which is enough to attach an Entry ("Belgian X is in Women's 400m Hurdles Round 1, session ATH02, 17:00–20:15 PT"). The PDF gives no exact start time for that event inside the session, no heat, and no lane.
- **Team sports and bracket sports:** only the session's phase and number of matches are given. Football and hockey teams cannot be placed in sessions until the tournament draw and match schedule are out. Beach volleyball, tennis and badminton cannot be placed until the draw or pools are known. Beach volleyball does not even fix the gender in advance.
- **Session codes** are stable across versions. Only 3 of 845 were dropped between V2 and V4.1 (`SHO13`, `SHO14`, `TEN34`), and none were renumbered. That makes `session code + event + round` a usable key for repeated imports.

**Version history.** I rebuilt it from the upload folders (live site plus the [Wayback Machine CDX index](https://web.archive.org/cdx/search/cdx?url=la28.org/content/dam/latwentyeight/competition-schedule-imagery/*)):

| Version | Date (folder or "as of") | What | Lead time |
|---|---|---|---|
| V1 | 14 Jul 2025 ([LA28 release](https://la28.org/en/newsroom/la28-releases-competition-schedule-for-2028-olympic-games.html)) | By day and by session only; promised "a more detailed schedule, including medal events and gender order … later this year" | 36 months |
| V1.1 | Oct 2025 (archived 19 Oct) | By session | ~33 months |
| V2 | 12 Nov 2025 (`uploaded-nov-12-2025/`) | **First by-event schedule**, covering every medal event ([US Pentathlon summary](https://www.usapentathlon.org/news/2025/november/12/la28-reveals-comprehensive-olympic-competition-schedule)) | 32 months |
| V2.1 | 6 Feb 2026, re-uploaded 18 Feb | Athletics session refinements, per [World Athletics, 7 Feb 2026](https://worldathletics.org/news/press-releases/la28-olympic-games-athletics-session-timetable-published): men's 1500m round 1 moved from the morning to the afternoon of day 2, and start times were adjusted "after consultation with broadcast partners" | 29 months |
| V3.0 | 16 Mar 2026 | Football window moved from 12 July to 10 July with kickoffs TBD; archery times shifted; 2 shooting sessions removed | 28 months |
| V3.1 | 9 Jun 2026 | Minor | 25 months |
| V4.0 | 29 Jul 2026 (PDF created 20 Jul) | Times changed; 1 tennis session removed | 23 months |
| V4.1 | 26 Oct 2026 | Beach volleyball venue renamed (Alamitos Beach Stadium → Allianz Beach Arena); nothing else | 20 months |

**Measured churn.** I parsed the session rows of the by-event PDFs V2, V2.1, V3.0, V3.1, V4.0 and V4.1 and compared them by session code:

| Step | Sessions | Date moved | Start or end time changed |
|---|---|---|---|
| V2 → V2.1 | 845 | 4 | 107 |
| V2.1 → V3.0 | 843 | 50 (all football) | 16 |
| V3.0 → V3.1 | 843 | 0 | 0 |
| V3.1 → V4.0 | 842 | 1 | 56 |
| V4.0 → V4.1 | 842 | 0 | 0 |

Event descriptions also change between versions: events move between sessions, names gain precision ("Mixed team" became "Recurve Mixed team"), and placeholders are resolved (the "Mixed Team Final (Format and Duration Pending FIG Executive Committee Approval)" note was dropped). The parse is heuristic, so read the numbers as orders of magnitude. **Expect more versions until the Games, and kickoff and match-level detail only in 2028.**

### Milano Cortina 2026 (winter precedent)

- The official site hosted [Competition Schedule V.5](https://milanocortina2026.olympics.com/s3fs-public/documents/2024-06/Allegato%201_a_CompetitionSchedule_OLY_V.5_.pdf) in June 2024, 20 months out (seen in search results; not downloaded). NOCs mirrored later versions: [V8, 31 Jan 2025](https://olympic.sk/sites/default/files/field_media_file/2025-02/Milano%20Cortina%202026%20Competition%20Schedule%20V8.pdf), [V10, Aug 2025](https://olympiatoppen.no/contentassets/7afba596d7fe4f208ea708f94c06431c/milano-cortina-2026-competition-schedule-v.10_aug-2025.pdf) and [V12, 22 Dec 2025](https://olympiatoppen.no/contentassets/253ea703ea024e2598fee804f16489cd/20251222_milano-cortina-2026-oly-competition-schedule-version-12.pdf). That makes **at least 12 versions**, the last one about 6 weeks before the opening on 6 February 2026.
- **Format:** a two-page venue × day grid exported from Excel. Each cell names the discipline, the event and the phase (for example "Biathlon Men's 12.5km Pursuit" or "Short Track Women's 500m … QF/SF/Finals"). Once the draw was known, V12 also names the **ice-hockey match-ups** ("Ice Hockey Women ITA-FRA Preliminary Round"). So the final pre-Games version is specific to the match for team sports.

### Paris 2024 (summer precedent)

- The sport-by-sport event schedule came out on **12 October 2022**, two years out, as a PDF attached to the media release, and was described as a *"provisional timetable … subject to change until the conclusion of the Games"* ([CONI summary of the release](https://parigi2024.coni.it/en/news/events-schedule-announced-2-years-before-the-games.html)). IFs kept their own annexes; for example, the [FEI timetable PDF](https://inside.fei.org/system/files/Paris2024%20Timetable%2018July2023.pdf) went through versions dated 24 Feb, 30 May and 18 Jul 2023.
- **At heat level, the IFs mirror the Games.** World Aquatics' backend lists competition `2943` "Olympic Games Paris 2024". `GET api.worldaquatics.com/fina/events/{id}` returns every heat with `Date`, `Time` (local) and `UtcDateTime`, plus results with `NAT`. For the women's 50m freestyle, BEL appears in Heat 8 (11:20 local, 3 Aug) and Semifinal 1 (probed 2026-11-13). This is the heat-level detail the OCOG PDF lacks, and it comes from the same undocumented backend as in #3.

### Olympics.com and ODF

- During the Games, olympics.com shows a unit-level schedule (each heat or match, with competitors and NOC flags) for Paris 2024 and Milano Cortina 2026. **Not verified:** the backend `sph-s-api.olympics.com` refused the TLS handshake to a plain client, and the schedule pages timed out on fetch. Bypassing bot protection is out of bounds, so treat this source as manual-only or browser-only.
- The underlying data standard is the **Olympic Data Feed (ODF)**: schedule, start-list and results messages per *event unit*, documented in sport data dictionaries on [odf.olympictech.org](https://odf.olympictech.org/2024-Paris/general/HTML/foundation/Foundation_Principles_body.htm). It serves media organisations under IOC licence, so it is not a realistic source for a €10/month personal app. Its *event-unit* concept is still a good model for the data.

### French Alps 2030 (winter, 1 to 17 February 2030)

There is no competition schedule yet. In July 2026, organisers said *"the competition schedule is yet to be determined"*, and work starts once the venue map is final ([Francs Jeux, 12 Jul 2026](https://www.francsjeux.com/en/2026/07/12/French-Alps-2030%3A-A-compact-Paralympic-map-to-reduce-logistical-challenges-and-improve-the-overall-experience/111670/); venue map approved [30 Jun 2026](https://www.francsjeux.com/en/2026/06/30/French-Alps-2030%3A-The-map-of-sites-validated-with-the-promise-of-an-enhanced-experience-for-all-stakeholders/111548/)). Precedent puts a first version between 2027 and early 2028: Milano Cortina had reached V5 20 months out, and LA28 published 36 months out.

## Championships (IF timetables)

| IF / event | Published | Lead time | Format | Granularity | Changes seen |
|---|---|---|---|---|---|
| **World Athletics**: Worlds Tokyo 25 (13–21 Sep 2025) | Council approval 31 Jul 2024, [release 1–2 Aug 2024](https://worldathletics.org/competitions/world-athletics-championships/tokyo25/news/press-releases/timetable-released-for-world-athletics-championships-tokyo-25), [PDF](https://assets.aws.worldathletics.org/document/66ab1831b42de8e29691520e.pdf) | ~13.5 months | PDF and HTML; per-round start lists on worldathletics.org during the event (GraphQL backend, see #3) | **Minute, event and round** ("09:35 1500m M R1", "18:15 Long Jump W Q A+B"); 14 sessions | Same pattern as the LA28 athletics refinements: small time shifts, events moved between sessions |
| **World Aquatics**: Worlds Singapore 2025 (11 Jul–3 Aug 2025) | Sport-level dates [18 Jun 2024](https://www.worldaquatics.com/news/4040370/competition-schedule-world-aquatics-championships-singapore-2025); detailed schedule 12 Dec 2024 (search result, not opened) | 13 months (dates), ~7 months (detail) | News HTML, then a detailed schedule; JSON\* `fina/competitions/4725/events` lists events, phases and heats; `fina/events/{id}` gives a local and UTC time per heat (probed) | **Phase and heat, with times**; heats populated from start lists | Not measured |
| **ISU speed skating**: Worlds and Europeans | `api.isuresults.eu/events/{id}/schedule/` (probed) | Close to the event: the Europeans of 8 Jan 2027 and the Worlds of 25 Feb 2027 still returned `[]` on 13 Nov 2026; the Europeans 2026 schedule has 14 races with UTC start times | **Documented open API** (see #4) | **Race** ("Team Sprint Women", 18:30Z), each linked to start list and results | The API gives no version history |
| **FIS**: Alpine Worlds Crans-Montana 2027 (1–14 Feb 2027) | [Race programme page](https://www.cransmontana2027.ch/en/competition/race-programme/) (HTML plus PDF "CM27-Programme-EN-A4.pdf"); ticket sales opened 19 Feb 2026 | ≥ 3 months, likely ~12 (ticketing) | HTML and PDF from the local organising committee; FIS DB race pages and live timing during the event | **Event and run** ("Women's giant slalom 10:00 / 13:30"); **qualification rounds have no time**; downhill trainings listed | Reserve day built in (8 Feb), which hints at weather moves |
| **IBU**: Worlds Otepää 2027 (9–21 Feb 2027) | [LOC schedule page](https://www.biathlonotepaa.com/en/ajakava) | ~3 months (likely earlier for ticketing) | HTML (LOC), PDFs on the IBU Datacenter during the event (API closed, see #4) | **Race and start time** ("Fri 12 Feb 17:30 Sprint M") | Mixed relay listed at 17:30 in an earlier capture, 17:10 now |
| **FIH**: Hockey World Cup 2026 (15–30 Aug 2026, Wavre and Amstelveen) | Host-match times [30 Sep 2025](https://www.fih.hockey/news/fih-hockey-world-cup-belgium2); full fixtures after the draw on 18 Mar 2026 ([Hockey Australia](https://www.hockey.org.au/news/2026-fih-hockey-world-cup-schedule-announced)) | 10.5 months (host slots), 5 months (all matches) | HTML news and the FIH match centre | **Match** (teams, time, venue) after the draw; knockout match-ups by placeholders until earlier rounds finish | Second group stage pairings depend on results |
| **UCI**: Road Worlds Montréal 2026 (20–27 Sep 2026) | Courses and day order unveiled at the 2025 Worlds; ["200 days to go"](https://www.uci.org/pressrelease/200-days-to-go-a-look-at-the-courses-of-the-2026-uci-road-world/7MNCbBHZySudjNAoDW4R8x) | ~12 months (day), late (start times) | HTML press releases and LOC site | **Race per day** (for example Women Elite RR on the Saturday); start time later | Not measured |

Cross-cutting patterns:

- **Lead time:** the day each event is held is known 5 to 14 months ahead. Exact start times per round are known 3 to 13 months ahead, depending on the sport. Heat, lane or match assignment comes from start lists published **0 to 2 days before** each round. The draw for team and bracket sports comes 2 to 6 months ahead.
- **Format:** HTML and PDF everywhere. Machine-readable schedules exist only where #3 and #4 already found a backend: ISU speed skating (open API), World Aquatics (JSON\*), World Athletics (GraphQL\*) and World Archery (`schedule` endpoint in its API, per #3). Elsewhere it is manual entry, which is fine for one event with a handful of Belgians.
- **Change frequency:** a few versions before the event, mostly small time shifts. **During** the event, changes are driven by weather (alpine, biathlon, sailing, surfing, road cycling) and by results (brackets, team-sport knockouts, alpine qualification). A daily refresh during the Live phase covers these, matching the freshness target.
- **Continental Championships (Europeans)** were not sampled here. Expect the same pattern with shorter lead times; their timetables are on the continental bodies' sites listed in #3.

## Implications for the domain model (suggested, not decided)

- A **Session** is (competition, sport, session code if any, date, local start and end, venue, time zone). An Entry attaches to an **event + round**, which sits in a session. A heat, run or match is optional detail filled in during the Live phase.
- Keep a **schedule version or "as of" stamp** on imported schedules, so a re-import can show what moved.
- Store times as venue-local time plus an IANA time zone, and show Belgian time next to them. LA28 is Belgian time −9 h, so most LA sessions are Belgian evening and night. French Alps 2030 is the same zone as Belgium.
- Team-sport and bracket-sport Entries attach first to a *phase* ("Men's Pool") and only later to a dated match.

## Not verified / limits

- olympics.com schedule pages and `sph-s-api.olympics.com` could not be fetched (TLS refusal, timeouts). I did not try to work around the bot protection.
- Milano Cortina V5 was not downloaded, and I did not diff MC versions for churn. The MC churn claim rests on version numbers only.
- The detailed World Aquatics Singapore 2025 schedule PDF (12 Dec 2024) was seen only through search summaries.
- The World Athletics and World Archery schedule endpoints were not probed this session.
- The LA28 diff counts come from a heuristic `pdftotext` parse. The direction and size are reliable, the exact numbers less so.
- No European Championship timetables were sampled.

## Open questions surfaced

1. **Is "event + round" the attachment level for an Entry in the Live phase, or does the user want heat, run or match?** Heat level needs daily start-list ingest from IFs. Event + round can be curated once from the OCOG or IF PDF.
2. **Should the app model a Session as a domain term?** LA28's session code is a stable key for the Games, but Championships have no equivalent. This is a candidate glossary entry.
3. **Time-zone display:** venue time, Belgian time, or both? LA28's −9 h makes this a real UX question.
4. **When to import the LA28 schedule:** now (V4.1), or wait for the 2028 versions? Many more revisions are likely, and team-sport kickoffs are still TBD.
