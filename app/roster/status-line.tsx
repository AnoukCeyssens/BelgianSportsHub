import { Link } from "react-router";
import type { ActiveReason, ActiveStatus } from "~/domain";
import { formatDate } from "~/format";
import type { ActiveFactKind, ActiveFactRow } from "./active";

/** The curated fact each reason rests on. */
const FACT_OF: Partial<Record<ActiveReason, ActiveFactKind>> = {
  hold: "hold",
  retired: "retirement",
  dissolved: "dissolution",
  "nationality-change": "nationality-change",
};

/** "Active · Hold until 31 Mar 2027: Pregnancy", "Inactive · retired 1 Oct 2026". */
export function activeStatusText(status: ActiveStatus, fact: ActiveFactRow | null): string {
  const latest = status.latestPerformanceOn ? formatDate(status.latestPerformanceOn) : null;
  const on = fact ? formatDate(fact.date) : "";
  switch (status.because) {
    case "recent-performance":
      return `Active · latest senior international performance ${latest}`;
    case "hold":
      return `Active · Hold until ${on}${fact?.note ? `: ${fact.note}` : ""}`;
    case "retired":
      return `Inactive · retired ${on}`;
    case "dissolved":
      return `Inactive · dissolved ${on}`;
    case "nationality-change":
      return `Inactive · changed sporting nationality${fact?.note ? ` to ${fact.note}` : ""} on ${on}`;
    case "no-recent-performance":
      return `Inactive · no senior international performance in the last 12 months${latest ? ` (latest ${latest})` : ""}`;
  }
}

/** The fact a status rests on, if any. */
export function factBehind(status: ActiveStatus, facts: Map<ActiveFactKind, ActiveFactRow>): ActiveFactRow | null {
  const kind = FACT_OF[status.because];
  return kind ? (facts.get(kind) ?? null) : null;
}

/** The status line of an Athlete or Team page, with its source, last check and the owner's edit link. */
export function ActiveStatusLine({ status, fact, editHref }: { status: ActiveStatus; fact: ActiveFactRow | null; editHref: string }) {
  return (
    <div className="sub active-status">
      {activeStatusText(status, fact)}
      {fact ? (
        <>
          {" · Source: "}
          {/^https?:\/\//.test(fact.source) ? <a href={fact.source}>{fact.source}</a> : fact.source}
          {` · checked ${formatDate(fact.checkedOn)}`}
        </>
      ) : null}
      {" · "}
      <Link to={editHref}>Edit status</Link>
    </div>
  );
}
