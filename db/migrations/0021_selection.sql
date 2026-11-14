ALTER TABLE `entry` ADD `selector` text;--> statement-breakpoint
ALTER TABLE `entry` ADD `selection_source` text;--> statement-breakpoint
ALTER TABLE `entry` ADD `selection_kind` text;--> statement-breakpoint
ALTER TABLE `entry` ADD `selected_on` text;--> statement-breakpoint
ALTER TABLE `entry` ADD `selection_raw_copy_id` text REFERENCES raw_copy(id);