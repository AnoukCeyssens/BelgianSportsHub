import { redirect } from "react-router";

// The bare sources page (#23) became the Run sheet's Source health step (#24).
export function loader() {
  return redirect("/curate/run/source-health");
}
