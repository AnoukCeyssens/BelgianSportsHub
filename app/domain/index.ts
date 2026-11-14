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
export { athleteMedals, belgiumMedals, teamIdentity, type MedalCount, type MedalEntry, type MedalResult, type TeamIdentity, type TeamKind, type TeamMember } from "./teams";
export { combinedPhaseInputs, currentPhase, PHASE_LABELS, PHASES, phaseToShow, type Phase, type PhaseInputs } from "./phase";
export { icalFeed, icalFold, icalText, type IcalCalendar, type IcalEvent } from "./ical";
export {
  chosenSports,
  GAMES_SOURCE,
  REFERENCE_GAMES,
  referenceGamesOf,
  standardsForSports,
  toggledSports,
  TRACKED_GAMES,
  type ReferenceGames,
  type TrackedGames,
} from "./games";
export {
  belgianRounds,
  readTimetable,
  sameEvent,
  splitEventRound,
  timetableText,
  TIMETABLE_TEXT_HEAD,
  TIMETABLE_COLUMN_ROLES,
  timetableColumnMapping,
  type SavedTimetableMapping,
  type TimetableColumnRole,
  type TimetableRound,
  type TimetableSkip,
} from "./timetable";
export { venueZoneOf } from "./venue-zone";
export { dayToShow, liveDays, roundsFor, venueLabel, type LiveDay, type RoundState } from "./live-day";
export { activeStatus, isActive, type ActiveEntity, type ActiveFacts, type ActivePerformance, type ActiveReason, type ActiveStatus } from "./active";
