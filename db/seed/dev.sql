-- Hand-seeded Athlete for the walking skeleton (local dev and a fresh test/live
-- copy). Idempotent. Apply with `npm run db:seed:local`, or remotely with
-- `wrangler d1 execute DB --remote --env test --file=db/seed/dev.sql`.
-- The real roster seed from Team Belgium replaces this in a later slice.
INSERT OR IGNORE INTO athlete (id, name, sport, date_of_birth, note)
VALUES ('seed-nafissatou-thiam', 'Nafissatou Thiam', 'Athletics', '1994-08-19', NULL);

INSERT OR IGNORE INTO athlete_external_id (athlete_id, scheme, value) VALUES
  ('seed-nafissatou-thiam', 'world-athletics', '14290553'),
  ('seed-nafissatou-thiam', 'wikidata', 'Q2370613');
