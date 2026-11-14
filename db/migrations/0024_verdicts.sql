CREATE TABLE `boic_target` (
	`competition_id` text PRIMARY KEY NOT NULL,
	`medals` integer,
	`top8` integer,
	`stated_on` text NOT NULL,
	`source_url` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `entry` ADD `withdrawn_at` text;