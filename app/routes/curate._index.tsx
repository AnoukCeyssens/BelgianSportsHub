import { redirect } from "react-router";
import { WEEKLY_RUN_SHEET } from "~/domain";

// Owner-only (under /curate): the curation area opens on the weekly Run sheet's first step.
export function loader() {
  return redirect(`/curate/run/${WEEKLY_RUN_SHEET[0].key}`);
}
