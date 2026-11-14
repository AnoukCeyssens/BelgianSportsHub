CREATE TABLE `raw_copy` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`url` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_copy_r2_key_unique` ON `raw_copy` (`r2_key`);