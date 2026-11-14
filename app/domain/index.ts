// Domain rules: pure functions, no I/O. Every rule that depends on the current
// time takes it as an explicit argument. Tested table-driven in tests/domain.
export { BELGIAN_ZONE, toDisplayTime, wallClockIn, zonedWallClockToInstant, type DisplayTime } from "./time-display";
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
export { LIVE_DAY_PASS, runSheetProgress, WEEKLY_RUN_SHEET, type RunSheetProgress, type RunSheetStep } from "./run-sheet";
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
  belgianRankingRows,
  columnMapping,
  isRankingMapping,
  mappingToSave,
  PASTE_COLUMN_ROLES,
  readHtmlTable,
  readPastedTable,
  type PasteColumnRole,
  type PastedRankingRow,
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
export {
  dayToShow,
  liveDays,
  roundsFor,
  venueLabel,
  type EntryProgress,
  type EventResult,
  type LiveDay,
  type RoundOutcome,
  type RoundProgress,
  type RoundState,
} from "./live-day";
export { isBelgium, medalTable, readMedalTable, type MedalStanding, type MedalTableRow } from "./medal-table";
export { activeStatus, isActive, type ActiveEntity, type ActiveFacts, type ActivePerformance, type ActiveReason, type ActiveStatus } from "./active";
export {
  inContention,
  isQualificationStatus,
  meetsCriteria,
  rankedTrack,
  rankingPlaces,
  suggestStatus,
  type RankingSnapshotFigures,
  type SuggestionEntry,
  type SuggestionQuotaPlace,
  type SuggestionRanking,
  QUALIFICATION_STATUS_LABELS,
  QUALIFICATION_STATUSES,
  qualificationTargets,
  TRACK_STATES,
  trackProgress,
  windowCountdown,
  type OlympicCycle,
  type QualificationStatus,
  type QualificationTargets,
  type TargetCompetition,
  type TrackBetter,
  type TrackMeasure,
  type TrackState,
} from "./qualification";
export {
  isQuotaPlaceEvent,
  isQuotaPlaceState,
  NEW_QUOTA_PLACE_EVENTS,
  placesEarned,
  QUOTA_PLACE_EVENTS,
  QUOTA_PLACE_KIND_LABELS,
  QUOTA_PLACE_STATE_LABELS,
  QUOTA_PLACE_STATES,
  quotaPlaceAdjustment,
  quotaPlaceEnded,
  quotaPlaceLinkable,
  quotaPlaceTransition,
  type QuotaPlaceEvent,
  type QuotaPlaceKind,
  type QuotaPlaceMove,
  type QuotaPlaceNow,
  type QuotaPlaceState,
  type RankedQuotaPlace,
} from "./quota-places";
export {
  BOIC,
  entryListSelection,
  namesFoundIn,
  SELECTION_LOOKAHEAD_WEEKS,
  selectionDue,
  selectorFor,
  type SelectionCandidate,
} from "./selection";
export {
  canPick,
  EXPECTATION_SOURCES,
  expandShortcut,
  isFinalSeed,
  isSeedMethod,
  KNOCKOUT_ROUNDS,
  lastSnapshotBefore,
  PICK_SUGGESTIONS,
  pickLockAt,
  placeRangeLabel,
  readShortcut,
  SEED_METHOD_LABELS,
  SEED_METHODS,
  shortcutLabel,
  shortcutText,
  worldRankSnapshotDue,
  type ExpectationSource,
  type KnockoutRound,
  type PlaceRange,
  type SeedMethod,
  type Shortcut,
} from "./expectations";
export {
  belgiumCounts,
  impliedCounts,
  outcomeOf,
  tally,
  verdict,
  VERDICT_LABELS,
  VERDICTS,
  withdrawnBeforeLock,
  type DelegationCounts,
  type ExpectationKind,
  type Outcome,
  type Tally,
  type Verdict,
} from "./verdicts";
export { canonicalSport, olympicCycleOf, requireSport, sameSport, SPORTS, type SportDefinition } from "./sports";
export { seriesKey, seriesSlug, type CompetitionKindName, type SeriesInput } from "./series";
