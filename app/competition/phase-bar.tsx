import { Link } from "react-router";
import { PHASE_LABELS, PHASES, type Phase } from "~/domain";

// The five-step Phase bar shared by the Championship and Games pages (spec
// #20, stories 41 and 42). The current phase is marked "now"; it and the
// earlier phases are links (`?phase=`), later phases are greyed text.

export function PhaseBar({ current, shown, href }: { current: Phase; shown: Phase; href: (phase: Phase) => string }) {
  const reachable = PHASES.indexOf(current);
  return (
    <nav className="phases" aria-label="Phases">
      {PHASES.map((phase, i) => {
        const now = phase === current ? <span className="now">● now</span> : null;
        return i <= reachable ? (
          <Link key={phase} to={href(phase)} className={phase === shown ? "on" : undefined} aria-current={phase === shown ? "page" : undefined}>
            {PHASE_LABELS[phase]}
            {now}
          </Link>
        ) : (
          <span key={phase} className="later">
            {PHASE_LABELS[phase]}
          </span>
        );
      })}
    </nav>
  );
}
