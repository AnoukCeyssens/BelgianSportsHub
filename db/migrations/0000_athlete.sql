CREATE TABLE `athlete` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`date_of_birth` text,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `athlete_external_id` (
	`athlete_id` text NOT NULL,
	`scheme` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`scheme`, `value`),
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE no action
);
