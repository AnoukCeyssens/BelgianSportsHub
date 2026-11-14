import { eq } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import type { Route } from "./+types/curate.championship-standards";

// Owner-only (under /curate); spec #20, stories 43 and 44; tickets #31 and
// #35. The owner records when a Championship's or the Games' qualification
// system or entry standards are expected and, once out, when and where they
// were published and what they say. Publishing moves the competition from
// Standards to Qualification. Served at /curate/championships/:id/standards
// and /curate/games/:id/standards; for the Games, a line headed "<Sport>:"
// shows only under that sport's chip.

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Standards · ${loaderData?.name ?? "Championship"} · BelgianSportsHub` }];
}

/** The reader page of each kind of competition that has standards. */
const PAGE = { championship: "/championship", games: "/games" } as const;

async function championship(context: Route.LoaderArgs["context"], id: string, request: Request) {
  const c = schema.competition;
  const [row] = await dbFrom(context).select().from(c).where(eq(c.id, id));
  const kind = new URL(request.url).pathname.startsWith("/curate/games/") ? "games" : "championship";
  if (!row || row.kind !== kind) throw data(kind === "games" ? "No such Games" : "No such Championship", { status: 404 });
  return { ...row, page: `${PAGE[kind]}/${row.id}` };
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const c = await championship(context, params.competitionId, request);
  return {
    page: c.page,
    name: c.name,
    expectedOn: c.standardsExpectedOn ?? "",
    publishedOn: c.standardsPublishedOn ?? "",
    url: c.standardsUrl ?? "",
    standards: c.standardsText ?? "",
    closesOn: c.qualificationClosesOn ?? "",
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function action({ context, params, request }: Route.ActionArgs) {
  const c = await championship(context, params.competitionId, request);
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim() || null;
  const date = (name: string) => {
    const value = field(name);
    if (value !== null && !DATE.test(value)) throw data(`${name} must be a date (YYYY-MM-DD)`, { status: 400 });
    return value;
  };
  await dbFrom(context)
    .update(schema.competition)
    .set({
      standardsExpectedOn: date("expectedOn"),
      standardsPublishedOn: date("publishedOn"),
      standardsUrl: field("url"),
      standardsText: field("standards"),
      qualificationClosesOn: date("closesOn"),
    })
    .where(eq(schema.competition.id, c.id));
  return redirect(c.page, 303);
}

export default function ChampionshipStandards({ loaderData }: Route.ComponentProps) {
  const { page, name, expectedOn, publishedOn, url, standards, closesOn } = loaderData;
  return (
    <>
      <h1>Standards</h1>
      <p className="meta">
        <Link to={page}>{name}</Link>
      </p>
      <p className="sub">
        Until a publication date is filled in, readers see only the expected date. Write one line per event or Qualification track.
      </p>
      <Form method="post" className="standards-form">
        <label>
          Expected publication date
          <input type="date" name="expectedOn" defaultValue={expectedOn} />
        </label>
        <label>
          Published on
          <input type="date" name="publishedOn" defaultValue={publishedOn} />
        </label>
        <label>
          Source URL
          <input type="url" name="url" defaultValue={url} />
        </label>
        <label>
          Qualification window closes on
          <input type="date" name="closesOn" defaultValue={closesOn} />
        </label>
        <label>
          Standards
          <textarea name="standards" rows={8} defaultValue={standards} />
        </label>
        <button type="submit">Save</button>
      </Form>
    </>
  );
}
