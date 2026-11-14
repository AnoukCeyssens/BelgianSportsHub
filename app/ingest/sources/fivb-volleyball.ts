// Volleyball (indoor) through the FIVB VIS web service (see ./fivb-vis.ts).
//
// One run, kept small and polite:
// 1. the tournaments ending since the day before the last run (a year back on
//    the first run): one request;
// 2. for each qualification-relevant senior national-team tournament (the
//    Games, World Championships, World Cup, Nations League, Challenger Cup,
//    Olympic qualification tournaments, the CEV European Championships) that
//    starts within two weeks, its player registrations: the competition is
//    kept when Belgians are registered, and they are its entry list behind
//    Upcoming until it ends.
// A volleyball result belongs to the national team (ADR 0001): results and
// rankings wait for Teams (#27) and rankings ingest (#33).
import type { CompetitionKind, SourceAdapter } from "../source-adapter";
import { addDays, isoDate } from "./dates";
import { elements, visPerson, visUrl } from "./fivb-vis";

const SPORT = "Volleyball";
const FIRST_RUN_LOOKBACK_DAYS = 365;
const ENTRY_LIST_HORIZON_DAYS = 14;

/** VIS VolleyTournamentType values of qualification-relevant senior national-team tournaments. */
const KIND_BY_TYPE: Record<string, CompetitionKind> = {
  "2": "games", // Olympic Games
  "3": "championship", // World Championship
  "10": "championship", // Continental Championship (CEV only, below)
  "11": "circuit", // Olympic Games qualification tournament
  "12": "circuit", // Nations League
  "13": "circuit", // Challenger Cup
  "15": "championship", // World Cup: the FIVB's world title event from 2027
};
const CONTINENTAL_CHAMPIONSHIP = "10";
const EUROPEAN = /\bCEV\b|Euro/i;

export const fivbVolleyball: SourceAdapter = {
  async run(run) {
    const today = isoDate(run.now);
    const from = run.since ? addDays(isoDate(run.since), -1) : addDays(today, -FIRST_RUN_LOOKBACK_DAYS);
    const until = addDays(today, ENTRY_LIST_HORIZON_DAYS);
    const list = await run.fetch(
      visUrl(
        `<Request Type="GetVolleyTournamentList" Fields="No Code Name Type Gender StartDate EndDate CountryCode Status"><Filter FirstDate="${from}"/></Request>`,
      ),
    );

    for (const t of elements(list.text, "VolleyballTournament")) {
      const kind = KIND_BY_TYPE[t.Type];
      if (!kind || (t.Type === CONTINENTAL_CHAMPIONSHIP && !EUROPEAN.test(t.Name))) continue;
      if (t.EndDate < from || t.StartDate > until) continue;

      const registrations = await run.fetch(
        visUrl(
          `<Request Type="GetVolleyPlayerList" Fields="No NoTournament"><Filter NoTournament="${t.No}"/><Relation Name="Player" Fields="No FirstName LastName Birthdate FederationCode"/></Request>`,
        ),
      );
      const belgians = elements(registrations.text, "Player")
        .map((p) =>
          visPerson({ no: p.No, firstName: p.FirstName ?? "", lastName: p.LastName ?? "", birthdate: p.Birthdate ?? "", federation: p.FederationCode ?? "" }),
        )
        .filter((p) => p.nationality === "BEL");
      if (belgians.length === 0) continue;

      const competitionId = await run.rows.competition({
        name: t.Name.trim(),
        sport: SPORT,
        kind,
        startDate: t.StartDate,
        endDate: t.EndDate,
        city: null,
        // VIS gives ISO country codes (or none for multi-host events); the competition row wants IOC codes.
        country: null,
        venueZone: null,
        sourceRef: t.No,
        rawCopyId: list.rawCopyId,
      });
      if (t.EndDate >= today) await run.rows.entrants(competitionId, belgians, registrations.rawCopyId);
    }
  },
};
