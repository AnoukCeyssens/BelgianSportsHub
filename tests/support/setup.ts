import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, vi } from "vitest";

// Runs before each test file: brings the (per-file, isolated) D1 up to the
// latest schema in db/migrations. Already-applied migrations are skipped.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Undo fixClock() and stubOutboundFetch() after every test.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
