ALTER TABLE `timetable_version` ADD `fingerprint` text;--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-athletics-timetables', 'World Athletics Championship timetables (worldathletics.org page data)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-aquatics-timetables', 'World Aquatics Championship schedules (api.worldaquatics.com)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-archery-timetables', 'World Archery Championship schedules (api.worldarchery.org)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint

-- Paste-importer prefill (#25, 0008): each source's sport and ID scheme match its adapter.
UPDATE `source` SET `sport` = 'Athletics', `id_scheme` = 'world-athletics' WHERE `key` = 'world-athletics-timetables';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Aquatics', `id_scheme` = 'world-aquatics' WHERE `key` = 'world-aquatics-timetables';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Archery', `id_scheme` = 'world-archery' WHERE `key` = 'world-archery-timetables';