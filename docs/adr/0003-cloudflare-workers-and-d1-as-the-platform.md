# Cloudflare Workers and D1 are the platform

The whole app runs on Cloudflare: Workers (paid plan, about $5/month) for the React Router v7 app and the scheduled ingest, D1 (SQLite) for the database, R2 for raw source copies and backups, Queues for one ingest job per source, and Cloudflare Access in front of the owner area. We chose this so that a single owner, who already spends 2–3.5 h a week curating, has no server to patch, all within the €10/month budget. We considered a small Hetzner VM (about €6.59/month with backups), which has no runtime limits but needs looking after, and free tiers (Vercel with Neon or Supabase), which have once-a-day cron with ±59 min drift and databases that pause or scale to zero.

## Consequences

- Every outbound `fetch()` carries a `CF-Worker` header that cannot be removed, so some sources may refuse ingest. Each automatic source gets a test fetch while it is built. A source that refuses drops to the Assisted tier (paste importer) rather than gaining a second fetch host.
- Each Worker invocation has 128 MB of memory. Large inputs such as the FIS points-list ZIPs must be streamed, and each source runs as its own queued job so one source cannot starve or break another.
- The app is served from a custom domain from day one, because an installed PWA is tied to its origin.

See [Stack and hosting](https://github.com/AnoukCeyssens/BelgianSportsHub/issues/13).
