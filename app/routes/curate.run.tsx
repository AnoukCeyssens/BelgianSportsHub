import { Form, Link, redirect } from "react-router";
import { ManualResultsStep, actOnManualResult, loadManualResults } from "~/curate/manual-results";
import { MergeQueueStep, actOnMergeQueueItem, loadMergeQueue } from "~/curate/merge-queue";
import { PasteImportsStep, actOnPasteImport, loadPasteImporter, loadPasteImports } from "~/curate/paste-imports";
import { MonthlyChecklistStep, actOnChecklist, loadMonthlyChecklist } from "~/curate/monthly-checklist";
import { SchedulesStep, actOnSchedules, loadSchedules } from "~/curate/schedules";
import { actOnTimetable, loadTimetableReview } from "~/curate/timetables";
import { SelectionsLikelyStep, actOnLikely, loadSelectionsLikely } from "~/curate/selections-likely";
import { actOnSelection, loadSelectionReview } from "~/curate/selections";
import { currentSession, finishSession, logAction } from "~/curate/session";
import { SourceHealthStep, actOnSource, loadSourceHealth } from "~/curate/source-health";
import { liveCompetitions } from "~/competition/placed-rounds";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import type { Db } from "~/db/client";
import { LIVE_DAY_PASS, runSheetProgress, WEEKLY_RUN_SHEET } from "~/domain";
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
  const [sourceHealth, pasteImports, manualResults, mergeQueue, selectionsLikely, schedules, monthlyChecklist] = await Promise.all([
    loadSourceHealth(db, at),
    loadPasteImports(db, at),
    loadManualResults(db, at),
    loadMergeQueue(db),
    loadSelectionsLikely(db, at),
    loadSchedules(db, at),
    loadMonthlyChecklist(db, at),
  ]);
  const open: Record<string, number> = {
    "source-health": sourceHealth.open,
    "paste-imports": pasteImports.open,
    "manual-results": manualResults.open,
    "merge-queue": mergeQueue.open,
    "selections-likely": selectionsLikely.open,
    schedules: schedules.open,
    "monthly-checklist": monthlyChecklist.open,
  };
  return {
    sourceHealth,
    pasteImports,
    manualResults,
    mergeQueue,
    selectionsLikely,
    schedules,
    monthlyChecklist,
    withOpenCounts: WEEKLY_RUN_SHEET.map((s) => ({ ...s, open: open[s.key] ?? 0 })),
  };
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const index = stepIndex(params.step);
  const db = dbFrom(context);
  const at = now();
  const [steps, session, live] = await Promise.all([loadSteps(db, at), currentSession(db, SHEET), liveCompetitions(db, at)]);
  const { sourceHealth, pasteImports, manualResults, mergeQueue, selectionsLikely, schedules, monthlyChecklist } = steps;
  const progress = runSheetProgress(steps.withOpenCounts, session.passed);
  return {
    index,
    step: progress.steps[index],
    progress,
    // The Live day pass is offered while a competition with Belgian Entries is Live (ticket #38).
    live: live.map((c) => c.name),
    log: session.log.map((e) => ({ ...e, time: formatBelgianClock(e.at) })),
    sourceHealth: params.step === "source-health" ? sourceHealth : null,
    pasteImports: params.step === "paste-imports" ? pasteImports : null,
    pasteImporter:
      params.step === "paste-imports" ? await loadPasteImporter(context.get(cloudflareContext).env, db, new URL(request.url).searchParams) : null,
    manualResults: params.step === "manual-results" ? manualResults : null,
    mergeQueue: params.step === "merge-queue" ? mergeQueue : null,
    selectionsLikely: params.step === "selections-likely" ? selectionsLikely : null,
    selectionReview:
      params.step === "selections-likely" ? await loadSelectionReview(context.get(cloudflareContext).env, db, new URL(request.url).searchParams, at) : null,
    schedules: params.step === "schedules" ? schedules : null,
    timetableReview:
      params.step === "schedules" ? await loadTimetableReview(context.get(cloudflareContext).env, db, new URL(request.url).searchParams) : null,
    monthlyChecklist: params.step === "monthly-checklist" ? monthlyChecklist : null,
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
  let to = runPath(step.key);
  if (step.key === "source-health") message = await actOnSource(db, env.INGEST, intent, String(form.get("source")), at);
  else if (step.key === "paste-imports") ({ message, to } = await actOnPasteImport(env, db, intent, form, at));
  else if (step.key === "manual-results") message = await actOnManualResult(env, intent, form, at);
  else if (step.key === "merge-queue") message = await actOnMergeQueueItem(env.DB, db, intent, form);
  else if (step.key === "selections-likely" && intent.endsWith("-selection")) ({ message, to } = await actOnSelection(env, intent, form, at));
  else if (step.key === "selections-likely") message = await actOnLikely(db, intent, form, at);
  else if (step.key === "schedules" && intent.endsWith("-timetable")) ({ message, to } = await actOnTimetable(env, intent, form, at));
  else if (step.key === "schedules") message = await actOnSchedules(env, intent, form, at);
  else if (step.key === "monthly-checklist") message = await actOnChecklist(db, intent, form, at);
  else throw new Response(`Unknown action ${intent}`, { status: 400 });
  await logAction(db, SHEET, { step: step.key, action: intent, message }, at);
  return redirect(to, 303);
}

export default function RunSheet({ loaderData }: Route.ComponentProps) {
  const {
    index,
    step,
    progress,
    live,
    log,
    sourceHealth,
    pasteImports,
    pasteImporter,
    manualResults,
    mergeQueue,
    selectionsLikely,
    selectionReview,
    schedules,
    timetableReview,
    monthlyChecklist,
  } = loaderData;
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
        {live.length > 0 ? (
          <p className="live-banner">
            {`● Live · ${live.join(" · ")} · `}
            <Link to={`/curate/live/${LIVE_DAY_PASS[0].key}`}>Live day pass</Link>
          </p>
        ) : null}
        <h1>{`${index + 1}. ${step.label}`}</h1>
        <p className="meta">
          {step.purpose} <span className="sub">{`${step.estimate} · ${step.open} open`}</span>
        </p>
        {sourceHealth ? <SourceHealthStep data={sourceHealth} /> : null}
        {pasteImports ? <PasteImportsStep data={pasteImports} importer={pasteImporter} /> : null}
        {manualResults ? <ManualResultsStep data={manualResults} /> : null}
        {mergeQueue ? <MergeQueueStep data={mergeQueue} /> : null}
        {selectionsLikely ? <SelectionsLikelyStep data={selectionsLikely} review={selectionReview} /> : null}
        {schedules ? <SchedulesStep data={schedules} review={timetableReview} /> : null}
        {monthlyChecklist ? <MonthlyChecklistStep data={monthlyChecklist} /> : null}
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
