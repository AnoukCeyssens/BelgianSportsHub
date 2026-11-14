-- Spec #20 review, finding I: UCI DataRide results carry no rider ID; the key
-- made of name + date of birth is now its own scheme "uci-derived" (never shown
-- as an ID). "uci" is kept for real UCI IDs (11 digits, from ranking rows).
UPDATE OR IGNORE `athlete_external_id` SET `scheme` = 'uci-derived' WHERE `scheme` = 'uci' AND instr(`value`, ' ') > 0;
--> statement-breakpoint
DELETE FROM `athlete_external_id` WHERE `scheme` = 'uci' AND instr(`value`, ' ') > 0;
--> statement-breakpoint
UPDATE OR IGNORE `merge_queue_item` SET `scheme` = 'uci-derived' WHERE `scheme` = 'uci' AND instr(`value`, ' ') > 0;
-- The uci-cycling Source row keeps id_scheme "uci": tables pasted from DataRide rankings carry real UCI IDs.
