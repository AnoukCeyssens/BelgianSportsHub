// Every Automatic source's adapter, keyed by its Source row's key. A Source
// row with tier "automatic" and no adapter here fails its job loudly.
import type { SourceAdapter } from "../source-adapter";
import { fisAlpine, fisCrossCountry, fisFreestyle, fisSnowboard } from "./fis-points-lists";
import { fivbBeachVolleyball } from "./fivb-beach-volleyball";
import { fivbVolleyball } from "./fivb-volleyball";
import { isuSpeedSkating } from "./isu-speed-skating";
import { worldArchery } from "./world-archery";
import { worldTriathlon } from "./world-triathlon";

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  "isu-speed-skating": isuSpeedSkating,
  "fis-alpine": fisAlpine,
  "fis-cross-country": fisCrossCountry,
  "fis-freestyle": fisFreestyle,
  "fis-snowboard": fisSnowboard,
  "world-archery": worldArchery,
  "world-triathlon": worldTriathlon,
  "fivb-volleyball": fivbVolleyball,
  "fivb-beach-volleyball": fivbBeachVolleyball,
};
