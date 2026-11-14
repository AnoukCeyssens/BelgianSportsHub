import { Form, redirect } from "react-router";
import { cloudflareContext } from "~/context";
import type { IngestJob } from "~/ingest/queue";
import type { Route } from "./+types/curate.roster-seed";

// Owner action (spec #20, stories 1 and 7): seed the roster from Team Belgium
// at launch, and refresh it when a Games delegation is announced. The work
// runs on the ingest queue; re-running never duplicates Athletes.

export function meta() {
  return [{ title: "Roster seed · BelgianSportsHub" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return { queued: new URL(request.url).searchParams.has("queued") };
}

export async function action({ context }: Route.ActionArgs) {
  const job: IngestJob = { kind: "seed-roster" };
  await context.get(cloudflareContext).env.INGEST.send(job);
  return redirect("/curate/roster-seed?queued=1", 303);
}

export default function RosterSeed({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1>Roster seed</h1>
      <p className="meta">
        Reads every Team Belgium athlete profile (ID, name, date of birth, sport) and the Wikidata IDs linked to it.
        Profiles with a senior international performance in an Olympic sport become Athletes; Athletes already on
        the roster are matched, not duplicated.
      </p>
      <Form method="post">
        <button type="submit">Refresh roster from Team Belgium</button>
      </Form>
      {loaderData.queued ? (
        <p className="note">Queued. Athletes appear on the Athlete tab as their profiles are read.</p>
      ) : null}
    </>
  );
}
