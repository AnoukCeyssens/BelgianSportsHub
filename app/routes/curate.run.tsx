import { Link } from "react-router";
import { ManualResultsStep, actOnManualResult, loadManualResults } from "~/curate/manual-results";
import { MergeQueueStep, actOnMergeQueueItem, loadMergeQueue } from "~/curate/merge-queue";
import { QualificationReviewStep, actOnQualificationReview, loadQualificationReview } from "~/curate/qualification-review";
import { PasteImportsStep, actOnPasteImport, loadPasteImporter, loadPasteImports } from "~/curate/paste-imports";
import { MonthlyChecklistStep, actOnChecklist, loadMonthlyChecklist } from "~/curate/monthly-checklist";
import { PassLayout, loadPassFrame, passAction, stepIndex, type PassDefinition } from "~/curate/pass";
import { SchedulesStep, actOnSchedules, loadSchedules } from "~/curate/schedules";
import { actOnTimetable, loadTimetableReview } from "~/curate/timetables";
import { SelectionsLikelyStep, actOnLikely, loadSelectionsLikely } from "~/curate/selections-likely";
import { actOnSelection, loadSelectionReview } from "~/curate/selections";
import { SourceHealthStep, actOnSource, loadSourceHealth } from "~/curate/source-health";
import { now } from "~/clock";
import { cloudflareContext, dbFrom } from "~/context";
import type { Db } from "~/db/client";
import { LIVE_DAY_PASS, WEEKLY_RUN_SHEET } from "~/domain";
import type { Route } from "./+types/curate.run";

// Owner-only (under /curate). Spec #20, stories 99–103 and 106; ticket #24:
// the weekly Run sheet. A left rail of the eight steps (estimate, open count,
// ✓ when empty or passed, progress bar); the current step's purpose, items
// and Back / Next; the estimated time left and the session log. The layout
// and the session plumbing are shared with the Live day pass
// (app/curate/pass.tsx); this route declares the steps' items and intents.

const PASS: PassDefinition = {
  sheet: "weekly",
  steps: WEEKLY_RUN_SHEET,
  path: (key) => `/curate/run/${key}`,
  title: "Weekly curation",
  railLabel: "Run sheet steps",
  leftFor: "next week",
  finishLabel: "Finish session",
};

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.step.label ?? "Run sheet"} · Run sheet · BelgianSportsHub` }];
}

/** Each built step's items and open count. */
async function loadSteps(db: Db, at: Date) {
  const [sourceHealth, pasteImports, manualResults, mergeQueue, qualificationReview, selectionsLikely, schedules, monthlyChecklist] = await Promise.all([
    loadSourceHealth(db, at),
    loadPasteImports(db, at),
    loadManualResults(db, at),
    loadMergeQueue(db),
    loadQualificationReview(db, at),
    loadSelectionsLikely(db, at),
    loadSchedules(db, at),
    loadMonthlyChecklist(db, at),
  ]);
  const open = {
    "source-health": sourceHealth.open,
    "paste-imports": pasteImports.open,
    "manual-results": manualResults.open,
    "merge-queue": mergeQueue.open,
    "qualification-review": qualificationReview.open,
    "selections-likely": selectionsLikely.open,
    schedules: schedules.open,
    "monthly-checklist": monthlyChecklist.open,
  };
  return { sourceHealth, pasteImports, manualResults, mergeQueue, qualificationReview, selectionsLikely, schedules, monthlyChecklist, open };
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const index = stepIndex(PASS, params.step);
  const db = dbFrom(context);
  const { env } = context.get(cloudflareContext);
  const search = new URL(request.url).searchParams;
  const at = now();
  const steps = await loadSteps(db, at);
  const shown = (key: string) => params.step === key;
  return {
    ...(await loadPassFrame(db, PASS, index, steps.open, at)),
    sourceHealth: shown("source-health") ? steps.sourceHealth : null,
    pasteImports: shown("paste-imports") ? steps.pasteImports : null,
    pasteImporter: shown("paste-imports") ? await loadPasteImporter(env, db, search) : null,
    manualResults: shown("manual-results") ? steps.manualResults : null,
    mergeQueue: shown("merge-queue") ? steps.mergeQueue : null,
    qualificationReview: shown("qualification-review") ? steps.qualificationReview : null,
    selectionsLikely: shown("selections-likely") ? steps.selectionsLikely : null,
    selectionReview: shown("selections-likely") ? await loadSelectionReview(env, db, search, at) : null,
    schedules: shown("schedules") ? steps.schedules : null,
    timetableReview: shown("schedules") ? await loadTimetableReview(env, db, search) : null,
    monthlyChecklist: shown("monthly-checklist") ? steps.monthlyChecklist : null,
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const index = stepIndex(PASS, params.step);
  const form = await request.formData();
  const { env } = context.get(cloudflareContext);
  const db = dbFrom(context);
  const at = now();
  return passAction({
    db,
    pass: PASS,
    index,
    form,
    at,
    open: async () => (await loadSteps(db, at)).open,
    act: async (step, intent) => {
      if (step.key === "source-health") return { message: await actOnSource(db, env.INGEST, intent, String(form.get("source")), at) };
      if (step.key === "paste-imports") return actOnPasteImport(env, db, intent, form, at);
      if (step.key === "manual-results") return { message: await actOnManualResult(env, intent, form, at) };
      if (step.key === "merge-queue") return { message: await actOnMergeQueueItem(env.DB, db, intent, form) };
      if (step.key === "qualification-review") return { message: await actOnQualificationReview(db, intent, form, at) };
      if (step.key === "selections-likely" && intent.endsWith("-selection")) return actOnSelection(env, intent, form, at);
      if (step.key === "selections-likely") return { message: await actOnLikely(db, intent, form, at) };
      if (step.key === "schedules" && intent.endsWith("-timetable")) return actOnTimetable(env, intent, form, at);
      if (step.key === "schedules") return { message: await actOnSchedules(env, intent, form, at) };
      if (step.key === "monthly-checklist") return { message: await actOnChecklist(db, intent, form, at) };
      throw new Response(`Unknown action ${intent}`, { status: 400 });
    },
  });
}

export default function RunSheet({ loaderData }: Route.ComponentProps) {
  const {
    live,
    sourceHealth,
    pasteImports,
    pasteImporter,
    manualResults,
    mergeQueue,
    qualificationReview,
    selectionsLikely,
    selectionReview,
    schedules,
    timetableReview,
    monthlyChecklist,
  } = loaderData;
  return (
    <PassLayout
      pass={PASS}
      frame={loaderData}
      banner={
        // The Live day pass is offered while a competition with Belgian Entries is Live (ticket #38).
        live.length > 0 ? (
          <p className="live-banner">
            {`● Live · ${live.join(" · ")} · `}
            <Link to={`/curate/live/${LIVE_DAY_PASS[0].key}`}>Live day pass</Link>
          </p>
        ) : null
      }
    >
      {sourceHealth ? <SourceHealthStep data={sourceHealth} /> : null}
      {pasteImports ? <PasteImportsStep data={pasteImports} importer={pasteImporter} /> : null}
      {manualResults ? <ManualResultsStep data={manualResults} /> : null}
      {mergeQueue ? <MergeQueueStep data={mergeQueue} /> : null}
      {qualificationReview ? <QualificationReviewStep data={qualificationReview} /> : null}
      {selectionsLikely ? <SelectionsLikelyStep data={selectionsLikely} review={selectionReview} /> : null}
      {schedules ? <SchedulesStep data={schedules} review={timetableReview} /> : null}
      {monthlyChecklist ? <MonthlyChecklistStep data={monthlyChecklist} /> : null}
    </PassLayout>
  );
}
