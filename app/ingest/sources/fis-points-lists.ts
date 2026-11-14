// Alpine, cross-country, freestyle and snowboard from the public FIS
// points-list ZIPs (research/winter-sport-sources; spec #20 story 88, fetched
// weekly by policy, see #11). One Source per discipline, one adapter each.
//
// One run, two requests:
// 1. the discipline's points-list page, for the newest full list ZIP and the
//    date it becomes valid; when the last successful run came after that date
//    the list is already in, and the run stops here;
// 2. the ZIP, streamed (never held whole): competitors (`com`), events
//    (`evt`), races (`rac`) and results (`res`) are tab-separated files in it.
//    Only Belgian result rows are kept while reading; points (`pts`) are left
//    for rankings (#33).
// Only senior international competitions are written: the Olympic Games, the
// World Championships, World Cups and the continental cups. FIS races,
// national championships, junior and youth categories, qualification heats
// and the like are left out (GLOSSARY "Senior international performance").
// A list holds every race of the season so far, so each run rewrites the same
// rows; sourceRefs keep them from duplicating. FIS lists carry no entry lists.
import type { CompetitionKind, Person, ResultStatus, SourceAdapter, SourceRun } from "../source-adapter";
import { zipEntries } from "../zip-stream";

const FIS = "https://www.fis-ski.com/DB";

/** FIS category codes (Fiscategory.txt) of senior international competitions. */
const KIND_BY_CATEGORY: Record<string, CompetitionKind> = {
  OWG: "games",
  WSC: "championship",
  // World Cup, its stage races and speed events.
  WC: "circuit",
  SWC: "circuit",
  COM: "circuit",
  // Continental cups, premium levels included.
  ...Object.fromEntries(
    ["EC", "ECP", "ECOM", "NAC", "NACP", "SAC", "SACP", "ANC", "ANCP", "FEC", "AC", "ACP", "COC", "SCOC", "OPA", "SCAN", "UST", "EEC", "BC", "SC", "SEE"].map(
      (code) => [code, "circuit" as const],
    ),
  ),
};
const KIND_RANK: CompetitionKind[] = ["games", "championship", "circuit"];

type Discipline = { sport: string; page: string };

export const fisAlpine = pointsListAdapter({ sport: "Alpine skiing", page: `${FIS}/alpine-skiing/fis-points-lists.html` });
export const fisCrossCountry = pointsListAdapter({ sport: "Cross-country skiing", page: `${FIS}/cross-country/fis-points-lists.html` });
export const fisFreestyle = pointsListAdapter({ sport: "Freestyle skiing", page: `${FIS}/freestyle-freeski/fis-points-lists.html` });
export const fisSnowboard = pointsListAdapter({ sport: "Snowboard", page: `${FIS}/snowboard/fis-points-lists.html` });

function pointsListAdapter(discipline: Discipline): SourceAdapter {
  return {
    async run(run) {
      const newest = await newestList(run, discipline.page);
      if (run.since && newest.validFrom < run.since.toISOString().slice(0, 10)) return;
      const zip = await run.fetchStream(newest.url);
      const list = await readList(zip.body);
      await writeBelgianRows(run, discipline, list, zip.rawCopyId);
    },
  };
}

/** The newest full list on a points-list page: newest first, "Valid from" before its links. */
async function newestList(run: SourceRun, page: string): Promise<{ url: string; validFrom: string }> {
  const { text } = await run.fetch(page);
  const body = text.slice(text.indexOf("fis-points-list-body"));
  const url = body.match(/https:\/\/www\.fis-ski\.com\/DB\/v2\/download\/fis-list\/[A-Z]+\d+F\.zip/)?.[0];
  const date = body.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!url || !date) throw new Error(`No points list found on ${page}`);
  return { url, validFrom: `${date[3]}-${date[2]}-${date[1]}` };
}

type Row = Record<string, string>;
type PointsList = { competitors: Map<string, Row>; events: Map<string, Row>; races: Map<string, Row>; results: Row[] };

/** Streams through the ZIP once, keeping the small tables whole and Belgian rows of the big ones. */
async function readList(body: ReadableStream<Uint8Array>): Promise<PointsList> {
  const list: PointsList = { competitors: new Map(), events: new Map(), races: new Map(), results: [] };
  for await (const entry of zipEntries(body)) {
    const table = entry.name.match(/(com|evt|rac|res)\.csv$/)?.[1];
    if (!table) continue;
    for await (const row of tsvRows(entry.lines())) {
      if (table === "com" && row.Nationcode === "BEL") list.competitors.set(row.Competitorid, row);
      if (table === "evt") list.events.set(row.Eventid, row);
      if (table === "rac" && row.Catcode in KIND_BY_CATEGORY) list.races.set(row.Raceid, row);
      if (table === "res" && row.Nationcode === "BEL") list.results.push(row);
    }
  }
  return list;
}

async function* tsvRows(lines: AsyncIterable<string>): AsyncGenerator<Row> {
  let header: string[] | null = null;
  for await (const line of lines) {
    if (!line) continue;
    const fields = line.split("\t");
    if (!header) {
      header = fields;
      continue;
    }
    yield Object.fromEntries(header.map((name, i) => [name, fields[i] ?? ""]));
  }
}

async function writeBelgianRows(run: SourceRun, discipline: Discipline, list: PointsList, rawCopyId: string) {
  const competitionIds = new Map<string, Promise<string>>();
  const competition = (eventId: string) => {
    if (!competitionIds.has(eventId)) competitionIds.set(eventId, writeCompetition(run, discipline, list, eventId, rawCopyId));
    return competitionIds.get(eventId)!;
  };

  for (const r of list.results) {
    const race = list.races.get(r.Raceid);
    const competitor = list.competitors.get(r.Competitorid);
    const status = resultStatus(r.Status);
    if (!race || !competitor || !status) continue;
    await run.rows.result({
      competitionId: await competition(race.Eventid),
      person: person(competitor),
      event: race.Name,
      date: race.Racedate,
      place: status === "finished" ? Number(r.Position) || null : null,
      status,
      performance: (r.Timetot ?? r.Tot) || null,
      sourceRef: `${race.Raceid}/${r.Competitorid}`,
      rawCopyId,
    });
  }
}

async function writeCompetition(run: SourceRun, discipline: Discipline, list: PointsList, eventId: string, rawCopyId: string) {
  const event = list.events.get(eventId);
  if (!event) throw new Error(`FIS event ${eventId} missing from the list`);
  const kinds = [...list.races.values()].filter((r) => r.Eventid === eventId).map((r) => KIND_BY_CATEGORY[r.Catcode]);
  return run.rows.competition({
    name: event.Eventname && event.Eventname !== event.Name ? `${event.Name} – ${event.Eventname}` : event.Name,
    sport: discipline.sport,
    kind: KIND_RANK.find((k) => kinds.includes(k))!,
    startDate: event.Startdate,
    endDate: event.Enddate,
    city: event.Place || null,
    country: event.Nationcodeplace || null,
    venueZone: event.Timezone || null,
    sourceRef: `${event.Sectorcode}/${eventId}`,
    rawCopyId,
  });
}

/** FIS result statuses: QLF is a classified finish; DNS is not a performance. */
function resultStatus(status: string): ResultStatus | null {
  if (status === "QLF") return "finished";
  if (status.startsWith("DNF")) return "DNF";
  if (status.startsWith("DSQ")) return "DSQ";
  if (status.startsWith("DNQ")) return "eliminated";
  return null;
}

function person(c: Row): Person {
  return {
    name: `${c.Firstname} ${titleCase(c.Lastname)}`,
    dateOfBirth: c.Birthdate || null,
    nationality: c.Nationcode,
    ifId: { scheme: "fis", value: c.Fiscode },
  };
}

/** "VAN TITTELBOOM" → "Van Tittelboom": FIS writes surnames in capitals. */
function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}
