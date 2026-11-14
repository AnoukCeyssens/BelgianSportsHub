-- Data: the FIS points-list Automatic sources (spec #20, ticket #44), one per discipline, fetched weekly. Cadence is data.
INSERT INTO `source` (`key`, `name`, `tier`, `cadence_days`, `added_at`) VALUES
	('fis-alpine', 'FIS alpine skiing (points-list ZIP)', 'automatic', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('fis-cross-country', 'FIS cross-country skiing (points-list ZIP)', 'automatic', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('fis-freestyle', 'FIS freestyle skiing (points-list ZIP)', 'automatic', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('fis-snowboard', 'FIS snowboard (points-list ZIP)', 'automatic', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
