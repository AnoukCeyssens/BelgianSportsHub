import { TodaysResultsStep, TodayTomorrowStep, actOnRoundDetail, actOnTodaysResult, loadTodayTomorrow, loadTodaysResults } from "~/curate/live-pass";
import { MergeQueueStep, actOnMergeQueueItem, loadMergeQueue } from "~/curate/merge-queue";
import { PassLayout, loadPassFrame, passAction, stepIndex, type PassDefinition } from "~/curate/pass";
import { SourceHealthStep, actOnSource, loadSourceHealth } from "~/curate/source-health";
import { Link } from "react-router";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import type { Db } from "~/db/client";
import { LIVE_DAY_PASS } from "~/domain";
import type { Route } from "./+types/curate.live";

// Owner-only (under /curate). Spec #20, stories 112 and 113; ticket #38: the
// Live day pass, four steps run daily while any competition with Belgian
// Entries is Live (the weekly Run sheet links here then). Same shape as the
// weekly Run sheet (app/curate/pass.tsx), with its own "live" session.

const PASS: PassDefinition = {
  sheet: "live",
  steps: LIVE_DAY_PASS,
  path: (key) => `/curate/live/${key}`,
  title: "Live day pass",
  railLabel: "Live day pass steps",
  leftFor: "tomorrow",
  finishLabel: "Finish day pass",
};

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.step.label ?? "Live day pass"} · Live day pass · BelgianSportsHub` }];
}

async function loadSteps(db: Db, at: Date) {
  const [todayTomorrow, todaysResults, mergeQueue, sourceHealth] = await Promise.all([
    loadTodayTomorrow(db, at),
    loadTodaysResults(db, at),
    loadMergeQueue(db),
    loadSourceHealth(db, at),
  ]);
  const open = {
    "today-tomorrow": todayTomorrow.open,
    "todays-results": todaysResults.open,
    "merge-queue": mergeQueue.open,
    "source-health": sourceHealth.open,
  };
  return { todayTomorrow, todaysResults, mergeQueue, sourceHealth, open };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const index = stepIndex(PASS, params.step);
  const db = dbFrom(context);
  const at = now();
  const steps = await loadSteps(db, at);
  const shown = (key: string) => params.step === key;
  return {
    ...(await loadPassFrame(db, PASS, index, steps.open, at)),
    todayTomorrow: shown("today-tomorrow") ? steps.todayTomorrow : null,
    todaysResults: shown("todays-results") ? steps.todaysResults : null,
    mergeQueue: shown("merge-queue") ? steps.mergeQueue : null,
    sourceHealth: shown("source-health") ? steps.sourceHealth : null,
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const db = dbFrom(context);
  const at = now();
  const form = await request.formData();
  return passAction({
    db,
    pass: PASS,
    index: stepIndex(PASS, params.step),
    form,
    at,
    open: async () => (await loadSteps(db, at)).open,
    act: async (step, intent) => {
      if (step.key === "today-tomorrow") return { message: await actOnRoundDetail(db, intent, form, at) };
      if (step.key === "todays-results") return { message: await actOnTodaysResult(env, intent, form, at) };
      if (step.key === "merge-queue") return { message: await actOnMergeQueueItem(env.DB, db, intent, form) };
      if (step.key === "source-health") return { message: await actOnSource(db, env.INGEST, intent, String(form.get("source")), at) };
      throw new Response(`Unknown action ${intent}`, { status: 400 });
    },
  });
}

export default function LiveDayPass({ loaderData }: Route.ComponentProps) {
  const { live, todayTomorrow, todaysResults, mergeQueue, sourceHealth } = loaderData;
  return (
    <PassLayout
      pass={PASS}
      frame={loaderData}
      railFoot={
        <div className="sub">
          <Link to="/curate/run/source-health">Weekly curation</Link>
        </div>
      }
      banner={live.length > 0 ? <p className="live-banner">{`● Live · ${live.join(" · ")}`}</p> : null}
    >
      {todayTomorrow ? <TodayTomorrowStep data={todayTomorrow} /> : null}
      {todaysResults ? <TodaysResultsStep data={todaysResults} /> : null}
      {mergeQueue ? <MergeQueueStep data={mergeQueue} /> : null}
      {sourceHealth ? <SourceHealthStep data={sourceHealth} problemsOnly /> : null}
    </PassLayout>
  );
}
