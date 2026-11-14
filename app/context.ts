import { createContext, type RouterContextProvider } from "react-router";
import { getDb } from "./db/client";

export type CloudflareContext = { env: Env; ctx: ExecutionContext };

/** Bindings and execution context of the current request; set by workers/app.ts. */
export const cloudflareContext = createContext<CloudflareContext>();

/** The D1 database for a loader or action: `const db = dbFrom(context)`. */
export function dbFrom(context: Readonly<RouterContextProvider>) {
  return getDb(context.get(cloudflareContext).env.DB);
}
