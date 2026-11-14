import { Form, Link, redirect } from "react-router";
import { ManualResultsStep, actOnManualResult, loadManualResults } from "~/curate/manual-results";
import { MergeQueueStep, actOnMergeQueueItem, loadMergeQueue } from "~/curate/merge-queue";
import { currentSession, finishSession, logAction } from "~/curate/session";
import { SourceHealthStep, actOnSource, loadSourceHealth } from "~/curate/source-health";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import type { Db } from "~/db/client";
import { runSheetProgress, WEEKLY_RUN_SHEET } from "~/domain";
import { formatBelgianClock, formatMinutes } from "~/format";
import type { Route } from "./+types/curate.run";

// Owner-only (under /curate). Spec #20, stories 99–103 and 106; ticket #24:
// the weekly Run sheet. A left rail of the eight steps (estimate, open count,
// ✓ when empty or passed, progress bar); the current step's purpose, items
// and Back / Next; the estimated time left and the session log. Steps not
// built yet have no items, so they show as empty.

const SHEET = "weekly";
const runPath = (key: string) => `/curate/run/${key}`;

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.step.label ?? "Run sheet"} · Run sheet · BelgianSportsHub` }];
}

function stepIndex(key: string) {
  const index = WEEKLY_RUN_SHEET.findIndex((s) => s.key === key);
  if (index < 0) throw new Response("No such step", { status: 404 });
  return index;
}

/** Each built step's items; the others have none yet. */
async function loadSteps(db: Db, at: Date) {
  const [sourceHealth, manualResults, mergeQueue] = await Promise.all([loadSourceHealth(db, at), loadManualResults(db, at), loadMergeQueue(db)]);
  const open: Record<string, number> = {
    "source-health": sourceHealth.open,
    "manual-results": manualResults.open,
    "merge-queue": mergeQueue.open,
  };
  return { sourceHealth, manualResults, mergeQueue, withOpenCounts: WEEKLY_RUN_SHEET.map((s) => ({ ...s, open: open[s.key] ?? 0 })) };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const index = stepIndex(params.step);
  const db = dbFrom(context);
  const at = now();
  const [steps, session] = await Promise.all([loadSteps(db, at), currentSession(db, SHEET)]);
  const { sourceHealth, manualResults, mergeQueue } = steps;
  const progress = runSheetProgress(steps.withOpenCounts, session.passed);
  return {
    index,
    step: progress.steps[index],
    progress,
    log: session.log.map((e) => ({ ...e, time: formatBelgianClock(e.at) })),
    sourceHealth: params.step === "source-health" ? sourceHealth : null,
    manualResults: params.step === "manual-results" ? manualResults : null,
    mergeQueue: params.step === "merge-queue" ? mergeQueue : null,
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const index = stepIndex(params.step);
  const step = WEEKLY_RUN_SHEET[index];
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const { env } = context.get(cloudflareContext);
  const db = dbFrom(context);
  const at = now();

  if (intent === "next") {
    const left = (await loadSteps(db, at)).withOpenCounts[index].open;
    if (left > 0) await logAction(db, SHEET, { step: step.key, action: "pass", message: `${step.label}: left ${left} for next week` }, at);
    const last = index === WEEKLY_RUN_SHEET.length - 1;
    if (last) {
      await finishSession(db, SHEET, at);
      return redirect(runPath(WEEKLY_RUN_SHEET[0].key), 303);
    }
    return redirect(runPath(WEEKLY_RUN_SHEET[index + 1].key), 303);
  }

  let message: string;
  if (step.key === "source-health") message = await actOnSource(db, env.INGEST, intent, String(form.get("source")), at);
  else if (step.key === "manual-results") message = await actOnManualResult(env, intent, form, at);
  else if (step.key === "merge-queue") message = await actOnMergeQueueItem(env.DB, db, intent, form);
  else throw new Response(`Unknown action ${intent}`, { status: 400 });
  await logAction(db, SHEET, { step: step.key, action: intent, message }, at);
  return redirect(runPath(step.key), 303);
}

export default function RunSheet({ loaderData }: Route.ComponentProps) {
  const { index, step, progress, log, sourceHealth, manualResults, mergeQueue } = loaderData;
  const total = progress.steps.length;
  const last = index === total - 1;
  return (
    <div className="runsheet">
      <nav className="rail" aria-label="Run sheet steps">
        <h2>Weekly curation</h2>
        <ol>
          {progress.steps.map((s, i) => (
            <li key={s.key} className={[i === index ? "cur" : null, s.done ? "done" : null].filter(Boolean).join(" ") || undefined}>
              <Link to={runPath(s.key)} aria-current={i === index ? "step" : undefined}>
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
      </nav>

      <section className="step">
        <h1>{`${index + 1}. ${step.label}`}</h1>
        <p className="meta">
          {step.purpose} <span className="sub">{`${step.estimate} · ${step.open} open`}</span>
        </p>
        {sourceHealth ? <SourceHealthStep data={sourceHealth} /> : null}
        {manualResults ? <ManualResultsStep data={manualResults} /> : null}
        {mergeQueue ? <MergeQueueStep data={mergeQueue} /> : null}
        {step.open === 0 ? <p className="donebox">✓ Nothing left in this step.</p> : null}
        <Form method="post" className="foot">
          {index > 0 ? (
            <Link className="back" to={runPath(progress.steps[index - 1].key)}>
              ← Back
            </Link>
          ) : (
            <span />
          )}
          <button type="submit" name="intent" value="next">
            {last ? "Finish session" : step.open > 0 ? `Leave ${step.open} for next week, continue →` : "Next step →"}
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
