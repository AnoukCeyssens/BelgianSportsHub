ALTER TABLE `source` ADD `sport` text;--> statement-breakpoint
ALTER TABLE `source` ADD `id_scheme` text;--> statement-breakpoint
ALTER TABLE `source` ADD `column_mapping` text;--> statement-breakpoint
ALTER TABLE `source` ADD `last_pasted_at` text;--> statement-breakpoint
-- Data (ticket #25): what the paste importer needs to know when ISU speed skating is blocked and pasted instead.
UPDATE `source` SET `sport` = 'Speed skating', `id_scheme` = 'isu' WHERE `key` = 'isu-speed-skating';
