import { Form, Link, redirect } from "react-router";
import { TodaysResultsStep, TodayTomorrowStep, actOnRoundDetail, actOnTodaysResult, loadTodayTomorrow, loadTodaysResults } from "~/curate/live-pass";
import { MergeQueueStep, actOnMergeQueueItem, loadMergeQueue } from "~/curate/merge-queue";
import { currentSession, finishSession, logAction } from "~/curate/session";
import { SourceHealthStep, actOnSource, loadSourceHealth } from "~/curate/source-health";
import { liveCompetitions } from "~/competition/placed-rounds";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import type { Db } from "~/db/client";
import { LIVE_DAY_PASS, runSheetProgress } from "~/domain";
import { formatBelgianClock, formatMinutes } from "~/format";
import type { Route } from "./+types/curate.live";

// Owner-only (under /curate). Spec #20, stories 112 and 113; ticket #38: the
// Live day pass, four steps run daily while any competition with Belgian
// Entries is Live (the weekly Run sheet links here then). Same shape as the
// weekly Run sheet: rail, current step with Back / Next, time left and the
// session log (its own "live" session).

const SHEET = "live";
const passPath = (key: string) => `/curate/live/${key}`;

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.step.label ?? "Live day pass"} · Live day pass · BelgianSportsHub` }];
}

function stepIndex(key: string) {
  const index = LIVE_DAY_PASS.findIndex((s) => s.key === key);
  if (index < 0) throw new Response("No such step", { status: 404 });
  return index;
}

async function loadSteps(db: Db, at: Date) {
  const [todayTomorrow, todaysResults, mergeQueue, sourceHealth] = await Promise.all([
    loadTodayTomorrow(db, at),
    loadTodaysResults(db, at),
    loadMergeQueue(db),
    loadSourceHealth(db, at),
  ]);
  const open: Record<string, number> = {
    "today-tomorrow": todayTomorrow.open,
    "todays-results": todaysResults.open,
    "merge-queue": mergeQueue.open,
    "source-health": sourceHealth.open,
  };
  return { todayTomorrow, todaysResults, mergeQueue, sourceHealth, withOpenCounts: LIVE_DAY_PASS.map((s) => ({ ...s, open: open[s.key] ?? 0 })) };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const index = stepIndex(params.step);
  const db = dbFrom(context);
  const at = now();
  const [steps, session, live] = await Promise.all([loadSteps(db, at), currentSession(db, SHEET), liveCompetitions(db, at)]);
  const progress = runSheetProgress(steps.withOpenCounts, session.passed);
  const shown = (key: string) => params.step === key;
  return {
    index,
    step: progress.steps[index],
    progress,
    live: live.map((c) => c.name),
    log: session.log.map((e) => ({ ...e, time: formatBelgianClock(e.at) })),
    todayTomorrow: shown("today-tomorrow") ? steps.todayTomorrow : null,
    todaysResults: shown("todays-results") ? steps.todaysResults : null,
    mergeQueue: shown("merge-queue") ? steps.mergeQueue : null,
    sourceHealth: shown("source-health") ? steps.sourceHealth : null,
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const index = stepIndex(params.step);
  const step = LIVE_DAY_PASS[index];
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const { env } = context.get(cloudflareContext);
  const db = dbFrom(context);
  const at = now();

  if (intent === "next") {
    const left = (await loadSteps(db, at)).withOpenCounts[index].open;
    if (left > 0) await logAction(db, SHEET, { step: step.key, action: "pass", message: `${step.label}: left ${left} for tomorrow` }, at);
    if (index === LIVE_DAY_PASS.length - 1) {
      await finishSession(db, SHEET, at);
      return redirect(passPath(LIVE_DAY_PASS[0].key), 303);
    }
    return redirect(passPath(LIVE_DAY_PASS[index + 1].key), 303);
  }

  let message: string;
  if (step.key === "today-tomorrow") message = await actOnRoundDetail(db, intent, form, at);
  else if (step.key === "todays-results") message = await actOnTodaysResult(env, intent, form, at);
  else if (step.key === "merge-queue") message = await actOnMergeQueueItem(env.DB, db, intent, form);
  else if (step.key === "source-health") message = await actOnSource(db, env.INGEST, intent, String(form.get("source")), at);
  else throw new Response(`Unknown action ${intent}`, { status: 400 });
  await logAction(db, SHEET, { step: step.key, action: intent, message }, at);
  return redirect(passPath(step.key), 303);
}

export default function LiveDayPass({ loaderData }: Route.ComponentProps) {
  const { index, step, progress, live, log, todayTomorrow, todaysResults, mergeQueue, sourceHealth } = loaderData;
  const total = progress.steps.length;
  const last = index === total - 1;
  return (
    <div className="runsheet">
      <nav className="rail" aria-label="Live day pass steps">
        <h2>Live day pass</h2>
        <ol>
          {progress.steps.map((s, i) => (
            <li key={s.key} className={[i === index ? "cur" : null, s.done ? "done" : null].filter(Boolean).join(" ") || undefined}>
              <Link to={passPath(s.key)} aria-current={i === index ? "step" : undefined}>
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
        <div className="sub">
          <Link to="/curate/run/source-health">Weekly curation</Link>
        </div>
      </nav>

      <section className="step">
        {live.length > 0 ? <p className="live-banner">{`● Live · ${live.join(" · ")}`}</p> : null}
        <h1>{`${index + 1}. ${step.label}`}</h1>
        <p className="meta">
          {step.purpose} <span className="sub">{`${step.estimate} · ${step.open} open`}</span>
        </p>
        {todayTomorrow ? <TodayTomorrowStep data={todayTomorrow} /> : null}
        {todaysResults ? <TodaysResultsStep data={todaysResults} /> : null}
        {mergeQueue ? <MergeQueueStep data={mergeQueue} /> : null}
        {sourceHealth ? <SourceHealthStep data={sourceHealth} problemsOnly /> : null}
        {step.open === 0 ? <p className="donebox">✓ Nothing left in this step.</p> : null}
        <Form method="post" className="foot">
          {index > 0 ? (
            <Link className="back" to={passPath(progress.steps[index - 1].key)}>
              ← Back
            </Link>
          ) : (
            <span />
          )}
          <button type="submit" name="intent" value="next">
            {last ? "Finish day pass" : step.open > 0 ? `Leave ${step.open} for tomorrow, continue →` : "Next step →"}
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
