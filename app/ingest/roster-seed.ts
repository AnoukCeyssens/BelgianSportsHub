// The roster seed (spec #20, stories 1, 2, 5, 7): Team Belgium profiles plus
// Wikidata IDs. Run once at launch and again when a Games delegation is
// announced; a re-run matches existing Athletes instead of duplicating them.
//
// `seed-roster` reads the Wikidata crosswalk and the Team Belgium sitemaps,
// then queues one `seed-athlete-profile` job per profile, so each profile is
// fetched, kept and retried on its own.
import { eq } from "drizzle-orm";
import { getDb, schema } from "~/db/client";
import { identityMatch, isSeniorInternationalPerformance, type ExternalId } from "~/domain";
import { knownIdentities } from "./identities";
import { fetchAndKeep } from "./raw-copy";
import { athleteProfileUrls, childSitemaps, parseProfile, TEAM_BELGIUM_SITEMAP_URL } from "./sources/team-belgium";
import { parseCrosswalk, WIKIDATA_CROSSWALK_URL } from "./sources/wikidata";

export type SeedAthleteProfileJob = {
  kind: "seed-athlete-profile";
  url: string;
  /** IDs Wikidata holds for this Team Belgium athlete, and the raw copy they came from. */
  crosswalk: { ids: ExternalId[]; rawCopyId: string } | null;
};

const QUEUE_BATCH_LIMIT = 100;

export async function startRosterSeed(env: Env) {
  const wikidata = await fetchAndKeep(env, "wikidata", WIKIDATA_CROSSWALK_URL);
  const crosswalk = parseCrosswalk(wikidata.text);

  const index = await fetchAndKeep(env, "team-belgium", TEAM_BELGIUM_SITEMAP_URL);
  const profileUrls = new Set<string>();
  for (const sitemapUrl of childSitemaps(index.text)) {
    const sitemap = await fetchAndKeep(env, "team-belgium", sitemapUrl);
    for (const url of athleteProfileUrls(sitemap.text)) profileUrls.add(url);
  }

  const jobs: SeedAthleteProfileJob[] = [...profileUrls].map((url) => {
    const ids = crosswalk.get(url.split("/").pop()!);
    return { kind: "seed-athlete-profile", url, crosswalk: ids ? { ids, rawCopyId: wikidata.rawCopyId } : null };
  });
  for (let i = 0; i < jobs.length; i += QUEUE_BATCH_LIMIT) {
    await env.INGEST.sendBatch(jobs.slice(i, i + QUEUE_BATCH_LIMIT).map((body) => ({ body })));
  }
}

export async function seedAthleteProfile(env: Env, job: SeedAthleteProfileJob) {
  const page = await fetchAndKeep(env, "team-belgium", job.url);
  const profile = parseProfile(page.text);

  // Only a senior international performance in an Olympic sport makes an Athlete.
  const senior = profile.results.filter(isSeniorInternationalPerformance).toSorted((a, b) => a.date.localeCompare(b.date));
  if (profile.olympicSports.length === 0 || senior.length === 0) return;
  const first = senior[0];

  const externalIds: (ExternalId & { rawCopyId: string })[] = [
    { scheme: "team-belgium", value: profile.slug, rawCopyId: page.rawCopyId },
    ...(job.crosswalk?.ids.map((x) => ({ ...x, rawCopyId: job.crosswalk!.rawCopyId })) ?? []),
  ];

  const db = getDb(env.DB);
  const match = identityMatch(
    { name: profile.name, dateOfBirth: profile.dateOfBirth, externalIds },
    await knownIdentities(env.DB),
  );

  let athleteId: string;
  if (match.kind === "queue") {
    // The seed is the source of new Athletes: nobody on the roster is this person.
    const [row] = await db
      .insert(schema.athlete)
      .values({
        name: profile.name,
        sport: profile.olympicSports.join(", "),
        dateOfBirth: profile.dateOfBirth,
        athleteSince: first.date,
        athleteSinceCompetition: first.competition,
        rawCopyId: page.rawCopyId,
      })
      .returning({ id: schema.athlete.id });
    athleteId = row.id;
  } else {
    // Already on the roster: fill gaps only, never overwrite what the owner entered.
    athleteId = match.athleteId;
    const existing = (await db.query.athlete.findFirst({ where: eq(schema.athlete.id, athleteId) }))!;
    const earlier = !existing.athleteSince || first.date < existing.athleteSince;
    await db
      .update(schema.athlete)
      .set({
        dateOfBirth: existing.dateOfBirth ?? profile.dateOfBirth,
        ...(earlier ? { athleteSince: first.date, athleteSinceCompetition: first.competition } : {}),
      })
      .where(eq(schema.athlete.id, athleteId));
  }

  // An ID that already belongs to someone (same scheme and value) is left alone.
  await db
    .insert(schema.athleteExternalId)
    .values(externalIds.map((x) => ({ athleteId, ...x })))
    .onConflictDoNothing();
}
