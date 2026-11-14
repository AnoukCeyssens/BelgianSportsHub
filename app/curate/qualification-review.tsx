// Run sheet step 5, Qualification review (spec #20, stories 87 and 107;
// ticket #33): only the Entries whose ranking or track changed since their
// status was last checked, each with the change, current → suggested status
// (`suggestStatus`), source and last-checked date. The owner applies the
// suggestion, keeps the status (stamped checked today) or sets another one.
// Nothing is ever applied without the owner's action.
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { Form } from "react-router";
import { type Db, schema } from "~/db/client";
import {
  belgianDate,
  isQualificationStatus,
  meetsCriteria,
  QUALIFICATION_STATUS_LABELS,
  QUALIFICATION_STATUSES,
  rankingPlaces,
  referenceGamesOf,
  suggestStatus,
  type QualificationStatus,
  type SuggestionQuotaPlace,
  type SuggestionRanking,
} from "~/domain";
import { formatDate } from "~/format";
import { potentialEntries, type PotentialEntry } from "~/qualification/entries";
import { QualificationBadge } from "~/qualification/qualification-section";

type Change = { what: string; from: string | null; to: string; needed: string | null; on: string; ranking: string | null };

export type ReviewItem = {
  entryId: string;
  title: string;
  competition: string;
  changes: Change[];
  current: QualificationStatus | null;
  suggested: QualificationStatus | null;
  /** The source written with an applied suggestion: the ranking or track it came from. */
  suggestedSource: string | null;
  source: string | null;
  checkedOn: string | null;
};

type Snapshot = typeof schema.rankingSnapshot.$inferSelect;

/** A Qualification status was last checked before this Belgian date (or never). */
const after = (date: string, checkedOn: string | null) => checkedOn === null || date > checkedOn;

export async function loadQualificationReview(db: Db, now: Date) {
  const today = belgianDate(now);
  const c = schema.competition;
  const targets = (
    await db
      .select()
      .from(c)
      .where(and(or(eq(c.kind, "championship"), eq(c.kind, "games")), gte(c.endDate, today)))
  ).filter((x) => referenceGamesOf(x) === null);
  const entries = await potentialEntries(
    db,
    targets.map((t) => t.id),
    now,
  );
  const snapshots = await snapshotsOf(db, entries);
  const quotaPlaces = await quotaPlacesOf();

  const items: ReviewItem[] = [];
  for (const entry of entries) {
    const target = targets.find((t) => t.id === entry.competitionId)!;
    const own = snapshots.filter((s) => (s.athleteId ?? s.teamId) === entry.who.id && s.sport.toLowerCase() === entry.sport.toLowerCase());
    const latestOn = (key: string) => own.filter((s) => `${s.source}|${s.ranking}` === key);

    const changes: Change[] = entry.tracks
      .filter((t) => after(t.changedOn, entry.checkedOn))
      .map((t) => ({ what: t.name, from: t.previousHas, to: t.has, needed: t.needed, on: t.changedOn, ranking: t.ranking?.split("|")[1] ?? null }));
    // Rankings no track follows: listed when their latest snapshot moved since the last check.
    const followed = new Set(entry.tracks.map((t) => t.ranking));
    for (const key of new Set(own.map((s) => `${s.source}|${s.ranking}`))) {
      if (followed.has(key)) continue;
      const [latest, previous] = latestOn(key);
      if (!after(belgianDate(new Date(latest.recordedAt)), entry.checkedOn) || previous?.position === latest.position) continue;
      changes.push({ what: latest.ranking, from: previous ? `#${previous.position}` : null, to: snapshotText(latest), needed: null, on: latest.asOf, ranking: null });
    }
    if (changes.length === 0) continue;

    const linked = entry.tracks.flatMap((t) => {
      const [latest] = t.ranking ? latestOn(t.ranking) : [];
      return latest ? [{ track: t, latest }] : [];
    })[0];
    const ranking: SuggestionRanking | null = linked ? { position: linked.latest.position, places: rankingPlaces(linked.track.needed) } : null;
    const rivals = entries.filter(
      (x) => x.competitionId === entry.competitionId && x.event.toLowerCase() === entry.event.toLowerCase() && meetsCriteria(x.tracks),
    );
    const suggested = suggestStatus(
      {
        id: entry.id,
        status: entry.status,
        target: target.kind === "games" ? "games" : "championship",
        windowClosed: target.qualificationClosesOn !== null && target.qualificationClosesOn < today,
        belgianCandidates: rivals.length,
      },
      entry.tracks,
      ranking,
      quotaPlaces.filter((p) => p.competitionId === entry.competitionId && p.event.toLowerCase() === entry.event.toLowerCase()),
    );
    const first = entry.tracks.find((t) => after(t.changedOn, entry.checkedOn));
    items.push({
      entryId: entry.id,
      title: `${entry.who.name} · ${entry.event}`,
      competition: target.name,
      changes,
      current: entry.status,
      suggested,
      suggestedSource: linked
        ? `${linked.latest.ranking}, ${formatDate(linked.latest.asOf)}`
        : first
          ? (first.source ?? `${first.name}, ${formatDate(first.changedOn)}`)
          : null,
      source: entry.source,
      checkedOn: entry.checkedOn,
    });
  }
  return { items, statuses: QUALIFICATION_STATUSES.map((s) => ({ value: s, label: QUALIFICATION_STATUS_LABELS[s] })), open: items.length };
}

export type QualificationReviewData = Awaited<ReturnType<typeof loadQualificationReview>>;

/** Every snapshot of these Entries' Athletes and Teams, newest first. */
async function snapshotsOf(db: Db, entries: PotentialEntry[]): Promise<Snapshot[]> {
  const athleteIds = entries.filter((e) => e.who.kind === "athlete").map((e) => e.who.id);
  const teamIds = entries.filter((e) => e.who.kind === "team").map((e) => e.who.id);
  if (athleteIds.length + teamIds.length === 0) return [];
  const s = schema.rankingSnapshot;
  return db
    .select()
    .from(s)
    .where(or(inArray(s.athleteId, athleteIds), inArray(s.teamId, teamIds)))
    .orderBy(desc(s.asOf));
}

/** Belgium's Quota places per Games event (#36 stores them); none until then. */
async function quotaPlacesOf(): Promise<(SuggestionQuotaPlace & { competitionId: string; event: string })[]> {
  return [];
}

const snapshotText = (s: Snapshot) => (s.points ? `#${s.position} · ${s.points} pts` : `#${s.position}`);

/** One owner action on a reviewed Entry; returns the session-log message. */
export async function actOnQualificationReview(db: Db, intent: string, form: FormData, now: Date): Promise<string> {
  const entryId = String(form.get("entryId") ?? "");
  const item = (await loadQualificationReview(db, now)).items.find((i) => i.entryId === entryId);
  if (!item) throw new Response("No such Entry to review", { status: 404 });
  const today = belgianDate(now);
  const e = schema.entry;
  const label = (s: QualificationStatus | null) => (s ? QUALIFICATION_STATUS_LABELS[s] : "no status");
  switch (intent) {
    case "apply-suggestion": {
      if (!item.suggested) throw new Response("Nothing suggested for this Entry", { status: 400 });
      await db
        .update(e)
        .set({ qualificationStatus: item.suggested, qualificationSource: item.suggestedSource, qualificationCheckedOn: today })
        .where(eq(e.id, entryId));
      return `${item.title}: ${label(item.current)} → ${label(item.suggested)}`;
    }
    case "keep-status":
      await db.update(e).set({ qualificationCheckedOn: today }).where(eq(e.id, entryId));
      return `${item.title}: kept ${label(item.current)}`;
    case "set-status": {
      const status = String(form.get("status") ?? "");
      const source = String(form.get("source") ?? "").trim();
      if (!isQualificationStatus(status)) throw new Response("Unknown Qualification status", { status: 400 });
      if (!source) throw new Response("A status needs its source", { status: 400 });
      await db.update(e).set({ qualificationStatus: status, qualificationSource: source, qualificationCheckedOn: today }).where(eq(e.id, entryId));
      return `${item.title}: set ${label(status)}`;
    }
    default:
      throw new Response(`Unknown action ${intent}`, { status: 400 });
  }
}

export function QualificationReviewStep({ data }: { data: QualificationReviewData }) {
  if (data.items.length === 0) return null;
  return (
    <div className="card">
      <table aria-label="Entries to review" className="review">
        <thead>
          <tr>
            <th>Entry</th>
            <th>What changed</th>
            <th>Status</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.entryId}>
              <td>
                <b>{item.title}</b>
                <div className="sub">{item.competition}</div>
              </td>
              <td>
                {item.changes.map((c, i) => (
                  <div key={i}>
                    {`${c.what}: ${c.from ?? "–"} → ${c.to}${c.needed ? ` (need ${c.needed})` : ""}`}
                    <div className="sub">{`changed ${formatDate(c.on)}${c.ranking ? ` · ${c.ranking}` : ""}`}</div>
                  </div>
                ))}
              </td>
              <td>
                <QualificationBadge status={item.current} />
                {item.suggested && item.suggested !== item.current ? (
                  <>
                    {" → "}
                    <QualificationBadge status={item.suggested} />
                  </>
                ) : item.suggested ? (
                  <div className="sub">no change suggested</div>
                ) : null}
              </td>
              <td className="sub">
                {item.source ?? "–"}
                <br />
                {item.checkedOn ? `checked ${formatDate(item.checkedOn)}` : "never checked"}
              </td>
              <td>
                <Form method="post" className="actions">
                  <input type="hidden" name="entryId" value={item.entryId} />
                  {item.suggested && item.suggested !== item.current ? (
                    <button type="submit" name="intent" value="apply-suggestion">
                      Apply suggestion
                    </button>
                  ) : null}
                  <button type="submit" name="intent" value="keep-status" className="secondary">
                    Keep
                  </button>
                </Form>
                <Form method="post" className="actions">
                  <input type="hidden" name="entryId" value={item.entryId} />
                  <select name="status" defaultValue={item.suggested ?? item.current ?? "on-track"} aria-label="Another status">
                    {data.statuses.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input name="source" defaultValue={item.suggestedSource ?? item.source ?? ""} aria-label="Source" required />
                  <button type="submit" name="intent" value="set-status" className="secondary">
                    Set
                  </button>
                </Form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
