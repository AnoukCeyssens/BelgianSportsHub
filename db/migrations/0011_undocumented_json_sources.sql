-- Data: the Automatic sources behind undocumented JSON backends (spec #20, ticket #43). Cadence is data.
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('ijf-judo', 'IJF judo (Judobase, data.ijf.org)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-athletics', 'World Athletics (worldathletics.org page data)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-aquatics', 'World Aquatics (api.worldaquatics.com)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('fie-fencing', 'FIE fencing (fie.org page data)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-rowing', 'World Rowing (world-rowing-api.soticcloud.net)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('uci-cycling', 'UCI cycling (DataRide, dataride.uci.ch)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
-- Paste-importer prefill (#25, 0008): each source's sport and ID scheme match its adapter.
UPDATE `source` SET `sport` = 'Judo', `id_scheme` = 'ijf' WHERE `key` = 'ijf-judo';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Athletics', `id_scheme` = 'world-athletics' WHERE `key` = 'world-athletics';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Aquatics', `id_scheme` = 'world-aquatics' WHERE `key` = 'world-aquatics';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Fencing', `id_scheme` = 'fie' WHERE `key` = 'fie-fencing';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Rowing', `id_scheme` = 'world-rowing' WHERE `key` = 'world-rowing';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Cycling', `id_scheme` = 'uci' WHERE `key` = 'uci-cycling';
