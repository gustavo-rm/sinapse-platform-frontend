/**
 * Every enumeration the API sends or accepts, value for value.
 *
 * Source: `docs/openapi/openapi.json` of `sinapse-platform@c3abbff` (59 operations). The snapshot
 * inlines each enum without a name, so the names below are the backend's Java enums, read at the
 * same commit; each comment lists where the values appear in the snapshot.
 *
 * Hand-written on purpose and kept as runtime arrays: the label catalogue proves its
 * exhaustiveness over these values. Whether the API types are later generated from the snapshot
 * is the open decision D-FE1; if they are, these lists must be asserted equal to the generated
 * unions, not dropped.
 *
 * Never add a value here that the snapshot does not carry.
 */

/** `identity.api.AccountStatus` — `RegistrationResponse.status`, `StudentStateView.accountStatus`. */
export const ACCOUNT_STATUSES = [
  'PENDING_VERIFICATION',
  'PENDING_GUARDIAN_CONSENT',
  'ACTIVE',
  'SUSPENDED',
  'ANONYMIZED',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * `identity.api.ConsentPurpose` — `ConsentRequest.purpose`, `ConsentSummary.purpose`,
 * `StudentStateView.pendingConsents[]`, `TermsAcceptance.purpose`, `TermsVersionSummary.purpose`,
 * and the `{purpose}` path parameter of `DELETE /api/v1/consents/{purpose}`.
 */
export const CONSENT_PURPOSES = [
  'LEARNING_DATA_PROCESSING',
  'INSTITUTION_SHARING',
  'ACADEMIC_RESEARCH',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** `identity.api.ConsentGrantedBy` — `ConsentSummary.grantedBy`. */
export const CONSENT_GRANTED_BY = ['SELF', 'GUARDIAN'] as const;
export type ConsentGrantedBy = (typeof CONSENT_GRANTED_BY)[number];

/** `planning.api.GoalStatus` — `GoalResponse.status`. */
export const GOAL_STATUSES = ['ACTIVE', 'ACHIEVED', 'ABANDONED'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** `planning.api.PlanStatus` — `PlanSummaryView.status`, `StudyPlanResponse.status`. */
export const PLAN_STATUSES = ['ACTIVE', 'SUPERSEDED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** `planning.api.PlannedSessionKind` — `PlannedSessionResponse.kind`, `Entry.kind` (agenda). */
export const PLANNED_SESSION_KINDS = ['STUDY', 'REVISION'] as const;
export type PlannedSessionKind = (typeof PLANNED_SESSION_KINDS)[number];

/** `planning.api.GenerationRequestStatus` — `GenerationRequestResponse.status`. */
export const GENERATION_REQUEST_STATUSES = [
  'PENDING',
  'RUNNING',
  'READY',
  'FAILED',
  'CANCELLED',
] as const;
export type GenerationRequestStatus = (typeof GENERATION_REQUEST_STATUSES)[number];

/** `planning.api.PlanGenerationFailure` — `GenerationRequestResponse.failureReason`. */
export const PLAN_GENERATION_FAILURES = [
  'CORE_UNAVAILABLE',
  'CORE_REJECTED',
  'NOTHING_TO_PLAN',
  'INTERNAL',
] as const;
export type PlanGenerationFailure = (typeof PLAN_GENERATION_FAILURES)[number];

/**
 * `learningrecord.api.SessionKind` — `StartSessionRequest.kind`, `RetroactiveSessionRequest.kind`,
 * `StudySessionResponse.kind`, `StudentPanelSessionSummary.kind`. Same values as
 * `PlannedSessionKind`, but a different enum on the server: they may diverge.
 */
export const SESSION_KINDS = ['STUDY', 'REVISION'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/** `learningrecord.api.SessionSource` — `StudySessionResponse.source`, `StudentPanelSessionSummary.source`. */
export const SESSION_SOURCES = ['FROM_PLAN', 'SELF_DIRECTED'] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

/**
 * `learningrecord.api.SessionStatus` — `Execution.status`, `StudySessionResponse.status`,
 * `StudentPanelSessionSummary.status`.
 */
export const SESSION_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * `learningrecord.api.DurationSource` — `Execution.durationSource`,
 * `StudySessionResponse.durationSource`, `StudentPanelSessionSummary.durationSource`.
 */
export const DURATION_SOURCES = ['MEASURED', 'SELF_REPORTED'] as const;
export type DurationSource = (typeof DURATION_SOURCES)[number];

/**
 * `learningrecord.api.RecallRating` — `CompleteSessionRequest.recallRating`,
 * `RetroactiveSessionRequest.recallRating`, `Execution.recallRating`, `Point.rating`,
 * `StudySessionResponse.recallRating`, `StudentPanelSessionSummary.recallRating`. Ordinal, in this
 * order.
 */
export const RECALL_RATINGS = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;
export type RecallRating = (typeof RECALL_RATINGS)[number];

/** `educational.api.ClassroomStatus` — `ClassroomResponse.status`. */
export const CLASSROOM_STATUSES = ['OPEN', 'ARCHIVED'] as const;
export type ClassroomStatus = (typeof CLASSROOM_STATUSES)[number];

/** `educational.api.EnrollmentEndReason` — `EnrollmentResponse.endedReason`. */
export const ENROLLMENT_END_REASONS = [
  'STUDENT_LEFT',
  'TEACHER_REMOVED',
  'CLASSROOM_ARCHIVED',
  'CONSENT_REVOKED',
] as const;
export type EnrollmentEndReason = (typeof ENROLLMENT_END_REASONS)[number];

/** `datarights.api.ErasureRequestStatus` — `ErasureRequestView.status`. */
export const ERASURE_REQUEST_STATUSES = ['REQUESTED', 'COMPLETED', 'CANCELLED', 'FAILED'] as const;
export type ErasureRequestStatus = (typeof ERASURE_REQUEST_STATUSES)[number];

/**
 * `java.time.DayOfWeek`, which travels as its English literal — `AvailabilityRequest.dayOfWeek`,
 * `AvailabilityResponse.dayOfWeek`.
 */
export const DAYS_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];
