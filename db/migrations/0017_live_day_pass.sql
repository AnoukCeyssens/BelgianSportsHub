CREATE TABLE `entry_round` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`round` text NOT NULL,
	`outcome` text,
	`heat` text,
	`lane` text,
	`opponent` text,
	`starts_at` text,
	`detail_checked_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entry`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_round_round` ON `entry_round` (`entry_id`,`round`);--> statement-breakpoint
CREATE TABLE `medal_standing` (
	`competition_id` text NOT NULL,
	`nation` text NOT NULL,
	`gold` integer NOT NULL,
	`silver` integer NOT NULL,
	`bronze` integer NOT NULL,
	`pasted_at` text NOT NULL,
	`raw_copy_id` text NOT NULL,
	PRIMARY KEY(`competition_id`, `nation`),
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raw_copy_id`) REFERENCES `raw_copy`(`id`) ON UPDATE no action ON DELETE no action
);
