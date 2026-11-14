// Domain rules: pure functions, no I/O. Every rule that depends on the current
// time takes it as an explicit argument. Tested table-driven in tests/domain.
export { BELGIAN_ZONE, toDisplayTime, type DisplayTime } from "./time-display";
export { isSeniorInternationalPerformance, type Performance } from "./senior-performance";
export { identityMatch, normaliseName, type ExternalId, type IdentityMatch, type IncomingIdentity, type KnownIdentity } from "./identity-match";
export { matchesNameSearch } from "./name-search";
export { CURATION_PATH, offlineReading, type OfflineReading } from "./offline-reading";
export { sourceHealth, type SourceHealth, type SourceState, type SourceTier } from "./source-health";
