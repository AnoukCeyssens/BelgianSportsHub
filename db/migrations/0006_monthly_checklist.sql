CREATE TABLE `checklist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`every_months` integer DEFAULT 1 NOT NULL,
	`due_on` text NOT NULL,
	`last_checked_at` text,
	`last_outcome` text,
	`last_note` text
);
--> statement-breakpoint
-- Seeded checks (ticket #45). Topics are staggered over the first weeks so the
-- checklist does not fall due all at once; the owner adds or edits the rest.
INSERT INTO `checklist_item` (`id`, `topic`, `name`, `url`, `every_months`, `due_on`) VALUES
	('if-2030-fis', '2030 IF qualification systems', 'FIS: alpine, cross-country, ski jumping, freestyle, snowboard', 'https://www.fis-ski.com', 1, '2026-11-16'),
	('if-2030-fis-freeride', '2030 IF qualification systems', 'FIS: freeride (new for 2030)', 'https://www.freerideworldtour.com', 1, '2026-11-16'),
	('if-2030-isu', '2030 IF qualification systems', 'ISU: speed skating, short track, figure skating', 'https://www.isu.org', 1, '2026-11-16'),
	('if-2030-ibu', '2030 IF qualification systems', 'IBU: biathlon', 'https://www.biathlonworld.com', 1, '2026-11-16'),
	('if-2030-ibsf', '2030 IF qualification systems', 'IBSF: bobsleigh and skeleton', 'https://www.ibsf.org', 1, '2026-11-16'),
	('if-2030-fil', '2030 IF qualification systems', 'FIL: luge', 'https://www.fil-luge.org', 1, '2026-11-16'),
	('if-2030-wcf', '2030 IF qualification systems', 'WCF: curling', 'https://worldcurling.org', 1, '2026-11-16'),
	('if-2030-iihf', '2030 IF qualification systems', 'IIHF: ice hockey', 'https://www.iihf.com', 1, '2026-11-16'),
	('if-2030-ismf', '2030 IF qualification systems', 'ISMF: ski mountaineering', 'https://www.ismf-ski.org', 1, '2026-11-16'),
	('boic-la28', 'BOIC selection regulation', 'BOIC general selection regulation for LA28', 'https://www.teambelgium.be', 1, '2026-11-18'),
	('fed-athletics', 'Belgian federation selection criteria', 'Athletics', NULL, 1, '2026-11-23'),
	('fed-swimming', 'Belgian federation selection criteria', 'Swimming', NULL, 1, '2026-11-23'),
	('fed-cycling', 'Belgian federation selection criteria', 'Cycling', NULL, 1, '2026-11-23'),
	('fed-hockey', 'Belgian federation selection criteria', 'Hockey', NULL, 1, '2026-11-23'),
	('fed-basketball', 'Belgian federation selection criteria', 'Basketball', NULL, 1, '2026-11-23'),
	('fed-equestrian', 'Belgian federation selection criteria', 'Equestrian', NULL, 1, '2026-11-23'),
	('fed-judo', 'Belgian federation selection criteria', 'Judo', NULL, 1, '2026-11-23'),
	('fed-gymnastics', 'Belgian federation selection criteria', 'Gymnastics', NULL, 1, '2026-11-23'),
	('fed-triathlon', 'Belgian federation selection criteria', 'Triathlon', NULL, 1, '2026-11-23'),
	('fed-rowing', 'Belgian federation selection criteria', 'Rowing', NULL, 1, '2026-11-23'),
	('fed-sailing', 'Belgian federation selection criteria', 'Sailing', NULL, 1, '2026-11-23'),
	('fed-taekwondo', 'Belgian federation selection criteria', 'Taekwondo', NULL, 1, '2026-11-23'),
	('fed-table-tennis', 'Belgian federation selection criteria', 'Table tennis', NULL, 1, '2026-11-23'),
	('fed-tennis', 'Belgian federation selection criteria', 'Tennis', NULL, 1, '2026-11-23'),
	('fed-skating', 'Belgian federation selection criteria', 'Skating (speed skating, short track, figure skating)', NULL, 1, '2026-11-23'),
	('fed-skiing', 'Belgian federation selection criteria', 'Skiing and snowboard', NULL, 1, '2026-11-23'),
	('deadline-la28', 'Entry deadlines', 'LA28 sport entries deadline (26 June 2028 as published)', NULL, 1, '2026-11-30'),
	('deadline-2030', 'Entry deadlines', 'French Alps 2030 sport entries deadline', NULL, 1, '2026-11-30'),
	('calendar-refresh', 'Calendar refresh', 'Championships and named series, next six months', NULL, 1, '2026-11-16');
