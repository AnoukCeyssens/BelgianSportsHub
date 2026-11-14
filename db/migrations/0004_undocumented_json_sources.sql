-- Data: the Automatic sources behind undocumented JSON backends (spec #20, ticket #43). Cadence is data.
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('ijf-judo', 'IJF judo (Judobase, data.ijf.org)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-athletics', 'World Athletics (worldathletics.org page data)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-aquatics', 'World Aquatics (api.worldaquatics.com)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('fie-fencing', 'FIE fencing (fie.org page data)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-rowing', 'World Rowing (world-rowing-api.soticcloud.net)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
