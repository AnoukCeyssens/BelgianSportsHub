-- #20 review, finding J: every curated value carries its source and checked date.
-- participation_curation.source_url becomes NOT NULL; rows from before have no
-- recorded source and say so ("unrecorded (before the #20 review)").
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_participation_curation` (
	`competition_id` text PRIMARY KEY NOT NULL,
	`added_at` text,
	`decision` text,
	`source_url` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_participation_curation`("competition_id", "added_at", "decision", "source_url", "checked_at") SELECT "competition_id", "added_at", "decision", coalesce("source_url", 'unrecorded (before the #20 review)'), "checked_at" FROM `participation_curation`;--> statement-breakpoint
DROP TABLE `participation_curation`;--> statement-breakpoint
ALTER TABLE `__new_participation_curation` RENAME TO `participation_curation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `competition` ADD `standards_expected_source` text;--> statement-breakpoint
ALTER TABLE `competition` ADD `standards_expected_checked_on` text;--> statement-breakpoint
ALTER TABLE `competition` ADD `standards_checked_on` text;--> statement-breakpoint
ALTER TABLE `competition` ADD `qualification_closes_source` text;--> statement-breakpoint
ALTER TABLE `competition` ADD `qualification_closes_checked_on` text;--> statement-breakpoint
ALTER TABLE `entry_round` ADD `detail_source` text;--> statement-breakpoint
ALTER TABLE `entry_round` ADD `outcome_source` text;--> statement-breakpoint
ALTER TABLE `entry_round` ADD `outcome_checked_at` text;