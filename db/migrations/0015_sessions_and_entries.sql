CREATE TABLE `entry` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`sport` text NOT NULL,
	`event` text NOT NULL,
	`athlete_id` text,
	`team_id` text,
	`first_round` text,
	`source_url` text,
	`checked_on` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_athlete` ON `entry` (`competition_id`,`event`,`athlete_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_team` ON `entry` (`competition_id`,`event`,`team_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`timetable_version_id` text NOT NULL,
	`code` text,
	`sport` text NOT NULL,
	`date` text NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`venue_zone` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`timetable_version_id`) REFERENCES `timetable_version`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_round` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`event` text NOT NULL,
	`round` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `timetable_version` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`version` text NOT NULL,
	`published_on` text,
	`source_url` text,
	`column_mapping` text,
	`stored_at` text NOT NULL,
	`raw_copy_id` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
