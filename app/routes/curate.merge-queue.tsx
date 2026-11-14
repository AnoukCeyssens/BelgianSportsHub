import { redirect } from "react-router";

// The bare merge-queue page (#23) became the Run sheet's Merge queue step (#24).
export function loader() {
  return redirect("/curate/run/merge-queue");
}
