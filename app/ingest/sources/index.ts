// Every Automatic source's adapter, keyed by its Source row's key. A Source
// row with tier "automatic" and no adapter here fails its job loudly.
import type { SourceAdapter } from "../source-adapter";
import { fieFencing } from "./fie-fencing";
import { ijfJudo } from "./ijf-judo";
import { isuSpeedSkating } from "./isu-speed-skating";
import { worldAquatics } from "./world-aquatics";
import { worldAthletics } from "./world-athletics";
import { worldRowing } from "./world-rowing";

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  "fie-fencing": fieFencing,
  "ijf-judo": ijfJudo,
  "isu-speed-skating": isuSpeedSkating,
  "world-aquatics": worldAquatics,
  "world-athletics": worldAthletics,
  "world-rowing": worldRowing,
};
