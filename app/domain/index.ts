// Domain rules: pure functions, no I/O. Every rule that depends on the current
// time takes it as an explicit argument. Tested table-driven in tests/domain.
export { BELGIAN_ZONE, toDisplayTime, type DisplayTime } from "./time-display";
export { isSeniorInternationalPerformance, type Performance } from "./senior-performance";
export { identityMatch, normaliseName, type ExternalId, type IdentityMatch, type IncomingIdentity, type KnownIdentity } from "./identity-match";
export { matchesNameSearch } from "./name-search";
export { CURATION_PATH, isCurationPath, offlineReading, type OfflineReading } from "./offline-reading";
export {
  pasteImportDue,
  sourceAttention,
  sourceHealth,
  type SourceAttentionState,
  type SourceHealth,
  type SourceProblem,
  type SourceState,
  type SourceTier,
} from "./source-health";
export { runSheetProgress, WEEKLY_RUN_SHEET, type RunSheetProgress, type RunSheetStep } from "./run-sheet";
export {
  LIKELY_REVIEW_WEEKS,
  needsLikelyReview,
  onCalendar,
  participation,
  type OwnerParticipationDecision,
  type Participation,
  type ParticipationFacts,
  type ParticipationReason,
  type ParticipationStatus,
} from "./participation";
export {
  belgianPastedRows,
  columnMapping,
  mappingToSave,
  PASTE_COLUMN_ROLES,
  readHtmlTable,
  readPastedTable,
  type PasteColumnRole,
  type PastedResultRow,
  type PastedTable,
  type SavedColumnMapping,
} from "./paste-table";
export { belgianDate, checklistDue, nextDueOn, type ChecklistCheck, type ChecklistDue } from "./monthly-checklist";
export { icalFeed, icalFold, icalText, type IcalCalendar, type IcalEvent } from "./ical";
