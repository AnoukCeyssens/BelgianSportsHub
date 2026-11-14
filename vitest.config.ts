import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { reactRouter } from "@react-router/dev/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Every test runs inside workerd (the Cloudflare Workers runtime), with the
// bindings from wrangler.jsonc's top level simulated locally: a real D1 (with
// db/migrations applied by tests/support/setup.ts) and a real R2.
// Storage is isolated per test file.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("./db/migrations", import.meta.url)));
  return {
    plugins: [
      bytesFixtures(),
      // Provides `virtual:react-router/server-build` to the Worker entry under test.
      reactRouter(),
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
          // Scheduled triggers never fire in tests; tests call the handlers directly.
        },
      }),
    ],
    resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/support/setup.ts"],
    },
  };
});

/**
 * `import zip from "./list.zip?bytes"` yields the file as a Uint8Array, byte
 * for byte: the loader for binary source fixtures (FIS points-list ZIPs).
 */
function bytesFixtures(): Plugin {
  return {
    name: "bytes-fixtures",
    enforce: "pre",
    load(id) {
      const [path, query] = id.split("?");
      if (query !== "bytes") return null;
      const base64 = readFileSync(path).toString("base64");
      return `export default Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));`;
    },
  };
}
