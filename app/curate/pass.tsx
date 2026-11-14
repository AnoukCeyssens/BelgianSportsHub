// One curation pass (spec #20, stories 99–103, 106, 112 and 113): the weekly
// Run sheet (`/curate/run/<step>`) and the Live day pass (`/curate/live/<step>`)
// share everything but their steps. A pass is a `PassDefinition`; its route
// declares the per-step loaders, intents and components and hands the rest to
// this module: the step lookup, the frame (progress, Live competitions,
// session log), the action plumbing ("next" logs a pass and moves on, the
// last step finishes the session; any other intent is logged), and the layout
// (rail, current step with Back / Next, time left and session log).
import type { ReactNode } from "react";
import { Form, Link, redirect } from "react-router";
import { liveCompetitions } from "~/competition/placed-rounds";
import type { Db } from "~/db/client";
import { runSheetProgress, type RunSheetStep } from "~/domain";
import { formatBelgianClock, formatMinutes } from "~/format";
import { currentSession, finishSession, logAction, type Sheet } from "./session";

export type PassDefinition = {
  /** The session the pass logs to ("weekly", "live"). */
  sheet: Sheet;
  steps: readonly RunSheetStep[];
  /** Where a step lives, e.g. `/curate/run/<key>`. */
  path: (key: string) => string;
  /** The rail's heading and its landmark label. */
  title: string;
  railLabel: string;
  /** "next week" / "tomorrow": when a passed step's items come round again. */
  leftFor: string;
  finishLabel: string;
};

/** Open items per step key; steps not listed have none. */
export type OpenCounts = Record<string, number>;

export function stepIndex(pass: PassDefinition, key: string): number {
  const index = pass.steps.findIndex((s) => s.key === key);
  if (index < 0) throw new Response("No such step", { status: 404 });
  return index;
}

function withOpenCounts(pass: PassDefinition, open: OpenCounts) {
  return pass.steps.map((s) => ({ ...s, open: open[s.key] ?? 0 }));
}

/** What every pass page shows around its step: progress, the Live competitions and the session log. */
export async function loadPassFrame(db: Db, pass: PassDefinition, index: number, open: OpenCounts, at: Date) {
  const [session, live] = await Promise.all([currentSession(db, pass.sheet), liveCompetitions(db, at)]);
  const progress = runSheetProgress(withOpenCounts(pass, open), session.passed);
  return {
    index,
    step: progress.steps[index],
    progress,
    live: live.map((c) => c.name),
    log: session.log.map((e) => ({ ...e, time: formatBelgianClock(e.at) })),
  };
}

export type PassFrame = Awaited<ReturnType<typeof loadPassFrame>>;

/**
 * A pass's action: "next" (logging a pass when items are left; the last step
 * finishes the session and starts over), or one owner action on the step,
 * done by `act` and logged with its message.
 */
export async function passAction(input: {
  db: Db;
  pass: PassDefinition;
  index: number;
  form: FormData;
  at: Date;
  /** The open counts now, read only for "next". */
  open: () => Promise<OpenCounts>;
  /** Does one owner action on the step; returns the log message and, if not the step itself, where to go. */
  act: (step: RunSheetStep, intent: string) => Promise<{ message: string; to?: string }>;
}) {
  const { db, pass, index, form, at } = input;
  const step = pass.steps[index];
  const intent = String(form.get("intent"));

  if (intent === "next") {
    const left = (await input.open())[step.key] ?? 0;
    if (left > 0) await logAction(db, pass.sheet, { step: step.key, action: "pass", message: `${step.label}: left ${left} for ${pass.leftFor}` }, at);
    if (index === pass.steps.length - 1) {
      await finishSession(db, pass.sheet, at);
      return redirect(pass.path(pass.steps[0].key), 303);
    }
    return redirect(pass.path(pass.steps[index + 1].key), 303);
  }

  const { message, to } = await input.act(step, intent);
  await logAction(db, pass.sheet, { step: step.key, action: intent, message }, at);
  return redirect(to ?? pass.path(step.key), 303);
}

/** The pass page: rail, the current step (its items as children) with Back / Next, time left and the session log. */
export function PassLayout({
  pass,
  frame,
  railFoot,
  banner,
  children,
}: {
  pass: PassDefinition;
  frame: PassFrame;
  /** Under the rail's progress (the Live day pass links back to weekly curation). */
  railFoot?: ReactNode;
  /** Above the step's heading (the Live banner). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const { index, step, progress, log } = frame;
  const total = progress.steps.length;
  const last = index === total - 1;
  return (
    <div className="runsheet">
      <nav className="rail" aria-label={pass.railLabel}>
        <h2>{pass.title}</h2>
        <ol>
          {progress.steps.map((s, i) => (
            <li key={s.key} className={[i === index ? "cur" : null, s.done ? "done" : null].filter(Boolean).join(" ") || undefined}>
              <Link to={pass.path(s.key)} aria-current={i === index ? "step" : undefined}>
                <span className="num">{s.done ? "✓" : i + 1}</span>
                <span>
                  {s.label}
                  <small>{`${s.estimate} · ${s.open} open`}</small>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <progress value={progress.doneCount} max={total} aria-label="Steps done" />
        <div className="sub">{`${progress.doneCount} of ${total} steps done`}</div>
        {railFoot}
      </nav>

      <section className="step">
        {banner}
        <h1>{`${index + 1}. ${step.label}`}</h1>
        <p className="meta">
          {step.purpose} <span className="sub">{`${step.estimate} · ${step.open} open`}</span>
        </p>
        {children}
        {step.open === 0 ? <p className="donebox">✓ Nothing left in this step.</p> : null}
        <Form method="post" className="foot">
          {index > 0 ? (
            <Link className="back" to={pass.path(progress.steps[index - 1].key)}>
              ← Back
            </Link>
          ) : (
            <span />
          )}
          <button type="submit" name="intent" value="next">
            {last ? pass.finishLabel : step.open > 0 ? `Leave ${step.open} for ${pass.leftFor}, continue →` : "Next step →"}
          </button>
        </Form>
      </section>

      <aside className="session">
        <h2>Estimated time left</h2>
        <b className="big">{formatMinutes(progress.minutesLeft)}</b>
        <h2>Session log</h2>
        {log.length === 0 ? (
          <p className="sub">Nothing yet.</p>
        ) : (
          <ol className="log">
            {log.map((e, i) => (
              <li key={i}>{`${e.time} · ${e.message}`}</li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
