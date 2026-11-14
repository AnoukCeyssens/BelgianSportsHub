// When an Entry was withdrawn (ticket #41): the voided-pick rule needs the
// moment, not the date the status was last checked. Every writer of
// `entry.qualification_status` spreads `withdrawalColumn(...)` into its update:
// the Withdrawn status keeps the moment already recorded (re-checking it does
// not move it) unless the owner states one; any other status clears it.
import { sql, type SQL } from "drizzle-orm";
import { schema } from "~/db/client";

/**
 * The `withdrawnAt` column for an update setting `status`. `stated` is the
 * owner's moment (ISO instant); without it a new withdrawal is stamped `now`.
 */
export function withdrawalColumn(status: string, now: Date, stated: string | null = null): { withdrawnAt: string | SQL | null } {
  if (status !== "withdrawn") return { withdrawnAt: null };
  return { withdrawnAt: stated ?? sql`coalesce(${schema.entry.withdrawnAt}, ${now.toISOString()})` };
}
