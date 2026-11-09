/**
 * Ties each hand-written list of `enums.ts` to the generated contract, at compile time.
 *
 * `schema.d.ts` carries every enum as an inline string-literal union, once per place it appears.
 * For each of those places, the hand-written union and the generated one must be assignable both
 * ways. A value the server adds, removes or renames therefore breaks `ng build` and `ng test` here,
 * naming the field, instead of reaching the screen untranslated (`CLAUDE.md` R5).
 *
 * Types only: nothing here exists at runtime. The places are every occurrence in the snapshot,
 * found mechanically; `enums.ts` names the same ones in its comments.
 */
import type { components, operations } from './schema';
import type {
  AccountStatus,
  ClassroomStatus,
  ConsentGrantedBy,
  ConsentPurpose,
  DayOfWeek,
  DurationSource,
  EnrollmentEndReason,
  ErasureRequestStatus,
  GenerationRequestStatus,
  GoalStatus,
  PlanGenerationFailure,
  PlanStatus,
  PlannedSessionKind,
  RecallRating,
  SessionKind,
  SessionSource,
  SessionStatus,
} from './enums';
import type { ProblemType } from './problem-type';

type Schemas = components['schemas'];

/** A member of a generated schema, without the `undefined` an optional member adds. */
type Field<S extends keyof Schemas, F extends keyof Schemas[S]> = NonNullable<Schemas[S][F]>;

/** The element type of a generated array member. */
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

/** `true` when A and B are the same set of values. Tuples stop the union from distributing. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compiles only when given `true`. */
type Expect<T extends true> = T;

/** One entry per occurrence of an enum in the snapshot. Each must compile. */
export type EnumContract = [
  // AccountStatus
  Expect<Same<AccountStatus, Field<'RegistrationResponse', 'status'>>>,
  Expect<Same<AccountStatus, Field<'StudentStateView', 'accountStatus'>>>,
  // ConsentPurpose
  Expect<Same<ConsentPurpose, Field<'ConsentRequest', 'purpose'>>>,
  Expect<Same<ConsentPurpose, Field<'ConsentSummary', 'purpose'>>>,
  Expect<Same<ConsentPurpose, ElementOf<Field<'StudentStateView', 'pendingConsents'>>>>,
  Expect<Same<ConsentPurpose, Field<'TermsAcceptance', 'purpose'>>>,
  Expect<Same<ConsentPurpose, Field<'TermsVersionSummary', 'purpose'>>>,
  Expect<Same<ConsentPurpose, operations['revokeConsent']['parameters']['path']['purpose']>>,
  // ConsentGrantedBy
  Expect<Same<ConsentGrantedBy, Field<'ConsentSummary', 'grantedBy'>>>,
  // GoalStatus
  Expect<Same<GoalStatus, Field<'GoalResponse', 'status'>>>,
  // PlanStatus
  Expect<Same<PlanStatus, Field<'PlanSummaryView', 'status'>>>,
  Expect<Same<PlanStatus, Field<'StudyPlanResponse', 'status'>>>,
  // PlannedSessionKind
  Expect<Same<PlannedSessionKind, Field<'Entry', 'kind'>>>,
  Expect<Same<PlannedSessionKind, Field<'PlannedSessionResponse', 'kind'>>>,
  // GenerationRequestStatus
  Expect<Same<GenerationRequestStatus, Field<'GenerationRequestResponse', 'status'>>>,
  // PlanGenerationFailure
  Expect<Same<PlanGenerationFailure, Field<'GenerationRequestResponse', 'failureReason'>>>,
  // SessionKind
  Expect<Same<SessionKind, Field<'StartSessionRequest', 'kind'>>>,
  Expect<Same<SessionKind, Field<'RetroactiveSessionRequest', 'kind'>>>,
  Expect<Same<SessionKind, Field<'StudySessionResponse', 'kind'>>>,
  Expect<Same<SessionKind, Field<'StudentPanelSessionSummary', 'kind'>>>,
  // SessionSource
  Expect<Same<SessionSource, Field<'StudySessionResponse', 'source'>>>,
  Expect<Same<SessionSource, Field<'StudentPanelSessionSummary', 'source'>>>,
  // SessionStatus
  Expect<Same<SessionStatus, Field<'Execution', 'status'>>>,
  Expect<Same<SessionStatus, Field<'StudySessionResponse', 'status'>>>,
  Expect<Same<SessionStatus, Field<'StudentPanelSessionSummary', 'status'>>>,
  // DurationSource
  Expect<Same<DurationSource, Field<'Execution', 'durationSource'>>>,
  Expect<Same<DurationSource, Field<'StudySessionResponse', 'durationSource'>>>,
  Expect<Same<DurationSource, Field<'StudentPanelSessionSummary', 'durationSource'>>>,
  // RecallRating
  Expect<Same<RecallRating, Field<'CompleteSessionRequest', 'recallRating'>>>,
  Expect<Same<RecallRating, Field<'RetroactiveSessionRequest', 'recallRating'>>>,
  Expect<Same<RecallRating, Field<'Execution', 'recallRating'>>>,
  Expect<Same<RecallRating, Field<'Point', 'rating'>>>,
  Expect<Same<RecallRating, Field<'StudySessionResponse', 'recallRating'>>>,
  Expect<Same<RecallRating, Field<'StudentPanelSessionSummary', 'recallRating'>>>,
  // ClassroomStatus
  Expect<Same<ClassroomStatus, Field<'ClassroomResponse', 'status'>>>,
  // EnrollmentEndReason
  Expect<Same<EnrollmentEndReason, Field<'EnrollmentResponse', 'endedReason'>>>,
  // ErasureRequestStatus
  Expect<Same<ErasureRequestStatus, Field<'ErasureRequestView', 'status'>>>,
  // DayOfWeek
  Expect<Same<DayOfWeek, Field<'AvailabilityRequest', 'dayOfWeek'>>>,
  Expect<Same<DayOfWeek, Field<'AvailabilityResponse', 'dayOfWeek'>>>,
  // ProblemType: the snapshot types `ProblemDetails.type` as a plain `uri` string (STATE.md F7),
  // so only one direction can be checked. The list itself is verified against ApiErrorType.java.
  Expect<ProblemType extends Field<'ProblemDetails', 'type'> ? true : false>,
];
