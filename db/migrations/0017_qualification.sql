CREATE TABLE `qualification_track` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`needed` text NOT NULL,
	`has` text NOT NULL,
	`state` text NOT NULL,
	`better` text,
	`source` text,
	`checked_on` text NOT NULL,
	`changed_on` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entry`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `competition` ADD `qualification_closes_on` text;--> statement-breakpoint
ALTER TABLE `entry` ADD `qualification_status` text;--> statement-breakpoint
ALTER TABLE `entry` ADD `qualification_source` text;--> statement-breakpoint
ALTER TABLE `entry` ADD `qualification_checked_on` text;