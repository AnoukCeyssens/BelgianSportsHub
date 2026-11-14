# BelgianSportsHub

Private web app following Belgium's senior Olympic Athletes and Teams (spec: issue #20).

```sh
npm install
npm run db:migrate:local && npm run db:seed:local
npm run dev        # http://localhost:5173
npm test           # both test seams, in workerd
```

Layout, migrations, tests and deploys: [`docs/agents/conventions.md`](docs/agents/conventions.md).

## Backups and restores

Three layers, newest first (spec #20, story 121):

1. **D1 Time Travel** (built in, last 30 days): restore the live database to any minute.
   ```sh
   npx wrangler d1 time-travel info bsh-live --env live -c wrangler.jsonc          # current bookmark
   npx wrangler d1 time-travel restore bsh-live --env live -c wrangler.jsonc --timestamp=2026-11-14T08:00:00Z
   ```
   A restore overwrites the database in place; it prints the bookmark to undo it.
2. **Weekly export** (live copy, Mondays 03:00 UTC): a full SQL dump in the live R2 bucket under `backups/<instant>.sql`, last 12 kept. Restore into an **empty** database:
   ```sh
   npx wrangler r2 object get bsh-raw-live/backups/2026-11-16T03:00:00.000Z.sql --remote --file backup.sql
   npx wrangler d1 create bsh-restore     # or empty the target first
   npx wrangler d1 execute bsh-restore --remote --file backup.sql
   ```
   The dump includes `d1_migrations`, so later migrations apply on top as usual.
3. **Raw source copies** (`raw/` in the same bucket, kept forever): the last resort to rebuild imported data.
