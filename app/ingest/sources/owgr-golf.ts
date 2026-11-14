// Golf through the Official World Golf Ranking (apiweb.owgr.com, the JSON
// behind owgr.com; research/summer-sport-sources). A ranking-only source
// (ticket #33): golf results come from the tours, by hand or paste.
//
// One run, one request: the current ranking filtered to Belgium (OWGR
// country 21), weekly by cadence (the ranking is published on Mondays). Each
// Belgian known as an Athlete (OWGR ID, else name + date of birth) gets a
// snapshot: position and average points, as of the run's Belgian date (the
// API gives no week date). Amateurs are left out: the Olympic golf ranking
// is the professionals' OWGR.
import type { SourceAdapter } from "../source-adapter";

const URL = "https://apiweb.owgr.com/api/owgr/rankings/getRankings?pageSize=200&pageNumber=1&regionId=0&countryId=21&sortString=Rank+ASC";
const SPORT = "Golf";
const RANKING = "Official World Golf Ranking";

type OwgrRow = {
  rank: number;
  pointsAverage: number | null;
  player: {
    id: number;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    isAmateur: boolean;
    country: { iocCode: string };
  };
};

export const owgrGolf: SourceAdapter = {
  async run(run) {
    const fetched = await run.fetch(URL);
    const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(run.now);
    for (const r of (JSON.parse(fetched.text) as { rankingsList: OwgrRow[] }).rankingsList) {
      if (r.player.isAmateur || r.player.country.iocCode !== "BEL") continue;
      await run.rows.ranking({
        ranking: RANKING,
        sport: SPORT,
        asOf,
        position: r.rank,
        points: r.pointsAverage === null ? null : String(r.pointsAverage),
        person: {
          name: `${r.player.firstName} ${r.player.lastName}`.trim(),
          dateOfBirth: r.player.birthDate?.slice(0, 10) ?? null,
          nationality: r.player.country.iocCode,
          ifId: { scheme: "owgr", value: String(r.player.id) },
        },
        rawCopyId: fetched.rawCopyId,
      });
    }
  },
};
