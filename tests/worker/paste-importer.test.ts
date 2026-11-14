import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "~/db/client";
import pastedTable from "../fixtures/sources/paste/short-track-wt3-1000m-women.tsv?raw";
import { fixClock } from "../support/clock";
import { stubOutboundFetch } from "../support/outbound-fetch";
import { clearIngestedData, seedAthlete, seedCompetition, seedEntrant, seedSource } from "../support/seed";
import { get } from "../support/worker";

// Spec #20, stories 4, 92 and 104; ticket #25: the Run sheet's Paste imports
// step. The owner pastes a URL or table text for an Assisted source, checks
// the column mapping (guessed the first time, then saved per source), reviews
// the suggested Belgian rows with their identity match, and confirms.
const NOW = "2026-11-14T10:00:00.000Z";
const STEP = "/curate/run/paste-imports";
const SOURCE = "isu-short-track";

const COMPETITION = {
  competition: "ISU Short Track World Tour #3",
  kind: "circuit",
  startDate: "2026-11-13",
  endDate: "2026-11-15",
  event: "1000m Women",
  date: "2026-11-14",
};

/** POST a form whose fields may repeat (ticked rows). */
function postForm(path: string, fields: [string, string][]) {
  return get(path, { method: "POST", body: new URLSearchParams(fields) });
}

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const page = async (path: string) => text(await (await get(path)).text());

/** Reads the pasted table; returns the importer's URL it redirects to. */
async function read(fields: { text?: string; url?: string }) {
  const res = await postForm(STEP, [
    ["intent", "read"],
    ["source", SOURCE],
    ["url", fields.url ?? ""],
    ["text", fields.text ?? ""],
  ]);
  expect(res.status).toBe(303);
  return res.headers.get("location")!;
}

/** Confirms the rows ticked, with the mapping the page offered (by column). */
async function confirm(importer: string, roles: string[], rows: number[]) {
  const raw = new URL(importer, "https://bsh.test").searchParams.get("raw")!;
  return postForm(STEP, [
    ["intent", "confirm"],
    ["source", SOURCE],
    ["raw", raw],
    ...Object.entries(COMPETITION),
    ...roles.map((role, i): [string, string] => [`col.${i}`, role]),
    ...rows.map((r): [string, string] => ["row", String(r)]),
  ]);
}

const GUESSED = ["place", "name", "nation", "performance", "if-id", "date-of-birth"];

function railStep(html: string, label: string) {
  return html.match(new RegExp(`${label} [^·]*· (\\d+) open`))?.[1];
}

describe("Paste imports step", () => {
  let vos: string;
  let peeters: string;

  beforeEach(async () => {
    fixClock(NOW);
    await clearIngestedData(env);
    const db = getDb(env.DB);
    await db.delete(schema.runSheetLog);
    await db.delete(schema.runSheetSession);
    await db.delete(schema.source);
    await seedSource(env.DB, SOURCE, { name: "ISU short track", tier: "assisted", cadenceDays: 7, sport: "Short track speed skating", idScheme: "isu" });
    // Pasted last week, so due again; a healthy Automatic source is not listed.
    await seedSource(env.DB, "isu-speed-skating", { name: "ISU speed skating", lastSuccessAt: "2026-11-14T04:00:00.000Z" });
    vos = await seedAthlete(env.DB, { name: "Hanne Vos", sport: "Short track speed skating", externalIds: [{ scheme: "isu", value: "SR-20451" }] });
    peeters = await seedAthlete(env.DB, { name: "Ella Peeters", sport: "Short track speed skating", dateOfBirth: "2002-05-06" });
    // A Belgian Participation in short track this week (the entry list names Hanne Vos), so its source is due.
    const thisWeek = await seedCompetition(env.DB, { name: "Short Track World Tour, Montréal", sport: "Short track speed skating", startDate: "2026-11-13", endDate: "2026-11-15" });
    await seedEntrant(env.DB, thisWeek, vos);
  });

  it("lists the Assisted sources due this week as rows to open", async () => {
    const html = await (await get(STEP)).text();

    expect(text(html)).toContain("ISU short track");
    expect(text(html)).not.toMatch(/ISU speed skating Open/);
    expect(html).toContain(`href="${STEP}?source=${SOURCE}"`);
    expect(railStep(text(html), "Paste imports")).toBe("1");
  });

  it("leaves out a due Assisted source without a Belgian Participation this week", async () => {
    await seedSource(env.DB, "fie", { name: "FIE fencing", tier: "assisted", cadenceDays: 7, sport: "Fencing" });
    // Its competition is three weeks away: not this week.
    const later = await seedCompetition(env.DB, { name: "Fencing World Cup, Tbilisi", sport: "Fencing", source: "fie", startDate: "2026-12-04", endDate: "2026-12-06" });
    await seedEntrant(env.DB, later, peeters);

    const html = text(await (await get(STEP)).text());

    expect(html).toContain("ISU short track");
    expect(html).not.toContain("FIE fencing");
    expect(railStep(html, "Paste imports")).toBe("1");

    // Once one of its competitions with a Belgian is within a week, it is due.
    fixClock("2026-11-28T10:00:00.000Z");
    expect(text(await (await get(STEP)).text())).toContain("FIE fencing");
  });

  it("keeps the pasted table as received in R2", async () => {
    const importer = await read({ text: pastedTable });

    const raw = new URL(importer, "https://bsh.test").searchParams.get("raw")!;
    const copy = await getDb(env.DB).query.rawCopy.findFirst({ where: eq(schema.rawCopy.id, raw) });
    expect(copy?.source).toBe(SOURCE);
    expect(await (await env.RAW.get(copy!.r2Key))?.text()).toBe(pastedTable);
  });

  it("guesses the columns on first use and suggests the Belgian rows with their identity match", async () => {
    const html = await page(await read({ text: pastedTable }));

    expect(html).toContain("Columns (guessed, check them)");
    expect(html).toContain("7 rows read · 3 BEL rows suggested");
    expect(html).toMatch(/5 VOS Hanne 1:29\.871 ✓ IF ID → Hanne Vos/);
    expect(html).toMatch(/17 PEETERS Ella 1:31\.402 ✓ name \+ date of birth → Ella Peeters/);
    expect(html).toMatch(/DNF MAES Lotte → merge queue/);
    expect(html).not.toContain("CLAES Mira");
  });

  it("on confirm, writes the Results, sends unmatched identities to the merge queue and logs it", async () => {
    const importer = await read({ text: pastedTable });

    const res = await confirm(importer, GUESSED, [2, 4, 5]);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(STEP);
    const vosPage = await page(`/athletes/${vos}`);
    expect(vosPage).toMatch(/ISU Short Track World Tour #3 1000m Women 5th 1:29\.871/);
    expect(await page(`/athletes/${peeters}`)).toMatch(/ISU Short Track World Tour #3 1000m Women 17th 1:31\.402/);
    const mergeQueue = await page("/curate/run/merge-queue");
    expect(mergeQueue).toContain("MAES Lotte");
    expect(mergeQueue).toContain("born 11 Nov 2004");
    const step = await page(STEP);
    expect(step).toContain("ISU short track: wrote 3 results, 1 sent to the merge queue · column mapping saved");
    expect(railStep(step, "Paste imports")).toBe("0");
  });

  it("links every created row to the pasted raw copy", async () => {
    const importer = await read({ text: pastedTable });
    await confirm(importer, GUESSED, [2, 4, 5]);

    const db = getDb(env.DB);
    const raw = new URL(importer, "https://bsh.test").searchParams.get("raw")!;
    const results = await db.select().from(schema.result);
    const competitions = await db.select().from(schema.competition).where(eq(schema.competition.source, SOURCE));
    const items = await db.select().from(schema.mergeQueueItem);
    expect(results.map((r) => r.rawCopyId)).toEqual([raw, raw, raw]);
    expect(competitions.map((c) => c.rawCopyId)).toEqual([raw]);
    expect(items.map((i) => i.rawCopyId)).toEqual([raw]);
  });

  it("writes only the ticked rows", async () => {
    const importer = await read({ text: pastedTable });

    await confirm(importer, GUESSED, [2]);

    expect(await page(`/athletes/${peeters}`)).toContain("No results yet.");
    expect(await page("/curate/run/merge-queue")).not.toContain("MAES Lotte");
    expect(await page(STEP)).toContain("ISU short track: wrote 1 result · column mapping saved");
  });

  it("saves the column mapping the owner corrected, and applies it to the source's next paste", async () => {
    // The owner maps the "Born" column away; the next paste uses that.
    const corrected = ["place", "name", "nation", "performance", "if-id", "ignore"];
    await confirm(await read({ text: pastedTable }), corrected, [2]);

    const html = await page(await read({ text: pastedTable }));

    expect(html).toContain("Columns (saved mapping applied)");
    // Without a date of birth, Ella Peeters can no longer be matched by name.
    expect(html).toMatch(/17 PEETERS Ella 1:31\.402 → merge queue/);
  });

  it("reads the biggest table of a plain HTML page from its URL", async () => {
    const url = "https://results.example.test/wt3/1000m-women.html";
    const body = `<html><body><table><tr><td>Home</td></tr></table><table>
      <tr><th>Pl</th><th>Name</th><th>Nat</th><th>Time</th><th>ISU ID</th></tr>
      <tr><td>1</td><td>KIM Ji-woo</td><td>KOR</td><td>1:28.902</td><td>SR-10011</td></tr>
      <tr><td>5</td><td>VOS Hanne</td><td>BEL</td><td>1:29.871</td><td>SR-20451</td></tr></table></body></html>`;
    stubOutboundFetch([{ url, body, contentType: "text/html; charset=utf-8" }]);

    const importer = await read({ url });
    await confirm(importer, ["place", "name", "nation", "performance", "if-id"], [1]);

    expect(await page(`/athletes/${vos}`)).toMatch(/ISU Short Track World Tour #3 1000m Women 5th 1:29\.871/);
    const raw = new URL(importer, "https://bsh.test").searchParams.get("raw")!;
    const copy = await getDb(env.DB).query.rawCopy.findFirst({ where: eq(schema.rawCopy.id, raw) });
    expect(copy?.url).toBe(url);
    expect(await (await env.RAW.get(copy!.r2Key))?.text()).toBe(body);
  });

  it("tells the owner to paste the table when the page refuses the Worker", async () => {
    const url = "https://results.example.test/blocked.html";
    stubOutboundFetch([{ url, body: "Forbidden", status: 403 }]);

    const res = await postForm(STEP, [
      ["intent", "read"],
      ["source", SOURCE],
      ["url", url],
      ["text", ""],
    ]);

    expect(res.status).toBe(303);
    expect(await page(res.headers.get("location")!)).toContain(
      "ISU short track: the page refused the Worker (403); copy the table from your browser instead",
    );
  });
});
