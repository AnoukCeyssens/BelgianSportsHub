// Domain rules: pure functions, no I/O. Every rule that depends on the current
// time takes it as an explicit argument. Tested table-driven in tests/domain.
export { toDisplayTime, type DisplayTime } from "./time-display";
export { CURATION_PATH, offlineReading, type OfflineReading } from "./offline-reading";
