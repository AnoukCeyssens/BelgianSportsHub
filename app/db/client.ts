import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
export { DERIVED_ID_SCHEMES, EXTERNAL_ID_LINKS, EXTERNAL_ID_SCHEMES, isExternalIdScheme, type ExternalIdScheme } from "./schema";
