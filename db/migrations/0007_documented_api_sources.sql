-- Data: Automatic sources with documented APIs (spec #20, ticket #42). Cadence is data from here on.
-- World Triathlon needs WORLD_TRIATHLON_API_KEY (a Worker secret); until it is set, its runs flag it blocked (Assisted).
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-archery', 'World Archery (api.worldarchery.org)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('world-triathlon', 'World Triathlon (api.triathlon.org)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('fivb-volleyball', 'FIVB volleyball (VIS web service)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('fivb-beach-volleyball', 'FIVB beach volleyball (VIS web service)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
