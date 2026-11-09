/**
 * The names features use for the API's bodies: one alias per schema of the vendored snapshot,
 * under the schema's own name, so a feature writes `StudentStateView` and never
 * `components['schemas']['StudentStateView']`.
 *
 * Types only. Every schema of `openapi.json` has exactly one alias here, and nothing else does:
 * `scripts/contract.test.mjs` compares the two lists. A schema added on the server fails that test
 * until it is aliased.
 *
 * Most response schemas in the snapshot mark no property as required, so their members come out
 * optional. That is the contract as published; a mapper in a feature's `model/` decides what an
 * absent member means, and this file does not paper over it.
 */
import type { components } from './schema';

type Schemas = components['schemas'];

export type Adherence = Schemas['Adherence'];
export type AvailabilityClosureRequest = Schemas['AvailabilityClosureRequest'];
export type AvailabilityRequest = Schemas['AvailabilityRequest'];
export type AvailabilityResponse = Schemas['AvailabilityResponse'];
export type ClassroomRequest = Schemas['ClassroomRequest'];
export type ClassroomResponse = Schemas['ClassroomResponse'];
export type ClassroomRosterView = Schemas['ClassroomRosterView'];
export type CompleteSessionRequest = Schemas['CompleteSessionRequest'];
export type ConsentRequest = Schemas['ConsentRequest'];
export type ConsentSummary = Schemas['ConsentSummary'];
export type DailyAgendaView = Schemas['DailyAgendaView'];
export type Day = Schemas['Day'];
export type EmailVerificationRequest = Schemas['EmailVerificationRequest'];
export type EnrollmentResponse = Schemas['EnrollmentResponse'];
export type Entry = Schemas['Entry'];
export type ErasureRequestView = Schemas['ErasureRequestView'];
export type Execution = Schemas['Execution'];
export type GenerationRequestResponse = Schemas['GenerationRequestResponse'];
export type GoalRequest = Schemas['GoalRequest'];
export type GoalResponse = Schemas['GoalResponse'];
export type GoalRevisionRequest = Schemas['GoalRevisionRequest'];
export type InvitePreviewResponse = Schemas['InvitePreviewResponse'];
export type InviteRequest = Schemas['InviteRequest'];
export type InviteResponse = Schemas['InviteResponse'];
export type LoginRequest = Schemas['LoginRequest'];
export type PasswordChangeRequest = Schemas['PasswordChangeRequest'];
export type PasswordResetConfirmation = Schemas['PasswordResetConfirmation'];
export type PasswordResetRequest = Schemas['PasswordResetRequest'];
export type PersonalDataExport = Schemas['PersonalDataExport'];
export type PlanSummaryView = Schemas['PlanSummaryView'];
export type PlannedSessionResponse = Schemas['PlannedSessionResponse'];
export type Point = Schemas['Point'];
export type ProblemDetails = Schemas['ProblemDetails'];
export type ReaffirmationRequest = Schemas['ReaffirmationRequest'];
export type RegistrationRequest = Schemas['RegistrationRequest'];
export type RegistrationResponse = Schemas['RegistrationResponse'];
export type RetroactiveSessionRequest = Schemas['RetroactiveSessionRequest'];
export type SessionResponse = Schemas['SessionResponse'];
export type SessionSummary = Schemas['SessionSummary'];
export type StartSessionRequest = Schemas['StartSessionRequest'];
export type Student = Schemas['Student'];
export type StudentPanelSessionSummary = Schemas['StudentPanelSessionSummary'];
export type StudentPanelView = Schemas['StudentPanelView'];
export type StudentStateView = Schemas['StudentStateView'];
export type StudyPlanResponse = Schemas['StudyPlanResponse'];
export type StudySessionResponse = Schemas['StudySessionResponse'];
export type SubjectMinutes = Schemas['SubjectMinutes'];
export type SubjectPlan = Schemas['SubjectPlan'];
export type SubjectResponse = Schemas['SubjectResponse'];
export type TeacherAccessPeriod = Schemas['TeacherAccessPeriod'];
export type TermsAcceptance = Schemas['TermsAcceptance'];
export type TermsVersionSummary = Schemas['TermsVersionSummary'];
export type TopicResponse = Schemas['TopicResponse'];
export type TopicTrajectory = Schemas['TopicTrajectory'];
export type ValidationError = Schemas['ValidationError'];
export type VisibilityDescription = Schemas['VisibilityDescription'];
