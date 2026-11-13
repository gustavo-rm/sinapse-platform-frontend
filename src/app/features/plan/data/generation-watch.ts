import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import {
  type ApiFailure,
  apiFailureOf,
  isAccessDenied,
  isRateLimitExceeded,
  isResourceNotFound,
  isUnauthenticated,
} from '../../../core/api/api-problem';
import {
  GENERATION_CLOCK,
  type GenerationJob,
  POLL_SCHEDULE,
  elapsedSince,
  isTerminal,
  nextPollDelay,
} from '../model/generation';
import { PlanApi } from './plan-api';

/**
 * Why the watch stopped asking before the job ended.
 *
 * - `ceiling`: the schedule's ceiling passed (ADR 0005). The job is still running on the server;
 *   one manual check is offered.
 * - `lost`: the job is not this account's any more (404) — erased, or never this account's.
 * - `not-processable`: 403, the account's learning data may not be processed.
 * - `rate-limited`: a 429. Never retried (`CLAUDE.md`, *Session and time, in one place*); `retryAfterSeconds` says
 *   for how long.
 * - `signed-out`: the session ended; the expiry path has already run.
 */
export type WatchHalt =
  | { readonly kind: 'ceiling' }
  | { readonly kind: 'lost' }
  | { readonly kind: 'not-processable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'signed-out' };

/**
 * Follows ONE generation job until it ends, by polling
 * `GET /api/v1/study-plans/generation-requests/{requestId}` on the schedule of ADR 0005. There is
 * no event notification in this version.
 *
 * Provided per component (`providers: [GenerationWatch]`), so its life is the screen's: when the
 * component is destroyed — the student leaves the screen — every timer is cleared and no request
 * is made afterwards. The job itself goes on on the server; coming back to the screen finds it
 * again through `activeGenerationJobId` of `/me/state`.
 *
 * Paused while the tab is hidden (`visibilitychange`); on return, one immediate check.
 */
@Injectable()
export class GenerationWatch {
  private readonly api = inject(PlanApi);
  private readonly schedule = inject(POLL_SCHEDULE);
  private readonly clock = inject(GENERATION_CLOCK);
  private readonly document = inject(DOCUMENT);

  private readonly current = signal<GenerationJob | null>(null);
  private readonly halted = signal<WatchHalt | null>(null);
  private readonly lastCheckFailure = signal<ApiFailure | null>(null);
  private readonly clockNow = signal(0);
  private readonly checking = signal(false);

  private poll: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  /** Bumped by every `watch`, so an answer for an earlier job is dropped. */
  private generation = 0;

  /** The job as last read, or null when nothing is watched. */
  readonly job = this.current.asReadonly();
  /** Why the watch stopped before the job ended, or null. */
  readonly halt = this.halted.asReadonly();
  /** The last check failed in a way worth trying again on schedule (network, 5xx, unreadable). */
  readonly checkFailure = this.lastCheckFailure.asReadonly();
  /** A check is in flight. */
  readonly busy = this.checking.asReadonly();
  /** Milliseconds since the job was requested, updated every second while it is not finished. */
  readonly elapsedMs = computed(() => {
    const job = this.current();
    return job === null ? 0 : elapsedSince(job.requestedAt, this.clockNow());
  });

  private readonly onVisibility = () => {
    if (this.document.visibilityState === 'hidden') {
      this.clearPoll();
    } else if (this.isWaiting() && this.halted() === null) {
      void this.check();
    }
  };

  constructor() {
    this.document.addEventListener('visibilitychange', this.onVisibility);
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  /**
   * Starts following a job: one already read (the 201 of the request), or one known only by its id
   * (`activeGenerationJobId`), which is read at once.
   */
  watch(job: GenerationJob | string): void {
    if (this.destroyed) {
      return;
    }
    this.generation++;
    this.clearPoll();
    this.halted.set(null);
    this.lastCheckFailure.set(null);
    this.tick();
    if (typeof job === 'string') {
      this.current.set(null);
      void this.check(job);
      return;
    }
    this.current.set(job);
    this.afterRead(job);
  }

  /** One check now: the manual one after the ceiling, or after a transient failure. */
  checkNow(): void {
    if (this.current() !== null && !this.checking()) {
      this.halted.set(null);
      void this.check();
    }
  }

  /** Forgets the job and stops everything. */
  reset(): void {
    this.generation++;
    this.clearPoll();
    this.stopTicker();
    this.current.set(null);
    this.halted.set(null);
    this.lastCheckFailure.set(null);
  }

  /** True when there is a job that has not finished. */
  isWaiting(): boolean {
    const job = this.current();
    return job !== null && !isTerminal(job.status);
  }

  private async check(id = this.current()?.id): Promise<void> {
    if (id === undefined || this.destroyed) {
      return;
    }
    const generation = this.generation;
    this.clearPoll();
    this.checking.set(true);
    try {
      const job = await this.api.generationRequest(id);
      if (generation !== this.generation || this.destroyed) {
        return;
      }
      this.lastCheckFailure.set(null);
      this.current.set(job);
      this.afterRead(job);
    } catch (error) {
      if (generation !== this.generation || this.destroyed) {
        return;
      }
      this.onCheckFailure(apiFailureOf(error));
    } finally {
      if (generation === this.generation) {
        this.checking.set(false);
      }
    }
  }

  private afterRead(job: GenerationJob): void {
    this.tick();
    if (isTerminal(job.status)) {
      this.clearPoll();
      this.stopTicker();
      return;
    }
    this.startTicker();
    this.schedulePoll();
  }

  private onCheckFailure(failure: ApiFailure | null): void {
    if (failure !== null && isUnauthenticated(failure)) {
      this.stopAll({ kind: 'signed-out' });
    } else if (failure !== null && isResourceNotFound(failure)) {
      this.stopAll({ kind: 'lost' });
    } else if (failure !== null && isAccessDenied(failure)) {
      this.stopAll({ kind: 'not-processable' });
    } else if (failure !== null && isRateLimitExceeded(failure)) {
      this.stopAll({ kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds });
    } else {
      // A network failure (after the GET's own two retries), a timeout, a 5xx, an unreadable body:
      // nothing says the job changed. Keep the schedule; the screen says the last check failed.
      this.lastCheckFailure.set(failure);
      if (this.current() !== null) {
        this.schedulePoll();
      }
    }
  }

  private stopAll(halt: WatchHalt): void {
    this.clearPoll();
    this.stopTicker();
    this.halted.set(halt);
  }

  private schedulePoll(): void {
    this.clearPoll();
    const job = this.current();
    if (job === null || this.destroyed) {
      return;
    }
    const delay = nextPollDelay(elapsedSince(job.requestedAt, this.clock()), this.schedule);
    if (delay === null) {
      // The clock stops with the polling: a running clock would say the screen is still watching.
      this.tick();
      this.stopTicker();
      this.halted.set({ kind: 'ceiling' });
      return;
    }
    if (this.document.visibilityState === 'hidden') {
      return;
    }
    this.poll = setTimeout(() => {
      this.poll = null;
      void this.check();
    }, delay);
  }

  private clearPoll(): void {
    if (this.poll !== null) {
      clearTimeout(this.poll);
      this.poll = null;
    }
  }

  private tick(): void {
    this.clockNow.set(this.clock());
  }

  private startTicker(): void {
    if (this.ticker === null && !this.destroyed) {
      this.ticker = setInterval(() => this.tick(), 1_000);
    }
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private dispose(): void {
    this.destroyed = true;
    this.generation++;
    this.clearPoll();
    this.stopTicker();
    this.document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
