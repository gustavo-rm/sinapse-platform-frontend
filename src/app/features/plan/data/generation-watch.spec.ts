import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { useMswServer } from '../../../../testing/msw/server';
import { FAST_SCHEDULE, type JobStep, jobBody, planServer } from '../../../../testing/plan';
import { appConfig } from '../../../app.config';
import { NETWORK_RETRY_DELAYS_MS } from '../../../core/api/interceptors/network-retry.interceptor';
import { GENERATION_CLOCK, POLL_SCHEDULE, type PollSchedule } from '../model/generation';
import { GenerationWatch } from './generation-watch';

const server = useMswServer();

@Component({ selector: 'sn-watch-host', template: '', providers: [GenerationWatch] })
class WatchHost {
  readonly watch = inject(GenerationWatch);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setUp(steps: JobStep[], schedule: PollSchedule = FAST_SCHEDULE, clock?: () => number) {
  const backend = planServer({ steps, runningJob: 'job-1' });
  server.use(...backend.handlers);
  TestBed.configureTestingModule({
    providers: [
      ...appConfig.providers,
      { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] },
      { provide: POLL_SCHEDULE, useValue: schedule },
      ...(clock ? [{ provide: GENERATION_CLOCK, useValue: clock }] : []),
    ],
  });
  const fixture = TestBed.createComponent(WatchHost);
  const polls = () => backend.count('GET', '/generation-requests/');
  return { fixture, watch: fixture.componentInstance.watch, polls, backend };
}

describe('GenerationWatch — the poll', () => {
  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('asks until the job is READY, then stops asking', async () => {
    const { watch, polls } = setUp([
      { status: 'PENDING', attemptCount: 0 },
      { status: 'PENDING', attemptCount: 0 },
      { status: 'RUNNING' },
      { status: 'READY', planId: 'plan-2' },
    ]);
    watch.watch('job-1');
    await vi.waitFor(() => expect(watch.job()?.status).toBe('READY'));
    const asked = polls();
    expect(asked).toBe(4);
    await sleep(80);
    expect(polls()).toBe(asked);
    expect(watch.isWaiting()).toBe(false);
  });

  for (const terminal of [
    { status: 'FAILED', failureReason: 'CORE_UNAVAILABLE' },
    { status: 'CANCELLED' },
  ] as const) {
    it(`stops at ${terminal.status}, a terminal state`, async () => {
      const { watch, polls } = setUp([{ status: 'PENDING' }, terminal]);
      watch.watch('job-1');
      await vi.waitFor(() => expect(watch.job()?.status).toBe(terminal.status));
      const asked = polls();
      await sleep(80);
      expect(polls()).toBe(asked);
    });
  }

  it('leaves no timer alive when the component is destroyed: no request afterwards, every timer cleared', async () => {
    const { fixture, watch, polls } = setUp([{ status: 'PENDING' }]);
    watch.watch('job-1');
    await vi.waitFor(() => expect(polls()).toBeGreaterThanOrEqual(3));

    const cleared = vi.spyOn(globalThis, 'clearTimeout');
    const clearedInterval = vi.spyOn(globalThis, 'clearInterval');
    fixture.destroy();
    // A check already sent when the component died may still reach the server (its answer is
    // dropped); what must not happen is a NEW one. Count once that one has landed.
    await sleep(20);
    const asked = polls();
    await sleep(100);
    expect(polls()).toBe(asked);
    // The poll's timeout and the clock's interval were both cleared on destroy.
    expect(cleared).toHaveBeenCalled();
    expect(clearedInterval).toHaveBeenCalled();
  });

  it('negative control: without destroying, the same watch keeps asking', async () => {
    const { watch, polls } = setUp([{ status: 'PENDING' }]);
    watch.watch('job-1');
    await vi.waitFor(() => expect(polls()).toBeGreaterThanOrEqual(2));
    const asked = polls();
    await sleep(60);
    expect(polls()).toBeGreaterThan(asked);
    watch.reset();
  });

  it('follows the ladder: fast first, slow later, and stops at the ceiling with the clock stopped', async () => {
    let now = Date.now();
    const schedule = { fastMs: 5, fastUntilMs: 30, slowMs: 20, ceilingMs: 90 };
    const { watch, polls } = setUp([{ status: 'PENDING' }], schedule, () => now);
    const advance = setInterval(() => (now += 5), 5);
    watch.watch(jobBody({ id: 'job-1', requestedAt: new Date(now).toISOString() }) as never);
    await vi.waitFor(() => expect(watch.halt()).toEqual({ kind: 'ceiling' }), { timeout: 2000 });
    clearInterval(advance);
    const asked = polls();
    expect(asked).toBeGreaterThan(2);
    await sleep(80);
    expect(polls()).toBe(asked);

    // One manual check, which asks once and halts again.
    watch.checkNow();
    await vi.waitFor(() => expect(polls()).toBe(asked + 1));
    await sleep(60);
    expect(polls()).toBe(asked + 1);
  });

  it('pauses while the tab is hidden, and checks at once on return', async () => {
    const { watch, polls } = setUp([{ status: 'PENDING' }]);
    watch.watch('job-1');
    await vi.waitFor(() => expect(polls()).toBeGreaterThanOrEqual(2));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await sleep(20);
    const asked = polls();
    await sleep(80);
    expect(polls()).toBe(asked);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(polls()).toBeGreaterThan(asked));
    watch.reset();
  });

  it('a 404 means the job is not this account’s: it stops, as `lost`', async () => {
    const { watch, polls } = setUp([{ problem: 'urn:sinapse:problem:resource-not-found' }]);
    watch.watch('job-1');
    await vi.waitFor(() => expect(watch.halt()).toEqual({ kind: 'lost' }));
    const asked = polls();
    await sleep(60);
    expect(polls()).toBe(asked);
  });

  it('a 429 is never asked again on its own', async () => {
    const { watch, polls } = setUp([
      { problem: 'urn:sinapse:problem:rate-limit-exceeded', retryAfterSeconds: 42 },
    ]);
    watch.watch('job-1');
    await vi.waitFor(() =>
      expect(watch.halt()).toEqual({ kind: 'rate-limited', retryAfterSeconds: 42 }),
    );
    await sleep(60);
    expect(polls()).toBe(1);
  });

  it('a 5xx does not end the watch: it says the check failed and keeps the schedule', async () => {
    const { watch, polls } = setUp([
      { status: 'PENDING' },
      { problem: 'urn:sinapse:problem:internal-error' },
      { status: 'READY', planId: 'plan-2' },
    ]);
    watch.watch('job-1');
    await vi.waitFor(() => expect(watch.job()?.status).toBe('READY'));
    expect(watch.checkFailure()).toBeNull();
    expect(polls()).toBe(3);
  });
});
