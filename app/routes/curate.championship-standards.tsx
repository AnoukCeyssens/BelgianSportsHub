import { eq } from "drizzle-orm";
import { data, Form, Link, redirect } from "react-router";
import { dbFrom } from "~/context";
import { schema } from "~/db/client";
import { belgianDate } from "~/domain";
import { now } from "~/clock";
import type { Route } from "./+types/curate.championship-standards";

// Owner-only (under /curate); spec #20, stories 43 and 44; tickets #31 and
// #35. The owner records when a Championship's or the Games' qualification
// system or entry standards are expected and, once out, when and where they
// were published and what they say. Publishing moves the competition from
// Standards to Qualification. Served at /curate/championships/:id/standards
// and /curate/games/:id/standards; for the Games, a line headed "<Sport>:"
// shows only under that sport's chip. Each recorded value needs the source
// it was read on (URL) and is stamped checked on the day it is saved (#20
// review): the expected date, the published standards and the window's close.

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
    expectedSource: c.standardsExpectedSource ?? "",
    publishedOn: c.standardsPublishedOn ?? "",
    url: c.standardsUrl ?? "",
    standards: c.standardsText ?? "",
    closesOn: c.qualificationClosesOn ?? "",
    closesSource: c.qualificationClosesSource ?? "",
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https?:\/\/\S+$/;

export async function action({ context, params, request }: Route.ActionArgs) {
  const c = await championship(context, params.competitionId, request);
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim() || null;
  const date = (name: string) => {
    const value = field(name);
    if (value !== null && !DATE.test(value)) throw data(`${name} must be a date (YYYY-MM-DD)`, { status: 400 });
    return value;
  };
  /** A recorded value's source: required (a web address) when the value is set, dropped with it. */
  const source = (value: string | null, name: string, what: string) => {
    if (value === null) return null;
    const url = field(name);
    if (url === null || !URL_PATTERN.test(url)) throw data(`Give the web address ${what} was read on`, { status: 400 });
    return url;
  };
  const today = belgianDate(now());
  const expectedOn = date("expectedOn");
  const publishedOn = date("publishedOn");
  const closesOn = date("closesOn");
  await dbFrom(context)
    .update(schema.competition)
    .set({
      standardsExpectedOn: expectedOn,
      standardsExpectedSource: source(expectedOn, "expectedSource", "the expected publication date"),
      standardsExpectedCheckedOn: expectedOn && today,
      standardsPublishedOn: publishedOn,
      standardsUrl: publishedOn ? source(publishedOn, "url", "the published standards") : field("url"),
      standardsText: field("standards"),
      standardsCheckedOn: publishedOn && today,
      qualificationClosesOn: closesOn,
      qualificationClosesSource: source(closesOn, "closesSource", "the window's closing date"),
      qualificationClosesCheckedOn: closesOn && today,
    })
    .where(eq(schema.competition.id, c.id));
  return redirect(c.page, 303);
}

export default function ChampionshipStandards({ loaderData }: Route.ComponentProps) {
  const { page, name, expectedOn, expectedSource, publishedOn, url, standards, closesOn, closesSource } = loaderData;
  return (
    <>
      <h1>Standards</h1>
      <p className="meta">
        <Link to={page}>{name}</Link>
      </p>
      <p className="sub">
        Until a publication date is filled in, readers see only the expected date. Write one line per event or Qualification track. Every date
        needs the page it was read on; saving stamps it checked today.
      </p>
      <Form method="post" className="standards-form">
        <label>
          Expected publication date
          <input type="date" name="expectedOn" defaultValue={expectedOn} />
        </label>
        <label>
          Expected date read on (URL)
          <input type="url" name="expectedSource" defaultValue={expectedSource} />
        </label>
        <label>
          Published on
          <input type="date" name="publishedOn" defaultValue={publishedOn} />
        </label>
        <label>
          Published standards (URL)
          <input type="url" name="url" defaultValue={url} />
        </label>
        <label>
          Qualification window closes on
          <input type="date" name="closesOn" defaultValue={closesOn} />
        </label>
        <label>
          Closing date read on (URL)
          <input type="url" name="closesSource" defaultValue={closesSource} />
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
