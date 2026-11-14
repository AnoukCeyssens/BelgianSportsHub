ALTER TABLE `athlete` ADD `athlete_since` text;--> statement-breakpoint
ALTER TABLE `athlete` ADD `athlete_since_competition` text;--> statement-breakpoint
ALTER TABLE `athlete` ADD `raw_copy_id` text REFERENCES raw_copy(id);--> statement-breakpoint
ALTER TABLE `athlete_external_id` ADD `raw_copy_id` text REFERENCES raw_copy(id);