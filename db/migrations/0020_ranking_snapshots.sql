CREATE TABLE `ranking_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`ranking` text NOT NULL,
	`sport` text NOT NULL,
	`athlete_id` text,
	`team_id` text,
	`position` integer NOT NULL,
	`points` text,
	`as_of` text NOT NULL,
	`raw_copy_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_snapshot_athlete` ON `ranking_snapshot` (`source`,`ranking`,`athlete_id`,`as_of`);--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_snapshot_team` ON `ranking_snapshot` (`source`,`ranking`,`team_id`,`as_of`);--> statement-breakpoint
ALTER TABLE `qualification_track` ADD `ranking_source` text;--> statement-breakpoint
ALTER TABLE `qualification_track` ADD `ranking` text;--> statement-breakpoint
ALTER TABLE `qualification_track` ADD `previous_has` text;