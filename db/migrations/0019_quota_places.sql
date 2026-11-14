CREATE TABLE `quota_place` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`sport` text NOT NULL,
	`event` text NOT NULL,
	`number` integer NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`reallocated` integer DEFAULT false NOT NULL,
	`earned_via` text,
	`entry_id` text,
	`source` text NOT NULL,
	`checked_on` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entry`(`id`) ON UPDATE no action ON DELETE set null
);
