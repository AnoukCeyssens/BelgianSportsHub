ALTER TABLE `source` ADD `sport` text;--> statement-breakpoint
ALTER TABLE `source` ADD `id_scheme` text;--> statement-breakpoint
ALTER TABLE `source` ADD `column_mapping` text;--> statement-breakpoint
ALTER TABLE `source` ADD `last_pasted_at` text;--> statement-breakpoint
-- Data (ticket #25): what the paste importer needs when an Automatic source is blocked and pasted instead.
UPDATE `source` SET `sport` = 'Speed skating', `id_scheme` = 'isu' WHERE `key` = 'isu-speed-skating';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Alpine skiing', `id_scheme` = 'fis' WHERE `key` = 'fis-alpine';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Cross-country skiing', `id_scheme` = 'fis' WHERE `key` = 'fis-cross-country';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Freestyle skiing', `id_scheme` = 'fis' WHERE `key` = 'fis-freestyle';--> statement-breakpoint
UPDATE `source` SET `sport` = 'Snowboard', `id_scheme` = 'fis' WHERE `key` = 'fis-snowboard';
