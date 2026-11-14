// Every Automatic source's adapter, keyed by its Source row's key. A Source
// row with tier "automatic" and no adapter here fails its job loudly.
import type { SourceAdapter } from "../source-adapter";
import { fieFencing } from "./fie-fencing";
import { fisAlpine, fisCrossCountry, fisFreestyle, fisSnowboard } from "./fis-points-lists";
import { fivbBeachVolleyball } from "./fivb-beach-volleyball";
import { fivbVolleyball } from "./fivb-volleyball";
import { ijfJudo } from "./ijf-judo";
import { isuSpeedSkating } from "./isu-speed-skating";
import { uciCycling } from "./uci-cycling";
import { worldAquatics } from "./world-aquatics";
import { worldAquaticsTimetables } from "./world-aquatics-timetables";
import { worldArchery } from "./world-archery";
import { worldArcheryTimetables } from "./world-archery-timetables";
import { worldAthletics } from "./world-athletics";
import { worldAthleticsTimetables } from "./world-athletics-timetables";
import { worldRowing } from "./world-rowing";
import { worldTriathlon } from "./world-triathlon";

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  "isu-speed-skating": isuSpeedSkating,
  "fis-alpine": fisAlpine,
  "fis-cross-country": fisCrossCountry,
  "fis-freestyle": fisFreestyle,
  "fis-snowboard": fisSnowboard,
  "world-archery": worldArchery,
  "world-archery-timetables": worldArcheryTimetables,
  "world-triathlon": worldTriathlon,
  "fivb-volleyball": fivbVolleyball,
  "fivb-beach-volleyball": fivbBeachVolleyball,
  "ijf-judo": ijfJudo,
  "world-athletics": worldAthletics,
  "world-athletics-timetables": worldAthleticsTimetables,
  "world-aquatics": worldAquatics,
  "world-aquatics-timetables": worldAquaticsTimetables,
  "fie-fencing": fieFencing,
  "world-rowing": worldRowing,
  "uci-cycling": uciCycling,
};
