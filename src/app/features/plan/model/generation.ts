import { InjectionToken } from '@angular/core';

import {
  type ApiFailure,
  TransportFailure,
  isAccessDenied,
  isConflict,
  isRateLimitExceeded,
  isSetupIncomplete,
} from '../../../core/api/api-problem';
import {
  GENERATION_REQUEST_STATUSES,
  type GenerationRequestStatus,
  PLAN_GENERATION_FAILURES,
  type PlanGenerationFailure,
} from '../../../core/api/contract/enums';
import type { GenerationRequestResponse } from '../../../core/api/contract/models';

/**
 * A plan generation job, as this client reads it (`GenerationRequestResponse`).
 *
 * `progress` is NOT read. The operation says it "is absent whenever it is indeterminate, which in
 * this version is always: the core reports none, and nothing here invents one" (backend K14,
 * decision F4). Neither does this client: the screen shows elapsed time and what is happening, and
 * nothing that implies a proportion.
 */
export interface GenerationJob {
  readonly id: string;
  readonly status: GenerationRequestStatus;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  /** Counted when a worker claims the job: 1 on the first attempt, 2 on the second… */
  readonly attemptCount: number;
  readonly failureReason: PlanGenerationFailure | null;
  /** Present once the job is READY. */
  readonly planId: string | null;
}

/** Reads a `GenerationRequestResponse` strictly, or null. */
export function jobOf(body: unknown): GenerationJob | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const job = body as GenerationRequestResponse;
  const status = job.status;
  if (
    typeof job.id !== 'string' ||
    typeof status !== 'string' ||
    !(GENERATION_REQUEST_STATUSES as readonly string[]).includes(status) ||
    typeof job.requestedAt !== 'string' ||
    Number.isNaN(Date.parse(job.requestedAt)) ||
    (job.startedAt != null && typeof job.startedAt !== 'string') ||
    (job.attemptCount != null && !(Number.isInteger(job.attemptCount) && job.attemptCount >= 0)) ||
    (job.failureReason != null &&
      !(PLAN_GENERATION_FAILURES as readonly string[]).includes(job.failureReason)) ||
    (job.planId != null && typeof job.planId !== 'string') ||
    (status === 'READY' && typeof job.planId !== 'string') ||
    (status === 'FAILED' && job.failureReason == null)
  ) {
    return null;
  }
  return {
    id: job.id,
    status,
    requestedAt: job.requestedAt,
    startedAt: job.startedAt ?? null,
    attemptCount: job.attemptCount ?? 0,
    failureReason: job.failureReason ?? null,
    planId: job.planId ?? null,
  };
}

/** Reads a job body or fails the read as `unreadable`. */
export function jobFrom(body: unknown, route: string, method: 'GET' | 'POST'): GenerationJob {
  const job = jobOf(body);
  if (job === null) {
    throw new TransportFailure('unreadable', { method, route, correlationId: null });
  }
  return job;
}

/** READY, FAILED and CANCELLED end a job: nothing more will change, and the poll stops. */
export function isTerminal(status: GenerationRequestStatus): boolean {
  return status === 'READY' || status === 'FAILED' || status === 'CANCELLED';
}

/**
 * What the screen says while a job is not finished.
 *
 * - `queued`: PENDING, never attempted. It leaves the queue only at a pass of the server's worker.
 * - `retrying`: PENDING again after an attempt — "PENDING with attemptCount ≥ 1 means trying
 *   again" (backend `FLUXO_DE_PLANO_FRONTEND.md`, section 3): the service that builds plans did not answer,
 *   and the server will try again by itself.
 * - `running`: a worker holds it and is waiting for the plan.
 */
export type WaitingPhase = 'queued' | 'retrying' | 'running';

export function waitingPhaseOf(job: GenerationJob): WaitingPhase | null {
  switch (job.status) {
    case 'PENDING':
      return job.attemptCount >= 1 ? 'retrying' : 'queued';
    case 'RUNNING':
      return 'running';
    default:
      return null;
  }
}

/**
 * When the client asks again, and when it stops asking (ADR 0005).
 *
 * The server's worker looks for work every 10 s (`poll-cron: 0/10 * * * * *`, one job per pass,
 * backend K15), so a job leaves PENDING only at a 10-second boundary; with the default engine the
 * call to the Core then takes well under a second (observed: 0.4 s). Asking every second would not
 * learn anything sooner. So:
 *
 * - every `fastMs` (3 s) during the first `fastUntilMs` (60 s): the normal case ends at the first
 *   or second pass, and 3 s adds at most 3 s (1.5 s on average) to a wait of up to 10 s;
 * - every `slowMs` (10 s) after that: past a minute the job is waiting for a retry (30 s, then 60 s
 *   backoff) or behind other jobs in a queue that moves one job per 10-second pass, and nothing
 *   changes faster than the worker's cycle;
 * - stop at `ceilingMs` (5 min) after the request: the longest documented path to a terminal state
 *   with a Core that refuses connections is about two minutes (three attempts with backoff). Past
 *   five minutes the only documented causes are a Core that accepts and never answers (up to ~31
 *   minutes) or a long queue, and a student watching a clock learns nothing from more requests.
 *   The screen says the job is still running, that they can leave and come back, and offers one
 *   manual check.
 *
 * Paused while the tab is hidden; on return, one immediate check, then the ladder from where the
 * elapsed time is.
 */
export interface PollSchedule {
  readonly fastMs: number;
  readonly fastUntilMs: number;
  readonly slowMs: number;
  readonly ceilingMs: number;
}

export const DEFAULT_POLL_SCHEDULE: PollSchedule = {
  fastMs: 3_000,
  fastUntilMs: 60_000,
  slowMs: 10_000,
  ceilingMs: 300_000,
};

/** The schedule in force; tests provide a faster one. */
export const POLL_SCHEDULE = new InjectionToken<PollSchedule>('POLL_SCHEDULE', {
  factory: () => DEFAULT_POLL_SCHEDULE,
});

/** The clock the elapsed time is measured against; tests provide their own. */
export const GENERATION_CLOCK = new InjectionToken<() => number>('GENERATION_CLOCK', {
  factory: () => () => Date.now(),
});

/**
 * How long to wait before the next check, given how long ago the job was requested, or null when
 * the ceiling is reached and the client stops asking on its own.
 */
export function nextPollDelay(elapsedMs: number, schedule: PollSchedule): number | null {
  if (elapsedMs >= schedule.ceilingMs) {
    return null;
  }
  const step = elapsedMs < schedule.fastUntilMs ? schedule.fastMs : schedule.slowMs;
  return Math.min(step, schedule.ceilingMs - elapsedMs);
}

/** Milliseconds since the request, never negative: the client's clock may run behind the server's. */
export function elapsedSince(requestedAt: string, now: number): number {
  return Math.max(0, now - Date.parse(requestedAt));
}

/** "0:07", "2:05", "12:00" — minutes and seconds, as a clock reads. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** The elapsed time for a screen reader, in words: "7 segundos", "2 minutos". */
export function describeElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  if (total < 60) {
    return `${total} ${total === 1 ? 'segundo' : 'segundos'}`;
  }
  const minutes = Math.floor(total / 60);
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

/**
 * What asking for a plan came to (`POST /api/v1/study-plans/generation-requests`).
 *
 * The 409 has two meanings — "A job is already running, or there is nothing to plan yet" — and
 * they arrive with two problem TYPES (`conflict`, `setup-incomplete`), so the type decides, never
 * the status (R6). The session state (`activeGenerationJobId`, `setupComplete`) keeps the client
 * from asking in the first place; a 409 is then a race, and `/me/state` is read again — through the
 * store, its only reader — to find the job to follow or to let the chain route.
 */
export type RequestOutcome =
  | { readonly kind: 'queued'; readonly job: GenerationJob }
  | { readonly kind: 'already-running' }
  | { readonly kind: 'nothing-to-plan' }
  | { readonly kind: 'not-processable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function requestFailureOf(failure: ApiFailure): RequestOutcome {
  if (isConflict(failure)) {
    return { kind: 'already-running' };
  }
  if (isSetupIncomplete(failure)) {
    return { kind: 'nothing-to-plan' };
  }
  if (isAccessDenied(failure)) {
    return { kind: 'not-processable' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

/** The one failure after which the screen suggests asking again now (see the next-step labels). */
export function suggestsAskingAgainNow(reason: PlanGenerationFailure): boolean {
  return reason === 'CORE_UNAVAILABLE';
}

/** Failures whose remedy is in the student's setup: the screen links to availability and goals. */
export function pointsToSetup(reason: PlanGenerationFailure): boolean {
  return reason === 'CORE_REJECTED' || reason === 'NOTHING_TO_PLAN';
}
