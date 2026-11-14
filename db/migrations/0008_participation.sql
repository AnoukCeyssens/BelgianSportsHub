CREATE TABLE `participation_curation` (
	`competition_id` text PRIMARY KEY NOT NULL,
	`added_at` text,
	`decision` text,
	`source_url` text,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `competition` ADD `series` text;