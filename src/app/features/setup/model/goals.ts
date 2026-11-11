import {
  type ApiFailure,
  TransportFailure,
  isConflict,
  isResourceNotFound,
  isValidationFailed,
} from '../../../core/api/api-problem';
import { GOAL_STATUSES, type GoalStatus } from '../../../core/api/contract/enums';
import type {
  GoalRequest,
  GoalResponse,
  GoalRevisionRequest,
  SubjectResponse,
  TopicResponse,
} from '../../../core/api/contract/models';
import { commonFailureOf } from './availability';

/**
 * The priority scale of a goal, 1 to 5. **Higher means more pressing.** The contract does not say
 * which way it runs; the backend does, in every place it is written — `GoalRequest`,
 * `GoalResponse`, `StudyGoal` and `StudyGoalView` ("1 to 5, higher meaning more pressing"), the
 * repository's `…OrderByPriorityDesc…` reads ("most pressing first"), and the Core request mapping
 * `coreclient.contract.PlanRequest.Goal` — and the Core agrees: `GoalPriorityImportance` takes the
 * priority as the importance of every topic of the subject, gives a subject with no goal 1, "the
 * lowest the contract documents", and collapses duplicates "to the higher priority".
 */
export const PRIORITIES = [1, 2, 3, 4, 5] as const;
export type Priority = (typeof PRIORITIES)[number];
/** What the server records when the priority is omitted (`GoalRequest.priorityOrDefault`). */
export const DEFAULT_PRIORITY: Priority = 3;
export const LEAST_PRESSING: Priority = 1;
export const MOST_PRESSING: Priority = 5;

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'number' && (PRIORITIES as readonly number[]).includes(value);
}

/**
 * A goal: a WHOLE subject (closed decision L3 — every topic enters, no exclusions in v1). The
 * target date is a prioritisation constraint and never the plan's horizon (F3): the screen shows it
 * as the date the student gave, with no countdown and no "until" attached to any plan.
 */
export interface Goal {
  readonly id: string;
  readonly subjectId: string;
  readonly targetDate: string | null;
  readonly priority: Priority;
  readonly status: GoalStatus;
  readonly createdAt: string | null;
  readonly closedAt: string | null;
}

/** A subject of the catalogue. `position` is not kept: it is a code-order rank, not a ranking. */
export interface Subject {
  readonly id: string;
  readonly name: string;
}

/** A topic, in curricular order — context for a choice, never itself chosen. */
export interface Topic {
  readonly id: string;
  readonly name: string;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function unreadable(route: string): TransportFailure {
  return new TransportFailure('unreadable', { method: 'GET', route, correlationId: null });
}

/** Reads `GET /api/v1/goals` strictly: one unreadable goal makes the read `unreadable`. */
export function goalsFrom(body: unknown, route: string): Goal[] {
  if (!Array.isArray(body)) {
    throw unreadable(route);
  }
  return (body as GoalResponse[]).map((item) => {
    const goal = goalFrom(item);
    if (goal === null) {
      throw unreadable(route);
    }
    return goal;
  });
}

export function goalFrom(item: GoalResponse | null | undefined): Goal | null {
  if (
    item === null ||
    typeof item !== 'object' ||
    typeof item.id !== 'string' ||
    typeof item.subjectId !== 'string' ||
    !isPriority(item.priority) ||
    !(GOAL_STATUSES as readonly string[]).includes(item.status ?? '') ||
    (item.targetDate != null && !LOCAL_DATE.test(item.targetDate))
  ) {
    return null;
  }
  return {
    id: item.id,
    subjectId: item.subjectId,
    targetDate: item.targetDate ?? null,
    priority: item.priority,
    status: item.status as GoalStatus,
    createdAt: item.createdAt ?? null,
    closedAt: item.closedAt ?? null,
  };
}

/** Reads `GET /api/v1/subjects`, in the server's order (catalogue-code order, which is not a rank). */
export function subjectsFrom(body: unknown, route: string): Subject[] {
  if (!Array.isArray(body)) {
    throw unreadable(route);
  }
  return (body as SubjectResponse[]).map((item) => {
    if (item === null || typeof item.id !== 'string' || typeof item.name !== 'string') {
      throw unreadable(route);
    }
    return { id: item.id, name: item.name };
  });
}

/** Reads `GET /api/v1/subjects/{subjectId}/topics`, keeping the server's curricular order. */
export function topicsFrom(body: unknown, route: string): Topic[] {
  if (!Array.isArray(body)) {
    throw unreadable(route);
  }
  return (body as TopicResponse[]).map((item) => {
    if (item === null || typeof item.id !== 'string' || typeof item.name !== 'string') {
      throw unreadable(route);
    }
    return { id: item.id, name: item.name };
  });
}

/** Active goals, in the server's order (most pressing first, then newest). */
export function activeGoals(goals: readonly Goal[]): Goal[] {
  return goals.filter((goal) => goal.status === 'ACTIVE');
}

/**
 * Closed goals — achieved and abandoned alike, in one list, most recently closed first. Shown
 * because "what was abandoned is part of what the student has decided" (`GET /api/v1/goals`).
 */
export function closedGoals(goals: readonly Goal[]): Goal[] {
  return goals
    .filter((goal) => goal.status !== 'ACTIVE')
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
}

/**
 * The subjects a new goal can be set for: those with no ACTIVE goal. At most one active goal per
 * subject (`POST /api/v1/goals`); offering a subject that has one would only earn a 409. A closed
 * goal frees its subject ("the subject becomes free for a new goal").
 */
export function subjectsOpenForGoal(
  subjects: readonly Subject[],
  goals: readonly Goal[],
): Subject[] {
  const taken = new Set(activeGoals(goals).map((goal) => goal.subjectId));
  return subjects.filter((subject) => !taken.has(subject.id));
}

/** The subject name of a goal, or null when the catalogue no longer lists it. */
export function subjectNameOf(goal: Goal, subjects: readonly Subject[]): string | null {
  return subjects.find((subject) => subject.id === goal.subjectId)?.name ?? null;
}

/** What the new-goal form holds. */
export interface GoalDraft {
  readonly subjectId: string;
  readonly targetDate: string;
  readonly priority: Priority;
}

/** The body of `POST /api/v1/goals`. The priority is sent as shown, the default included. */
export function goalRequestOf(draft: GoalDraft): GoalRequest {
  return {
    subjectId: draft.subjectId,
    priority: draft.priority,
    ...(draft.targetDate === '' ? {} : { targetDate: draft.targetDate }),
  };
}

/** What the revision form holds. */
export interface RevisionDraft {
  readonly priority: Priority;
  readonly targetDate: string;
}

/**
 * The revision form, filled with the values READ for this goal — never with remembered ones.
 * `PATCH /api/v1/goals/{goalId}` replaces what the goal asks for: `priority` is required, and an
 * omitted `targetDate` CLEARS the date (backend `GoalRevisionRequest`: "Omitting it clears the date
 * rather than leaving it alone"; `StudyGoal.revise` assigns it unconditionally; observed on
 * `46b5b3c`). So revising only the date sends back the priority read, and revising only the
 * priority sends back the date read.
 */
export function revisionDraftOf(goal: Goal): RevisionDraft {
  return { priority: goal.priority, targetDate: goal.targetDate ?? '' };
}

/** The body of `PATCH /api/v1/goals/{goalId}`: always both members the form holds. */
export function revisionRequestOf(draft: RevisionDraft): GoalRevisionRequest {
  return {
    priority: draft.priority,
    ...(draft.targetDate === '' ? {} : { targetDate: draft.targetDate }),
  };
}

/** Whether the form's date can be sent: empty (no date) or a calendar date. */
export function targetDateProblem(value: string): 'invalid' | null {
  return value === '' || LOCAL_DATE.test(value) ? null : 'invalid';
}

/** What setting a goal came to. */
export type SetGoalOutcome =
  | { readonly kind: 'set'; readonly goal: Goal | null }
  /** 409 `conflict`: an active goal for that subject already exists (a race with another tab). */
  | { readonly kind: 'duplicate' }
  /** 404: the subject is not in the catalogue any more. */
  | { readonly kind: 'unknown-subject' }
  | { readonly kind: 'invalid'; readonly fields: ReadonlySet<'priority' | 'targetDate'> }
  | { readonly kind: 'not-processable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function setGoalFailureOf(failure: ApiFailure): SetGoalOutcome {
  if (isConflict(failure)) {
    return { kind: 'duplicate' };
  }
  if (isResourceNotFound(failure)) {
    return { kind: 'unknown-subject' };
  }
  if (isValidationFailed(failure)) {
    return { kind: 'invalid', fields: invalidFields(failure) };
  }
  return commonFailureOf(failure);
}

/** What revising, abandoning or achieving a goal came to. */
export type GoalActOutcome =
  | { readonly kind: 'done'; readonly goal: Goal | null }
  /** 409 `conflict`: "The goal has already been closed". */
  | { readonly kind: 'closed' }
  /** 404: no such goal for this account. */
  | { readonly kind: 'gone' }
  | { readonly kind: 'invalid'; readonly fields: ReadonlySet<'priority' | 'targetDate'> }
  | { readonly kind: 'not-processable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function goalActFailureOf(failure: ApiFailure): GoalActOutcome {
  if (isConflict(failure)) {
    return { kind: 'closed' };
  }
  if (isResourceNotFound(failure)) {
    return { kind: 'gone' };
  }
  if (isValidationFailed(failure)) {
    return { kind: 'invalid', fields: invalidFields(failure) };
  }
  return commonFailureOf(failure);
}

function invalidFields(failure: ApiFailure): ReadonlySet<'priority' | 'targetDate'> {
  if (!isValidationFailed(failure)) {
    return new Set();
  }
  const named = (failure.problem.errors ?? []).map((error) => error.field);
  return new Set((['priority', 'targetDate'] as const).filter((field) => named.includes(field)));
}
