-- Hand-seeded Athlete for the walking skeleton (local dev and a fresh test/live
-- copy). Idempotent. Apply with `npm run db:seed:local`, or remotely with
-- `wrangler d1 execute DB --remote --env test --file=db/seed/dev.sql`.
-- Deployed copies get their roster from the Team Belgium seed (/curation/roster-seed),
-- which matches this Athlete (World Athletics ID, or name + date of birth) instead of duplicating her.
INSERT OR IGNORE INTO athlete (id, name, sport, date_of_birth, note)
VALUES ('seed-nafissatou-thiam', 'Nafissatou Thiam', 'Athletics', '1994-08-19', NULL);

INSERT OR IGNORE INTO athlete_external_id (athlete_id, scheme, value) VALUES
  ('seed-nafissatou-thiam', 'world-athletics', '14428253'),
  ('seed-nafissatou-thiam', 'wikidata', 'Q4167514');
