import { Link } from "react-router";
import { QUALIFICATION_STATUS_LABELS, type QualificationStatus, type TrackState } from "~/domain";
import { formatDate, formatDayRange } from "~/format";
import type { PotentialEntry, QualificationTarget, TargetKey } from "./entries";

// The reader's view of Qualification (ticket #32): the status badge, track
// marks (✓ / ✗ / …), and the Athlete and Team pages' Qualification section
// (story 29: a Next Olympics / Next Championship switch, the badge, a
// countdown to the window closing, one progress bar per track, and the
// status's source and last check).

export function QualificationBadge({ status }: { status: QualificationStatus | null }) {
  if (!status) return <span className="sub">no status</span>;
  return <span className={`badge q-${status}`}>{QUALIFICATION_STATUS_LABELS[status]}</span>;
}

const MARK: Record<TrackState, { sign: string; className: string; label: string }> = {
  met: { sign: "✓", className: "ok", label: "met" },
  "not-met": { sign: "✗", className: "bad", label: "not met" },
  pending: { sign: "…", className: "warn", label: "pending" },
};

export function TrackMark({ state }: { state: TrackState }) {
  const m = MARK[state];
  return (
    <span className={m.className} title={m.label}>
      {m.sign}
    </span>
  );
}

/** "Source: <link> · checked 14 Nov 2026" for a curated status. */
export function StatusSource({ entry }: { entry: Pick<PotentialEntry, "source" | "checkedOn"> }) {
  if (!entry.source && !entry.checkedOn) return null;
  return (
    <p className="sub">
      {entry.source ? (
        <>
          {"Source: "}
          {/^https?:\/\//.test(entry.source) ? <a href={entry.source}>{entry.source}</a> : entry.source}
        </>
      ) : null}
      {entry.source && entry.checkedOn ? " · " : null}
      {entry.checkedOn ? `checked ${formatDate(entry.checkedOn)}` : null}
    </p>
  );
}

const TARGET_LABELS: Record<TargetKey, string> = { olympics: "Next Olympics", championship: "Next Championship" };

/** "window closes in 575 days", "window closes today", "window closed". */
function closesText(days: number | null) {
  if (days === null) return null;
  if (days > 1) return `window closes in ${days} days`;
  if (days === 1) return "window closes tomorrow";
  if (days === 0) return "window closes today";
  return "window closed";
}

/**
 * The Qualification section of an Athlete or Team page. `targets` is null
 * while the Entry is inactive; `shown` is the chosen target; `href` links a
 * target in the switch.
 */
export function QualificationSection({
  targets,
  shown,
  href,
}: {
  targets: QualificationTarget[] | null;
  shown: TargetKey;
  href: (key: TargetKey) => string;
}) {
  if (!targets) {
    return (
      <section className="qualification" aria-label="Qualification">
        <h2>Qualification</h2>
        <p className="sub">Not tracked while inactive.</p>
      </section>
    );
  }
  const target = targets.find((t) => t.key === shown) ?? targets[0];
  const c = target.competition;
  return (
    <section className="qualification" aria-label="Qualification">
      <h2>Qualification</h2>
      <nav className="seg" aria-label="Qualification target">
        {targets.map((t) => (
          <Link key={t.key} to={href(t.key)} className={t.key === target.key ? "on" : undefined} aria-current={t.key === target.key ? "page" : undefined}>
            {TARGET_LABELS[t.key]}
            {t.competition ? <span>{t.competition.name}</span> : null}
          </Link>
        ))}
      </nav>
      {c ? (
        <>
          <p className="meta">
            {[c.name, `${formatDayRange(c.startDate, c.endDate)} ${c.endDate.slice(0, 4)}`, closesText(target.closesIn)].filter(Boolean).join(" · ")}
          </p>
          {target.entries.length > 0 ? (
            target.entries.map((entry) => (
              <div key={entry.id} className="target-entry">
                <h3>
                  {entry.event} <QualificationBadge status={entry.status} />
                </h3>
                {entry.tracks.map((track) => (
                  <div key={track.id} className="track">
                    <div className="track-head">
                      <span>{track.name}</span>
                      <span className="sub">{track.needed}</span>
                    </div>
                    <div className={`bar ${track.state}`} role="progressbar" aria-label={track.name} aria-valuenow={track.progress} aria-valuemin={0} aria-valuemax={100}>
                      <i style={{ width: `${track.progress}%` }}></i>
                    </div>
                    <div className="sub">{track.has}</div>
                  </div>
                ))}
                <StatusSource entry={entry} />
              </div>
            ))
          ) : (
            <p className="sub">No Qualification status recorded yet.</p>
          )}
        </>
      ) : (
        <p className="sub">{shown === "olympics" ? "No next Olympics recorded yet." : "No next Championship recorded yet."}</p>
      )}
    </section>
  );
}
