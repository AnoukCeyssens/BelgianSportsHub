CREATE TABLE `games_sport_window` (
	`competition_id` text NOT NULL,
	`sport` text NOT NULL,
	`first_day` text NOT NULL,
	`last_day` text NOT NULL,
	`source_url` text NOT NULL,
	`checked_on` text NOT NULL,
	PRIMARY KEY(`competition_id`, `sport`),
	FOREIGN KEY (`competition_id`) REFERENCES `competition`(`id`) ON UPDATE no action ON DELETE cascade
);
