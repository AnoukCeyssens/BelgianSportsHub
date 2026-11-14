import { defineConfig } from "drizzle-kit";

// `npm run db:generate` diffs app/db/schema.ts against the last snapshot and
// writes a new SQL migration into db/migrations (applied by wrangler and by the
// Vitest Workers pool).
export default defineConfig({
  dialect: "sqlite",
  schema: "./app/db/schema.ts",
  out: "./db/migrations",
});
