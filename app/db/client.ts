import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
export { EXTERNAL_ID_LINKS, EXTERNAL_ID_SCHEMES } from "./schema";
