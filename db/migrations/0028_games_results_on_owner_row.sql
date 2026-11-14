-- Spec #20 review, finding F: a source's own Olympic Games competition is the
-- Games the app follows. Results, roster places and entrants that sources
-- wrote against their own Games rows move to the owner's Games row whose
-- dates overlap (each result keeping its sport), and the emptied source rows
-- go. Source Games rows without an owner row are left as they are.
UPDATE `result` SET
  `sport` = COALESCE(`sport`, (SELECT a.`sport` FROM `competition` a WHERE a.`id` = `result`.`competition_id`)),
  `competition_id` = (
    SELECT o.`id` FROM `competition` a JOIN `competition` o
      ON o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`
    WHERE a.`id` = `result`.`competition_id` ORDER BY o.`start_date` LIMIT 1)
WHERE `competition_id` IN (
  SELECT a.`id` FROM `competition` a WHERE a.`kind` = 'games' AND a.`source` <> 'owner' AND EXISTS (
    SELECT 1 FROM `competition` o WHERE o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`));
--> statement-breakpoint
UPDATE OR IGNORE `roster_member` SET `competition_id` = (
    SELECT o.`id` FROM `competition` a JOIN `competition` o
      ON o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`
    WHERE a.`id` = `roster_member`.`competition_id` ORDER BY o.`start_date` LIMIT 1)
WHERE `competition_id` IN (
  SELECT a.`id` FROM `competition` a WHERE a.`kind` = 'games' AND a.`source` <> 'owner' AND EXISTS (
    SELECT 1 FROM `competition` o WHERE o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`));
--> statement-breakpoint
-- A roster place the owner's row already had: the source row's copy goes.
DELETE FROM `roster_member` WHERE `competition_id` IN (
  SELECT a.`id` FROM `competition` a WHERE a.`kind` = 'games' AND a.`source` <> 'owner' AND EXISTS (
    SELECT 1 FROM `competition` o WHERE o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`));
--> statement-breakpoint
UPDATE OR IGNORE `entrant` SET `competition_id` = (
    SELECT o.`id` FROM `competition` a JOIN `competition` o
      ON o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`
    WHERE a.`id` = `entrant`.`competition_id` ORDER BY o.`start_date` LIMIT 1)
WHERE `competition_id` IN (
  SELECT a.`id` FROM `competition` a WHERE a.`kind` = 'games' AND a.`source` <> 'owner' AND EXISTS (
    SELECT 1 FROM `competition` o WHERE o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`));
--> statement-breakpoint
DELETE FROM `entrant` WHERE `competition_id` IN (
  SELECT a.`id` FROM `competition` a WHERE a.`kind` = 'games' AND a.`source` <> 'owner' AND EXISTS (
    SELECT 1 FROM `competition` o WHERE o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`));
--> statement-breakpoint
-- The emptied source Games rows (anything else still pointing at one keeps it).
DELETE FROM `competition` WHERE `id` IN (
  SELECT a.`id` FROM `competition` a WHERE a.`kind` = 'games' AND a.`source` <> 'owner' AND EXISTS (
    SELECT 1 FROM `competition` o WHERE o.`source` = 'owner' AND o.`kind` = 'games' AND o.`start_date` <= a.`end_date` AND o.`end_date` >= a.`start_date`))
  AND NOT EXISTS (SELECT 1 FROM `result` x WHERE x.`competition_id` = `competition`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `roster_member` x WHERE x.`competition_id` = `competition`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `entrant` x WHERE x.`competition_id` = `competition`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `participation_curation` x WHERE x.`competition_id` = `competition`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `entry` x WHERE x.`competition_id` = `competition`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `timetable_version` x WHERE x.`competition_id` = `competition`.`id`);
