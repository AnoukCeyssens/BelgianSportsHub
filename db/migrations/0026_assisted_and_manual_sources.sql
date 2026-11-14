ALTER TABLE `source` ADD `url` text;--> statement-breakpoint
ALTER TABLE `source` ADD `notes` text;--> statement-breakpoint
-- Data (#20 review, finding B): a Source row for every Assisted and Manual sport, per
-- research/summer-sport-sources and research/winter-sport-sources. Assisted = HTML
-- tables the owner pastes (from the browser where the site refuses the Worker);
-- Manual = PDF-heavy, results typed by hand. Sport is null where a source spans several.
INSERT OR IGNORE INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`, `sport`, `id_scheme`, `url`, `notes`) VALUES
	('bwf-badminton', 'BWF badminton (tournamentsoftware.com)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Badminton', 'bwf', 'https://bwfbadminton.com/', 'HTML tables, bot-protected (403 to a plain client): paste the table from the browser. Juniors on the same site.'),
	('wbsc-baseball-softball', 'WBSC baseball/softball (wbsc.org)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Baseball/softball', 'wbsc', 'https://www.wbsc.org/', 'National-team tournament pages; bot-protected (403): paste from the browser.'),
	('fiba-basketball', 'FIBA basketball (fiba.basketball)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Basketball', 'fiba', 'https://www.fiba.basketball/', 'National-team results and rosters; bot-protected (403): paste from the browser.'),
	('fiba-3x3', 'FIBA 3x3 (play.fiba3x3.com)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '3x3 basketball', 'fiba-3x3', 'https://play.fiba3x3.com/', 'Individual player rankings filterable by federation; bot-protected (403): paste from the browser.'),
	('world-boxing', 'World Boxing and European Boxing (worldboxing.org, eubcboxing.org)', 'manual', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Boxing', 'world-boxing', 'https://worldboxing.org/', 'PDF-heavy: results as daily PDF sheets, rankings as news posts. Enter results by hand from the PDF.'),
	('paddle-worldwide', 'Paddle Worldwide canoe slalom and sprint (canoeresults.eu)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'paddle-worldwide', 'https://paddleworldwide.com/results', 'Formerly ICF. HTML results per event, partly PDF; choose Canoe slalom or Canoe sprint when pasting.'),
	('icc-cricket', 'ICC cricket (icc-cricket.com)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Cricket', 'icc', 'https://www.icc-cricket.com/rankings', 'Belgium is an associate member: T20I team pages and rankings.'),
	('fei-equestrian', 'FEI equestrian (FEI Database, data.fei.org)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'fei', 'https://data.fei.org/', 'Dressage, eventing and jumping. Bot-protected (403); the web-services API is for National Federations only. Paste from the browser; choose the discipline.'),
	('ifaf-flag-football', 'IFAF flag football (americanfootball.sport)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Flag football', 'ifaf', 'https://americanfootball.sport/', 'National-team pages.'),
	('fifa-uefa-football', 'FIFA and UEFA football (inside.fifa.com, uefa.com)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Football', 'fifa', 'https://www.uefa.com/', 'National teams: UEFA tournaments and the FIFA ranking.'),
	('fig-gymnastics', 'FIG gymnastics (gymnastics.sport)', 'manual', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'fig', 'https://www.gymnastics.sport/site/', 'PDF-heavy: detailed results are the timing provider''s PDF books. Artistic, rhythmic and trampoline; enter results by hand.'),
	('ehf-handball', 'EHF and IHF handball (eurohandball.com, ihf.info)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Handball', 'ehf', 'https://www.eurohandball.com/', 'EHF is the richest source for Belgium (national teams).'),
	('fih-hockey', 'FIH and EuroHockey hockey (fih.hockey, eurohockey.org)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Hockey', 'fih', 'https://www.fih.hockey/', 'Pro League, world ranking, Europeans on EuroHockey.'),
	('world-lacrosse', 'World Lacrosse sixes (worldlacrosse.sport)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Lacrosse', 'world-lacrosse', 'https://worldlacrosse.sport/', 'National-team pages; European Lacrosse for the Europeans.'),
	('uipm-modern-pentathlon', 'UIPM modern pentathlon (uipmworld.org)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Modern pentathlon', 'uipm', 'https://www.uipmworld.org/', 'World rankings and past events as HTML, some results only as PDF (then enter by hand).'),
	('rugby-sevens', 'World Rugby and Rugby Europe sevens (world.rugby, rugbyeurope.eu)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Rugby sevens', 'world-rugby', 'https://www.rugbyeurope.eu/', 'Belgium plays the Rugby Europe Sevens series.'),
	('world-sailing', 'World Sailing (sailing.org)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Sailing', 'world-sailing', 'https://www.sailing.org/', 'Olympic class rankings about nine times a year; results live on per-event sites (Manage2Sail etc.).'),
	('issf-shooting', 'ISSF shooting (issf-sports.org)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Shooting', 'issf', 'https://www.issf-sports.org/', 'Athletes database, results and rankings as HTML; result books as PDF.'),
	('world-skate-skateboarding', 'World Skate skateboarding (skateboarding.worldskate.org)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Skateboarding', 'world-skate', 'https://www.skateboarding.worldskate.org/', 'HTML and PDF, no nation filter.'),
	('world-climbing', 'World Climbing (ifsc.results.info)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Sport climbing', 'world-climbing', 'https://ifsc.results.info/', 'Formerly IFSC. Its JSON API answers 401 without a site session: paste from the browser.'),
	('squash', 'PSA World Tour and World Squash (psasquashtour.com, worldsquash.sport)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Squash', 'psa', 'https://www.psasquashtour.com/', 'PSA for the pro tour and rankings, World Squash for Championships.'),
	('isa-surfing', 'ISA surfing (isasurf.org)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Surfing', 'isa', 'https://isasurf.org/', 'The Olympic IF (the WSL is a third party). Bot-protected (403): paste from the browser.'),
	('ittf-table-tennis', 'ITTF and WTT table tennis (results.ittf.link)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Table tennis', 'ittf', 'https://results.ittf.link/', 'HTML results database with an association filter; WTT rankings bot-protected.'),
	('world-taekwondo', 'World Taekwondo (worldtaekwondo.org)', 'manual', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Taekwondo', 'world-taekwondo', 'https://www.worldtaekwondo.org/', 'PDF-heavy: rankings on the WT GMS platform, results on SimplyCompete (403). Enter results by hand.'),
	('tennis', 'ITF, ATP and WTA tennis (world.tennis)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Tennis', 'itf', 'https://www.world.tennis/', 'ITF for the World Tennis Tour, Davis and BJK Cup; ATP and WTA for pro rankings.'),
	('iwf-weightlifting', 'IWF weightlifting (iwf.sport)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Weightlifting', 'iwf', 'https://iwf.sport/results/results-by-events/', 'HTML results per event; bot-protected (403): paste from the browser.'),
	('uww-wrestling', 'United World Wrestling (uww.org)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Wrestling', 'uww', 'https://uww.org/athletes-results', 'HTML results with a nation filter in the UI.'),
	('european-athletics', 'European Athletics (european-athletics.com)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Athletics', 'world-athletics', 'https://www.european-athletics.com/', 'The European Championships (World Athletics does not carry them). Bot-protected (403): paste from the browser.'),
	('european-aquatics', 'European Aquatics (europeanaquatics.org)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'world-aquatics', 'https://europeanaquatics.org/', 'Formerly LEN: the European Championships in every aquatics sport; choose the sport when pasting.'),
	('fis-ski-jumping', 'FIS ski jumping (fis-ski.com)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Ski jumping', 'fis', 'https://www.fis-ski.com/DB/ski-jumping/calendar-results.html', 'No FIS points list: results and World Cup standings as server-rendered HTML. FIS terms forbid scraping; paste by hand.'),
	('fis-nordic-combined', 'FIS Nordic combined (fis-ski.com)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Nordic combined', 'fis', 'https://www.fis-ski.com/DB/nordic-combined/calendar-results.html', 'Not on the 2030 programme (Milano-Cortina 2026 history and YOG 2028 only).'),
	('freeride-world-tour', 'Freeride World Tour (freerideworldtour.com)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Freeride', 'fis', 'https://www.freerideworldtour.com/rankings/', 'New for 2030; the FIS database freeride sector is still empty. Next.js site, nationality not verified.'),
	('ibu-biathlon', 'IBU biathlon (biathlonresults.com)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Biathlon', 'ibu', 'https://www.biathlonresults.com/', 'The former open API now answers 401; Datacenter pages and PDFs. IBU terms forbid reproduction without permission.'),
	('ismf-ski-mountaineering', 'ISMF ski mountaineering (dataskimo.org)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Ski mountaineering', 'ismf', 'https://www.dataskimo.org/result.php', 'Plain PHP result and ranking pages with a nation column.'),
	('isu-short-track', 'ISU short track (isu-skating.com)', 'assisted', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Short track speed skating', 'isu', 'https://isu-skating.com/short-track/results/', 'Client-rendered pages backed by an undocumented front-api.isu.org; not in api.isuresults.eu. Paste from the browser.'),
	('isu-figure-skating', 'ISU figure skating (results.isu.org)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Figure skating', 'isu', 'https://results.isu.org/', 'Static per-event HTML (entries, results, segments); judges'' details as PDF. Event URLs from the ISU calendar.'),
	('ibsf-bobsleigh-skeleton', 'IBSF bobsleigh and skeleton (ibsf.org)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, 'ibsf', 'https://www.ibsf.org/en/results', 'HTML plus OMEGA timing PDFs; could not be fetched during research (unverified). Choose Bobsleigh or Skeleton when pasting.'),
	('fil-luge', 'FIL luge (fil-luge.org)', 'assisted', 14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Luge', 'fil', 'https://www.fil-luge.org/en/results', 'Server-rendered results with season and category filters; nation filter on athletes.'),
	('wcf-curling', 'World Curling (results.worldcurling.org)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Curling', 'wcf', 'https://results.worldcurling.org/Association/Details/39', 'Classic server-rendered results database; Belgium is association 39.'),
	('iihf-ice-hockey', 'IIHF ice hockey (iihf.com)', 'assisted', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Ice hockey', 'iihf', 'https://www.iihf.com/en/events', 'Every Championship division; bot-protected (403), game sheets as PDF. Paste from the browser.');
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://api.isuresults.eu/docs/'), `sport` = coalesce(`sport`, 'Speed skating'), `id_scheme` = coalesce(`id_scheme`, 'isu') WHERE `key` = 'isu-speed-skating';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.fis-ski.com/DB/alpine-skiing/fis-points-lists.html'), `sport` = coalesce(`sport`, 'Alpine skiing'), `id_scheme` = coalesce(`id_scheme`, 'fis') WHERE `key` = 'fis-alpine';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.fis-ski.com/DB/cross-country/fis-points-lists.html'), `sport` = coalesce(`sport`, 'Cross-country skiing'), `id_scheme` = coalesce(`id_scheme`, 'fis') WHERE `key` = 'fis-cross-country';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.fis-ski.com/DB/freestyle-freeski/fis-points-lists.html'), `sport` = coalesce(`sport`, 'Freestyle skiing'), `id_scheme` = coalesce(`id_scheme`, 'fis') WHERE `key` = 'fis-freestyle';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.fis-ski.com/DB/snowboard/fis-points-lists.html'), `sport` = coalesce(`sport`, 'Snowboard'), `id_scheme` = coalesce(`id_scheme`, 'fis') WHERE `key` = 'fis-snowboard';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://api.worldarchery.org/v3/API/'), `sport` = coalesce(`sport`, 'Archery'), `id_scheme` = coalesce(`id_scheme`, 'world-archery') WHERE `key` = 'world-archery';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://developers.triathlon.org/'), `sport` = coalesce(`sport`, 'Triathlon'), `id_scheme` = coalesce(`id_scheme`, 'world-triathlon') WHERE `key` = 'world-triathlon';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.fivb.org/VisSDK/VisWebService/'), `sport` = coalesce(`sport`, 'Volleyball'), `id_scheme` = coalesce(`id_scheme`, 'fivb') WHERE `key` = 'fivb-volleyball';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.fivb.org/VisSDK/VisWebService/'), `sport` = coalesce(`sport`, 'Beach volleyball'), `id_scheme` = coalesce(`id_scheme`, 'fivb') WHERE `key` = 'fivb-beach-volleyball';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://judobase.ijf.org/'), `sport` = coalesce(`sport`, 'Judo'), `id_scheme` = coalesce(`id_scheme`, 'ijf') WHERE `key` = 'ijf-judo';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://worldathletics.org/'), `sport` = coalesce(`sport`, 'Athletics'), `id_scheme` = coalesce(`id_scheme`, 'world-athletics') WHERE `key` = 'world-athletics';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.worldaquatics.com/'), `id_scheme` = coalesce(`id_scheme`, 'world-aquatics') WHERE `key` = 'world-aquatics';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://fie.org/'), `sport` = coalesce(`sport`, 'Fencing'), `id_scheme` = coalesce(`id_scheme`, 'fie') WHERE `key` = 'fie-fencing';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.worldrowing.com/'), `sport` = coalesce(`sport`, 'Rowing'), `id_scheme` = coalesce(`id_scheme`, 'world-rowing') WHERE `key` = 'world-rowing';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://dataride.uci.ch/'), `id_scheme` = coalesce(`id_scheme`, 'uci') WHERE `key` = 'uci-cycling';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://worldathletics.org/'), `sport` = coalesce(`sport`, 'Athletics') WHERE `key` = 'world-athletics-timetables';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.worldaquatics.com/') WHERE `key` = 'world-aquatics-timetables';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://api.worldarchery.org/v3/API/'), `sport` = coalesce(`sport`, 'Archery') WHERE `key` = 'world-archery-timetables';
--> statement-breakpoint
UPDATE `source` SET `url` = coalesce(`url`, 'https://www.owgr.com/'), `sport` = coalesce(`sport`, 'Golf'), `id_scheme` = coalesce(`id_scheme`, 'owgr') WHERE `key` = 'owgr-golf';
