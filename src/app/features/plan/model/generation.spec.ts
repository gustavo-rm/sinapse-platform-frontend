import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { PLAN_GENERATION_FAILURES } from '../../../core/api/contract/enums';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import {
  DEFAULT_POLL_SCHEDULE,
  describeElapsed,
  elapsedSince,
  formatElapsed,
  isTerminal,
  jobOf,
  nextPollDelay,
  pointsToSetup,
  requestFailureOf,
  suggestsAskingAgainNow,
  waitingPhaseOf,
} from './generation';

/** The bodies observed on `44f3d1f` (ids shortened). */
const QUEUED = {
  id: '9c68a6cc',
  status: 'PENDING',
  horizonStart: '2026-11-12',
  horizonEnd: '2026-12-10',
  requestedAt: '2026-11-12T20:41:43.186931Z',
  attemptCount: 0,
};
const READY = {
  ...QUEUED,
  status: 'READY',
  startedAt: '2026-11-12T20:41:50.006Z',
  finishedAt: '2026-11-12T20:41:50.426803Z',
  attemptCount: 1,
  planId: 'f5ef374c',
};
const REJECTED = {
  ...QUEUED,
  status: 'FAILED',
  startedAt: '2026-11-12T20:41:20.007809Z',
  finishedAt: '2026-11-12T20:41:20.147394Z',
  attemptCount: 1,
  failureReason: 'CORE_REJECTED',
};

function problem(type: ProblemType, retryAfterSeconds: number | null = null) {
  return new ApiProblemFailure(
    { type, title: 't', status: 409, detail: 'd', instance: '/r' },
    { method: 'POST', route: '/r', correlationId: null },
    retryAfterSeconds,
  );
}

describe('the generation model', () => {
  it('reads the observed bodies, and never reads progress — even when one is sent', () => {
    expect(jobOf(QUEUED)).toEqual({
      id: '9c68a6cc',
      status: 'PENDING',
      requestedAt: QUEUED.requestedAt,
      startedAt: null,
      attemptCount: 0,
      failureReason: null,
      planId: null,
    });
    expect(jobOf(READY)?.planId).toBe('f5ef374c');
    expect(jobOf(REJECTED)?.failureReason).toBe('CORE_REJECTED');
    const withProgress = jobOf({ ...QUEUED, progress: 0.42 });
    expect(withProgress).not.toBeNull();
    expect(Object.keys(withProgress ?? {})).not.toContain('progress');
  });

  it('refuses a body out of contract: an unknown status or reason, READY without a plan, FAILED without a reason', () => {
    expect(jobOf({ ...QUEUED, status: 'PAUSED' })).toBeNull();
    expect(jobOf({ ...REJECTED, failureReason: 'TIMEOUT' })).toBeNull();
    expect(jobOf({ ...READY, planId: undefined })).toBeNull();
    expect(jobOf({ ...REJECTED, failureReason: undefined })).toBeNull();
    expect(jobOf({ ...QUEUED, requestedAt: 'now' })).toBeNull();
    expect(jobOf(null)).toBeNull();
  });

  it('READY, FAILED and CANCELLED are terminal; PENDING and RUNNING are not', () => {
    expect(['READY', 'FAILED', 'CANCELLED'].every((s) => isTerminal(s as never))).toBe(true);
    expect(['PENDING', 'RUNNING'].some((s) => isTerminal(s as never))).toBe(false);
  });

  it('PENDING after an attempt is "trying again", not a new job', () => {
    const job = jobOf(QUEUED)!;
    expect(waitingPhaseOf(job)).toBe('queued');
    expect(waitingPhaseOf({ ...job, attemptCount: 1 })).toBe('retrying');
    expect(waitingPhaseOf({ ...job, status: 'RUNNING', attemptCount: 1 })).toBe('running');
    expect(waitingPhaseOf({ ...job, status: 'READY' })).toBeNull();
  });

  describe('the poll schedule (ADR 0005)', () => {
    const s = DEFAULT_POLL_SCHEDULE;

    it('is 3 s for the first minute, 10 s after, and stops at five minutes', () => {
      expect(s).toEqual({ fastMs: 3000, fastUntilMs: 60_000, slowMs: 10_000, ceilingMs: 300_000 });
      expect(nextPollDelay(0, s)).toBe(3000);
      expect(nextPollDelay(59_999, s)).toBe(3000);
      expect(nextPollDelay(60_000, s)).toBe(10_000);
      expect(nextPollDelay(295_000, s)).toBe(5_000);
      expect(nextPollDelay(300_000, s)).toBeNull();
      expect(nextPollDelay(3_600_000, s)).toBeNull();
    });

    it('never asks faster than once per 3 s: nothing changes faster than the 10 s worker cycle', () => {
      for (let t = 0; t < s.ceilingMs; t += 500) {
        expect(nextPollDelay(t, s) ?? Infinity).toBeGreaterThanOrEqual(
          Math.min(3000, s.ceilingMs - t),
        );
      }
    });

    it('asks 44 times over the whole five minutes, where once a second would be 300', () => {
      let t = 0;
      let checks = 0;
      for (let d = nextPollDelay(t, s); d !== null; d = nextPollDelay(t, s)) {
        t += d;
        checks++;
      }
      expect(checks).toBe(44);
    });
  });

  it('measures elapsed time from the request, never negative when the client clock is behind', () => {
    expect(elapsedSince('2026-11-12T20:41:43Z', Date.parse('2026-11-12T20:41:50Z'))).toBe(7000);
    expect(elapsedSince('2026-11-12T20:41:43Z', Date.parse('2026-11-12T20:41:00Z'))).toBe(0);
    expect(formatElapsed(7_400)).toBe('0:07');
    expect(formatElapsed(125_000)).toBe('2:05');
    expect(describeElapsed(1_000)).toBe('1 segundo');
    expect(describeElapsed(7_000)).toBe('7 segundos');
    expect(describeElapsed(125_000)).toBe('2 minutos');
  });

  describe('the two meanings of the 409, by type', () => {
    it('`conflict` is a job already running; `setup-incomplete` is nothing to plan yet', () => {
      expect(requestFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({
        kind: 'already-running',
      });
      expect(requestFailureOf(problem('urn:sinapse:problem:setup-incomplete'))).toEqual({
        kind: 'nothing-to-plan',
      });
    });

    it('403 is not processable, 429 carries its wait, the rest is a failure', () => {
      expect(requestFailureOf(problem('urn:sinapse:problem:access-denied')).kind).toBe(
        'not-processable',
      );
      expect(requestFailureOf(problem('urn:sinapse:problem:rate-limit-exceeded', 1200))).toEqual({
        kind: 'rate-limited',
        retryAfterSeconds: 1200,
      });
      expect(
        requestFailureOf(
          new TransportFailure('network', { method: 'POST', route: '/r', correlationId: null }),
        ).kind,
      ).toBe('failed');
    });
  });

  it('only an unavailable service suggests asking again now; refused and nothing-to-plan point to setup', () => {
    expect(PLAN_GENERATION_FAILURES.filter(suggestsAskingAgainNow)).toEqual(['CORE_UNAVAILABLE']);
    expect(PLAN_GENERATION_FAILURES.filter(pointsToSetup)).toEqual([
      'CORE_REJECTED',
      'NOTHING_TO_PLAN',
    ]);
  });
});
