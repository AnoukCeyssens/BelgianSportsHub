// Beach volleyball through the FIVB VIS web service (see ./fivb-vis.ts).
//
// One run, kept small and polite:
// 1. the tournaments running from the day before the last run (a month back
//    on the first run) to two weeks ahead: one request;
// 2. for each qualification-relevant one (the Games, World Championships,
//    Beach Pro Tour, CEV European Championships and Continental Cup), its
//    team list: the competition is kept when a Belgian pair plays it, and its
//    Belgian players are its entry list behind Upcoming until it ends; once it
//    has ended, each ranked Belgian pair's final rank is a result of that
//    pair's Team (ADR 0001: every standing partnership is its own Team).
// Rankings are not ingested yet (#33: VIS ranking requests still to work out; see conventions.md "Rankings").
import type { CompetitionKind, Person, SourceAdapter } from "../source-adapter";
import { addDays, isoDate } from "./dates";
import { elements, visPerson, visSeries, visUrl } from "./fivb-vis";

const SPORT = "Beach volleyball";
/** Each tournament in the window costs a request, so the first run looks back a month only. */
const FIRST_RUN_LOOKBACK_DAYS = 30;
const EVENT_BY_GENDER: Record<string, string> = { "0": "Men", "1": "Women" };
const ENTRY_LIST_HORIZON_DAYS = 14;

/** VIS BeachTournamentType values that are qualification-relevant senior tournaments. */
const KIND_BY_TYPE: Record<string, CompetitionKind> = {
  "4": "championship", // World Championships
  "5": "games", // Olympic Games
  "7": "championship", // Continental championship (CEV only, below)
  "11": "circuit", // Continental Cup (CEV only, below): an Olympic qualification route
  "33": "circuit", // World Tour Finals
  "37": "circuit", // Continental Cup Final (CEV only, below)
  "49": "circuit", // Olympic Games qualification tournament
  "51": "circuit", // Beach Pro Tour Elite16
  "52": "circuit", // Beach Pro Tour Challenge
  "53": "circuit", // Beach Pro Tour Futures
};
/** Continental types Belgium only plays in Europe: other confederations' events are not worth a request. */
const CONTINENTAL_TYPES = new Set(["7", "11", "37"]);
const EUROPEAN = /\bCEV\b|Euro/i;

const TEAM_FIELDS =
  "No Rank NoPlayer1 NoPlayer2 Player1FirstName Player1LastName Player1Birthdate Player1FederationCode Player2FirstName Player2LastName Player2Birthdate Player2FederationCode";

export const fivbBeachVolleyball: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const from = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    const until = addDays(today, ENTRY_LIST_HORIZON_DAYS);
    const list = await run.fetch(
      visUrl(
        `<Request Type="GetBeachTournamentList" Fields="No Code Name Type Gender StartDateMainDraw EndDateMainDraw CountryCode Status"><Filter FirstDate="${from}" LastDate="${until}"/></Request>`,
      ),
    );

    for (const t of elements(list.text, "BeachTournament")) {
      const kind = KIND_BY_TYPE[t.Type];
      if (!kind || (CONTINENTAL_TYPES.has(t.Type) && !EUROPEAN.test(t.Name))) continue;
      if (t.EndDateMainDraw < from || t.StartDateMainDraw > until) continue;

      const teams = await run.fetch(
        visUrl(`<Request Type="GetBeachTeamList" Fields="${TEAM_FIELDS}"><Filter NoTournament="${t.No}"/></Request>`),
      );
      const pairs = elements(teams.text, "BeachTeam")
        .map((team) => ({ team, players: players(team) }))
        .filter(({ players }) => players.some((p) => p.nationality === "BEL"));
      const belgians = pairs.flatMap(({ players }) => players).filter((p) => p.nationality === "BEL");
      if (belgians.length === 0) continue;

      const competitionId = await run.rows.competition({
        name: t.Name.trim(),
        sport: SPORT,
        kind,
        startDate: t.StartDateMainDraw,
        endDate: t.EndDateMainDraw,
        city: null,
        // VIS gives ISO country codes; the competition row wants IOC codes.
        country: null,
        venueZone: null,
        sourceRef: t.No,
        series: visSeries("fivb-beach-volleyball", t.Name, kind, SPORT),
        rawCopyId: list.rawCopyId,
      });
      if (t.EndDateMainDraw >= today) {
        await run.rows.entrants(competitionId, belgians, teams.rawCopyId);
        continue;
      }
      // Ended: the final rank of every Belgian pair that has one (pairs out in the qualification have none).
      for (const { team, players } of pairs) {
        const rank = Number(team.Rank);
        if (!team.Rank || !Number.isInteger(rank) || !players.every((p) => p.nationality === "BEL")) continue;
        await run.rows.teamResult({
          competitionId,
          nationality: "BEL",
          event: EVENT_BY_GENDER[t.Gender] ?? "Beach volleyball",
          date: t.EndDateMainDraw,
          place: rank,
          status: "finished",
          performance: null,
          sourceRef: `${t.No}/${team.No}`,
          rawCopyId: teams.rawCopyId,
          roster: players,
        });
      }
    }
  },
};

function players(team: Record<string, string>): Person[] {
  return ([1, 2] as const).map((n) =>
    visPerson({
      no: team[`NoPlayer${n}`],
      firstName: team[`Player${n}FirstName`] ?? "",
      lastName: team[`Player${n}LastName`] ?? "",
      birthdate: team[`Player${n}Birthdate`] ?? "",
      federation: team[`Player${n}FederationCode`] ?? "",
    }),
  );
}
