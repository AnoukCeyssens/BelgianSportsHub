CREATE TABLE `expectation_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`source` text NOT NULL,
	`place_from` integer NOT NULL,
	`place_to` integer NOT NULL,
	`method` text,
	`as_of` text NOT NULL,
	`source_url` text,
	`raw_copy_id` text,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expectation_snapshot_entry_source_as_of` ON `expectation_snapshot` (`entry_id`,`source`,`as_of`);--> statement-breakpoint
CREATE TABLE `personal_pick` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`shortcut` text NOT NULL,
	`place_from` integer NOT NULL,
	`place_to` integer NOT NULL,
	`picked_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entry`(`id`) ON UPDATE no action ON DELETE cascade
);
