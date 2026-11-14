CREATE TABLE `roster_member` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`competition_id` text NOT NULL,
	`athlete_id` text,
	`merge_queue_item_id` text,
	`raw_copy_id` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merge_queue_item_id`) REFERENCES `merge_queue_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roster_member_athlete` ON `roster_member` (`team_id`,`competition_id`,`athlete_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `roster_member_merge_queue_item` ON `roster_member` (`team_id`,`competition_id`,`merge_queue_item_id`);--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`event` text NOT NULL,
	`kind` text NOT NULL,
	`dissolved_on` text,
	`raw_copy_id` text,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_key_unique` ON `team` (`key`);--> statement-breakpoint
ALTER TABLE `result` ADD `team_id` text REFERENCES team(id);