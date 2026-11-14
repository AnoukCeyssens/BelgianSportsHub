// Bindings that exist only in the Vitest Workers pool (see vitest.config.ts).
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

// Binary fixtures, byte for byte (the `bytes-fixtures` plugin in vitest.config.ts).
declare module "*?bytes" {
  const bytes: Uint8Array<ArrayBuffer>;
  export default bytes;
}
