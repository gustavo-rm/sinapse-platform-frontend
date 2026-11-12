import {
  type ApiFailure,
  TransportFailure,
  apiFailureOf,
  isRateLimitExceeded,
  isResourceNotFound,
} from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import {
  PLANNED_SESSION_KINDS,
  PLAN_STATUSES,
  type PlanStatus,
  type PlannedSessionKind,
} from '../../../core/api/contract/enums';
import type {
  PlanSummaryView,
  PlannedSessionResponse,
  StudyPlanResponse,
  SubjectResponse,
  TopicResponse,
} from '../../../core/api/contract/models';

/*
 * The plan, as this client reads it.
 *
 * `fitness` — present on `StudyPlanResponse` and `PlanSummaryView`, "as the core produced it" — is
 * NEVER copied into these types. The Core puts the engine and its build in it (backend K17), so on
 * a pilot that compares engines, showing it tells a student which arm of the experiment they are
 * in. Dropping it at the parse means no template, title, log or data attribute can reach it: there
 * is nothing to bind. `no-leak.spec.ts` proves it on every plan route, with a negative control.
 */

/** A plan, from `GET /study-plans/current`, `/study-plans/{planId}` or `/study-plans`. */
export interface Plan {
  readonly id: string;
  readonly status: PlanStatus;
  /** First day of the horizon, a LOCAL date. */
  readonly horizonStart: string;
  /** Last day of the horizon, inclusive, a LOCAL date. */
  readonly horizonEnd: string;
  readonly createdAt: string;
  readonly supersededAt: string | null;
  readonly supersededByPlanId: string | null;
}

/** One subject's share of a plan (`PlanSummaryView.bySubject[]`). */
export interface SubjectShare {
  readonly subjectId: string;
  readonly subjectName: string;
  readonly plannedMinutes: number;
  readonly sessionCount: number;
}

/**
 * Adherence over the part of the plan that has fallen due. Two kinds, never a default:
 *
 * - `nothing-due`: the server sent no `ratio`, which it does "rather than zero when nothing has
 *   fallen due yet". Not a zero: showing 0% would tell the student they failed at something that
 *   did not exist yet.
 * - `measured`: `executed` of `plannedElapsed`, and the ratio, which is only a support for the bar.
 */
export type Adherence =
  | { readonly kind: 'nothing-due' }
  | {
      readonly kind: 'measured';
      readonly executed: number;
      readonly plannedElapsed: number;
      readonly ratio: number;
    };

/** `GET /study-plans/{planId}/summary`, without `fitness`. */
export interface PlanSummary {
  readonly planId: string;
  readonly status: PlanStatus;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly totalPlannedMinutes: number;
  readonly bySubject: readonly SubjectShare[];
  readonly adherence: Adherence;
}

/** A planned session (`PlannedSessionResponse`). It carries a topic id and NO name (F2). */
export interface PlannedSession {
  readonly id: string;
  readonly topicId: string;
  readonly kind: PlannedSessionKind;
  readonly scheduledStart: string;
  readonly durationMinutes: number;
  readonly sequenceIndex: number;
}

/** What the catalogue says about a topic: its name and its subject. */
export interface CatalogueTopic {
  readonly name: string;
  readonly subjectId: string;
}

/** `topicId` → name and subject, built once per screen from the subjects of the plan. */
export type CatalogueMap = ReadonlyMap<string, CatalogueTopic>;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function unreadable(route: string): TransportFailure {
  return new TransportFailure('unreadable', { method: 'GET', route, correlationId: null });
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** Reads one `StudyPlanResponse` strictly, or null. `fitness` is not read. */
export function planOf(item: StudyPlanResponse | null | undefined): Plan | null {
  if (
    item === null ||
    typeof item !== 'object' ||
    typeof item.id !== 'string' ||
    !isOneOf(item.status, PLAN_STATUSES) ||
    typeof item.horizonStart !== 'string' ||
    !LOCAL_DATE.test(item.horizonStart) ||
    typeof item.horizonEnd !== 'string' ||
    !LOCAL_DATE.test(item.horizonEnd) ||
    !isInstant(item.createdAt) ||
    (item.supersededAt != null && !isInstant(item.supersededAt)) ||
    (item.supersededByPlanId != null && typeof item.supersededByPlanId !== 'string')
  ) {
    return null;
  }
  return {
    id: item.id,
    status: item.status,
    horizonStart: item.horizonStart,
    horizonEnd: item.horizonEnd,
    createdAt: item.createdAt,
    supersededAt: item.supersededAt ?? null,
    supersededByPlanId: item.supersededByPlanId ?? null,
  };
}

/** `GET /study-plans/current` or `/study-plans/{planId}`: one plan, or the read is unreadable. */
export function planFrom(body: unknown, route: string): Plan {
  const plan = planOf(body as StudyPlanResponse);
  if (plan === null) {
    throw unreadable(route);
  }
  return plan;
}

/** `GET /study-plans`, in the server's order (newest first, as it returns them). */
export function plansFrom(body: unknown, route: string): Plan[] {
  if (!Array.isArray(body)) {
    throw unreadable(route);
  }
  return (body as StudyPlanResponse[]).map((item) => {
    const plan = planOf(item);
    if (plan === null) {
      throw unreadable(route);
    }
    return plan;
  });
}

/**
 * Reads `adherence`. An absent ratio is "nothing has fallen due yet" — whatever the counts say —
 * because that is how the server says it. A present ratio needs both counts.
 */
export function adherenceOf(value: unknown): Adherence | null {
  if (value === undefined || value === null) {
    return { kind: 'nothing-due' };
  }
  if (typeof value !== 'object') {
    return null;
  }
  const { executed, plannedElapsed, ratio } = value as Record<string, unknown>;
  if (ratio === undefined || ratio === null) {
    return { kind: 'nothing-due' };
  }
  if (
    typeof ratio !== 'number' ||
    !Number.isFinite(ratio) ||
    ratio < 0 ||
    !isCount(executed) ||
    !isCount(plannedElapsed) ||
    plannedElapsed === 0
  ) {
    return null;
  }
  return { kind: 'measured', executed, plannedElapsed, ratio: Math.min(ratio, 1) };
}

/** `GET /study-plans/{planId}/summary`, without `fitness`. */
export function summaryFrom(body: unknown, route: string): PlanSummary {
  if (typeof body !== 'object' || body === null) {
    throw unreadable(route);
  }
  const view = body as PlanSummaryView;
  const adherence = adherenceOf(view.adherence);
  if (
    typeof view.planId !== 'string' ||
    !isOneOf(view.status, PLAN_STATUSES) ||
    typeof view.horizonStart !== 'string' ||
    !LOCAL_DATE.test(view.horizonStart) ||
    typeof view.horizonEnd !== 'string' ||
    !LOCAL_DATE.test(view.horizonEnd) ||
    !isCount(view.totalPlannedMinutes) ||
    !Array.isArray(view.bySubject) ||
    adherence === null
  ) {
    throw unreadable(route);
  }
  const bySubject = view.bySubject.map((share) => {
    if (
      share === null ||
      typeof share.subjectId !== 'string' ||
      typeof share.subjectName !== 'string' ||
      !isCount(share.plannedMinutes) ||
      !isCount(share.sessionCount)
    ) {
      throw unreadable(route);
    }
    return {
      subjectId: share.subjectId,
      subjectName: share.subjectName,
      plannedMinutes: share.plannedMinutes,
      sessionCount: share.sessionCount,
    };
  });
  return {
    planId: view.planId,
    status: view.status,
    horizonStart: view.horizonStart,
    horizonEnd: view.horizonEnd,
    totalPlannedMinutes: view.totalPlannedMinutes,
    bySubject,
    adherence,
  };
}

/** `GET /study-plans/{planId}/sessions`, in sequence order. */
export function sessionsFrom(body: unknown, route: string): PlannedSession[] {
  if (!Array.isArray(body)) {
    throw unreadable(route);
  }
  return (body as PlannedSessionResponse[])
    .map((item) => {
      if (
        item === null ||
        typeof item.id !== 'string' ||
        typeof item.topicId !== 'string' ||
        !isOneOf(item.kind, PLANNED_SESSION_KINDS) ||
        !isInstant(item.scheduledStart) ||
        !isCount(item.durationMinutes) ||
        !isCount(item.sequenceIndex)
      ) {
        throw unreadable(route);
      }
      return {
        id: item.id,
        topicId: item.topicId,
        kind: item.kind,
        scheduledStart: item.scheduledStart,
        durationMinutes: item.durationMinutes,
        sequenceIndex: item.sequenceIndex,
      };
    })
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
}

/** `GET /subjects`: the identifiers only — the plan's summary already names its subjects. */
export function subjectIdsFrom(body: unknown, route: string): string[] {
  if (!Array.isArray(body)) {
    throw unreadable(route);
  }
  return (body as SubjectResponse[]).map((item) => {
    if (item === null || typeof item.id !== 'string') {
      throw unreadable(route);
    }
    return item.id;
  });
}

/** `GET /subjects/{subjectId}/topics`, as entries of the catalogue map. */
export function topicEntriesFrom(
  body: unknown,
  subjectId: string,
  route: string,
): [string, CatalogueTopic][] {
  if (!Array.isArray(body)) {
    throw unreadable(route);
  }
  return (body as TopicResponse[]).map((item) => {
    if (item === null || typeof item.id !== 'string' || typeof item.name !== 'string') {
      throw unreadable(route);
    }
    return [item.id, { name: item.name, subjectId }];
  });
}

/**
 * A topic's name for the screen. A topic the catalogue no longer lists is said in words — never
 * its identifier (F2).
 */
export function topicNameOf(topicId: string, catalogue: CatalogueMap): string {
  return catalogue.get(topicId)?.name ?? 'Tópico que não está mais no catálogo';
}

/**
 * How many of a subject's topics the plan schedules, from the sessions and the catalogue. The
 * horizon is fixed and short (decision F3): a goal is a whole subject, and a plan may hold only part
 * of it. Saying how much avoids suggesting that the plan covers the goal.
 */
export function coverageOf(
  subjectId: string,
  sessions: readonly PlannedSession[],
  catalogue: CatalogueMap,
): { readonly scheduled: number; readonly total: number } {
  const total = [...catalogue.values()].filter((topic) => topic.subjectId === subjectId).length;
  const scheduled = new Set(
    sessions
      .filter((session) => catalogue.get(session.topicId)?.subjectId === subjectId)
      .map((session) => session.topicId),
  ).size;
  return { scheduled, total };
}

/**
 * Sessions the plan placed BEFORE it was created. The horizon starts on the server's today, and
 * the optimiser fills that day's windows even when they are already over (observed, FE-8): such a
 * session falls due at once and enters adherence as not executed. The screen says so, so that the
 * count does not read as something the student failed to do.
 */
export function sessionsBeforeCreation(
  sessions: readonly PlannedSession[],
  createdAt: string,
): number {
  const created = Date.parse(createdAt);
  return sessions.filter((session) => Date.parse(session.scheduledStart) < created).length;
}

/**
 * Where to start: the first session, in sequence, that has not begun yet at `now`. Null when every
 * session has begun (the plan is behind the clock). Whether a past one was executed is the
 * learning record's to say (FE-9), not this screen's.
 */
export function nextSessionOf(
  sessions: readonly PlannedSession[],
  now: number,
): PlannedSession | null {
  return sessions.find((session) => Date.parse(session.scheduledStart) >= now) ?? null;
}

/** Minutes as read aloud: "50 min", "2 h", "13 h 40 min". Hours from 120 minutes on. */
export function formatMinutes(minutes: number): string {
  if (minutes < 120) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "1 sessão", "15 sessões". */
export function sessionCountText(count: number): string {
  return `${count} ${count === 1 ? 'sessão' : 'sessões'}`;
}

/** The plan that replaced `plan` in `plans`, when the list holds it. */
export function successorOf(plan: Plan, plans: readonly Plan[]): Plan | null {
  return plan.supersededByPlanId === null
    ? null
    : (plans.find((candidate) => candidate.id === plan.supersededByPlanId) ?? null);
}

/** Up to eight subjects get a fixed series slot, in order of arrival; the ninth on are "Outras". */
export const SERIES_SLOTS = 8;

/** What `GET /api/v1/study-plans/current` came to. A 404 is `none`: a normal state, not an error. */
export type CurrentPlanState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'plan'; readonly plan: Plan }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

/**
 * Reads the outcome of `current`. "A student with no plan yet has not run the generation job, or
 * its last run has not finished" — so `resource-not-found` is the state `none`, and a newly set-up
 * student sees what a plan is and how to ask for one, never an error screen.
 */
export function currentPlanStateOf(value: Plan | undefined, error: unknown): CurrentPlanState {
  if (value !== undefined) {
    return { kind: 'plan', plan: value };
  }
  if (error === undefined) {
    return { kind: 'loading' };
  }
  const failure =
    apiFailureOf(error) ??
    new TransportFailure('unreadable', {
      method: 'GET',
      route: ApiRoutes.planning.currentStudyPlan,
      correlationId: null,
    });
  if (isResourceNotFound(failure)) {
    return { kind: 'none' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}
