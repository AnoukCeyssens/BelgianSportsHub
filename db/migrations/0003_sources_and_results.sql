CREATE TABLE `competition` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`kind` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`city` text,
	`country` text,
	`venue_zone` text,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`raw_copy_id` text NOT NULL,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_source_ref` ON `competition` (`source`,`source_ref`);--> statement-breakpoint
CREATE TABLE `entrant` (
	`competition_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`raw_copy_id` text NOT NULL,
	PRIMARY KEY(`competition_id`, `athlete_id`),
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merge_queue_item` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`date_of_birth` text,
	`sport` text NOT NULL,
	`scheme` text NOT NULL,
	`value` text NOT NULL,
	`raw_copy_id` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`athlete_id` text,
	`resolved_at` text,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merge_queue_item_external_id` ON `merge_queue_item` (`scheme`,`value`);--> statement-breakpoint
CREATE TABLE `result` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`athlete_id` text,
	`merge_queue_item_id` text,
	`event` text NOT NULL,
	`date` text NOT NULL,
	`place` integer,
	`status` text NOT NULL,
	`performance` text,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`raw_copy_id` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merge_queue_item_id`) REFERENCES `merge_queue_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `result_source_ref` ON `result` (`source`,`source_ref`);--> statement-breakpoint
CREATE TABLE `source` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tier` text NOT NULL,
	`cadence_days` integer NOT NULL,
	`added_at` text NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_change_at` text,
	`last_failure_at` text,
	`last_error` text,
	`blocked_at` text,
	`blocked_reason` text
);
--> statement-breakpoint
-- Data: the first Automatic source (spec #20, ticket #23). Cadence is data from here on.
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES ('isu-speed-skating', 'ISU speed skating (api.isuresults.eu)', 'automatic', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
