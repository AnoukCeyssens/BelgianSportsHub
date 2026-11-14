CREATE TABLE `run_sheet_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`at` text NOT NULL,
	`step` text NOT NULL,
	`action` text NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `run_sheet_session`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `run_sheet_session` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
ALTER TABLE `source` ADD `acknowledged_at` text;