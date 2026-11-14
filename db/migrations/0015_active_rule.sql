CREATE TABLE `active_fact` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text,
	`team_id` text,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`source` text NOT NULL,
	`checked_on` text NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_fact_athlete` ON `active_fact` (`athlete_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `active_fact_team` ON `active_fact` (`team_id`,`kind`);--> statement-breakpoint
ALTER TABLE `athlete` ADD `profile_latest_performance_on` text;--> statement-breakpoint
ALTER TABLE `team` DROP COLUMN `dissolved_on`;