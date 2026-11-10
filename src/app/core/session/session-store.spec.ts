import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpResponse, type JsonBodyType, http } from 'msw';
import { firstValueFrom } from 'rxjs';

import { fixture } from '../../../testing/msw/fixtures';
import { problemResponse } from '../../../testing/msw/problems';
import { networkFailureAt, problemAt, rawAt } from '../../../testing/msw/scenarios';
import { useMswServer } from '../../../testing/msw/server';
import { appConfig } from '../../app.config';
import { ApiClient } from '../api/api-client';
import { TransportFailure } from '../api/api-problem';
import { ApiRoutes } from '../api/api-routes';
import { NETWORK_RETRY_DELAYS_MS } from '../api/interceptors/network-retry.interceptor';
import { AccountTimeService } from '../time/account-time.service';
import { SessionStore } from './session-store';

const server = useMswServer();

/** A bootstrap body the store accepts: generated from the snapshot, with the members that matter. */
function stateBody(overrides: Record<string, unknown> = {}) {
  return {
    ...fixture('StudentStateView'),
    accountStatus: 'ACTIVE',
    setupComplete: true,
    requiresMajorityReaffirmation: false,
    pendingConsents: [],
    timeZone: 'America/Sao_Paulo',
    ...overrides,
  };
}

/** Answers `/me/state` with `body`, counting the requests. */
function stateAt(body: () => JsonBodyType) {
  let calls = 0;
  const handler = http.get(ApiRoutes.readModel.myState, () => {
    calls++;
    return HttpResponse.json(body());
  });
  return Object.assign(handler, { calls: () => calls });
}

/** Holds `/me/state` until `release()` is called; `arrived()` says the request reached it. */
function heldState(body: () => JsonBodyType) {
  let arrived = false;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const handler = http.get(ApiRoutes.readModel.myState, async () => {
    arrived = true;
    await gate;
    return HttpResponse.json(body());
  });
  return { handler, arrived: () => arrived, release: () => release() };
}

function setUp(): { store: SessionStore; router: Router } {
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] }],
  });
  return { store: TestBed.inject(SessionStore), router: TestBed.inject(Router) };
}

describe('SessionStore', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  describe('the bootstrap', () => {
    it('reads once, however many callers ask while it runs, and keeps the answer', async () => {
      const handler = stateAt(() => stateBody());
      server.use(handler);
      const { store } = setUp();

      const outcomes = await Promise.all([
        store.ensureLoaded(),
        store.ensureLoaded(),
        store.ensureLoaded(),
      ]);
      await store.ensureLoaded();

      expect(handler.calls()).toBe(1);
      expect(outcomes.map((o) => o.kind)).toEqual(['signed-in', 'signed-in', 'signed-in']);
      expect(store.status()).toBe('signed-in');
      expect(store.state()?.accountStatus).toBe('ACTIVE');
    });

    it('is loading, with no state, while the first read runs', async () => {
      const held = heldState(() => stateBody());
      server.use(held.handler);
      const { store } = setUp();

      const read = store.ensureLoaded();
      expect(store.status()).toBe('loading');
      expect(store.state()).toBeNull();
      await vi.waitFor(() => expect(held.arrived()).toBe(true));
      held.release();
      await read;
      expect(store.status()).toBe('signed-in');
    });

    it('turns a 401 into signed-out, without a second request', async () => {
      const handler = problemAt(
        'get',
        ApiRoutes.readModel.myState,
        'urn:sinapse:problem:unauthenticated',
      );
      server.use(handler);
      const { store } = setUp();

      expect(await store.ensureLoaded()).toEqual({ kind: 'signed-out' });
      expect(await store.ensureLoaded()).toEqual({ kind: 'signed-out' });
      expect(handler.calls()).toBe(1);
      expect(store.status()).toBe('signed-out');
    });

    it('fails as unreadable on a body that misses a required member, and logs no value', async () => {
      server.use(
        stateAt(() => {
          const rest: Record<string, unknown> = stateBody({ timeZone: 'Secret/Zone' });
          delete rest['timeZone'];
          return { ...rest, openSessionId: 'session-secret-id' } as JsonBodyType;
        }),
      );
      const { store } = setUp();

      const outcome = await store.ensureLoaded();

      expect(outcome.kind).toBe('failed');
      const failure = outcome.kind === 'failed' ? outcome.failure : null;
      expect(failure).toBeInstanceOf(TransportFailure);
      expect((failure as TransportFailure).reason).toBe('unreadable');
      expect(store.status()).toBe('failed');
      expect(store.state()).toBeNull();
      const logged = warn.mock.calls.flat().map(String).join('\n');
      expect(logged).toContain('timeZone');
      expect(logged).not.toContain('session-secret-id');
    });

    it('fails, keeping nothing, on a network error, and asks again on the next call', async () => {
      const failing = networkFailureAt('get', ApiRoutes.readModel.myState);
      server.use(failing);
      const { store } = setUp();

      const first = await store.ensureLoaded();
      expect(first.kind === 'failed' && first.failure).toEqual(
        expect.objectContaining({ reason: 'network' }),
      );
      expect(store.status()).toBe('failed');

      server.use(stateAt(() => stateBody()));
      expect((await store.ensureLoaded()).kind).toBe('signed-in');
    });

    it('fails as unreadable on a body that is not JSON', async () => {
      server.use(
        rawAt('get', ApiRoutes.readModel.myState, 200, '{"accountStatus":', 'application/json'),
      );
      const { store } = setUp();
      const outcome = await store.ensureLoaded();
      expect(outcome.kind === 'failed' && outcome.failure).toEqual(
        expect.objectContaining({ kind: 'transport', reason: 'unreadable' }),
      );
    });

    it('fails on a rate-limit refusal, and keeps the wait for the screen', async () => {
      server.use(
        problemAt('get', ApiRoutes.readModel.myState, 'urn:sinapse:problem:rate-limit-exceeded', {
          retryAfterSeconds: 30,
        }),
      );
      const { store } = setUp();
      const outcome = await store.ensureLoaded();
      expect(outcome.kind === 'failed' && outcome.failure).toEqual(
        expect.objectContaining({ kind: 'problem', retryAfterSeconds: 30 }),
      );
    });
  });

  describe('refresh', () => {
    it('reads again without a navigation, and replaces the state', async () => {
      let setupComplete = false;
      const handler = stateAt(() => stateBody({ setupComplete }));
      server.use(handler);
      const { store, router } = setUp();
      const navigate = vi.spyOn(router, 'navigateByUrl');

      await store.ensureLoaded();
      expect(store.state()?.setupComplete).toBe(false);
      setupComplete = true;
      await store.refresh();

      expect(handler.calls()).toBe(2);
      expect(store.state()?.setupComplete).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('keeps the state it had when the refresh fails', async () => {
      server.use(stateAt(() => stateBody()));
      const { store } = setUp();
      await store.ensureLoaded();
      const before = store.state();

      server.use(networkFailureAt('get', ApiRoutes.readModel.myState));
      const outcome = await store.refresh();

      expect(outcome.kind).toBe('failed');
      expect(store.status()).toBe('signed-in');
      expect(store.state()).toBe(before);
    });

    it('drops an answer that arrives after the session ended', async () => {
      const held = heldState(() => stateBody());
      server.use(held.handler);
      const { store } = setUp();
      const read = store.refresh();
      await vi.waitFor(() => expect(held.arrived()).toBe(true));
      store.end();
      held.release();

      expect(await read).toEqual({ kind: 'signed-out' });
      expect(store.state()).toBeNull();
      expect(store.status()).toBe('signed-out');
    });
  });

  describe('expire', () => {
    it('acts once for ten requests failing together: one expiry, one navigation, one clear', async () => {
      server.use(stateAt(() => stateBody()));
      const { store, router } = setUp();
      await store.ensureLoaded();
      await router.navigateByUrl('/agenda');

      const routes = [
        ApiRoutes.planning.goals,
        ApiRoutes.planning.availability,
        ApiRoutes.planning.studyPlans,
        ApiRoutes.planning.currentStudyPlan,
        ApiRoutes.identity.consents,
        ApiRoutes.identity.sessions,
        ApiRoutes.learningRecord.currentStudySession,
        ApiRoutes.educational.enrollments,
        ApiRoutes.dataRights.erasureRequests,
        ApiRoutes.curriculum.subjects,
      ];
      server.use(
        ...routes.map((route) => problemAt('get', route, 'urn:sinapse:problem:unauthenticated')),
      );
      const expire = vi.spyOn(store, 'expire');
      const navigate = vi.spyOn(router, 'navigateByUrl');
      const zone = vi.spyOn(TestBed.inject(AccountTimeService), 'setAccountZone');
      const api = TestBed.inject(ApiClient);

      const results = await Promise.allSettled(
        routes.map((route) => firstValueFrom(api.get(route))),
      );

      expect(results.every((result) => result.status === 'rejected')).toBe(true);
      expect(expire).toHaveBeenCalledTimes(10);
      expect(expire.mock.results.filter((result) => result.value === true)).toHaveLength(1);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/entrar');
      expect(zone).toHaveBeenCalledTimes(1);
      expect(zone).toHaveBeenCalledWith(null);
      expect(store.state()).toBeNull();
      expect(store.attemptedRoute()).toBe('/agenda');
      expect(store.notice()).toBe('session-expired');
    });

    it('says nothing about an expired session to a person who was never signed in', async () => {
      server.use(
        problemAt('get', ApiRoutes.readModel.myState, 'urn:sinapse:problem:unauthenticated'),
      );
      const { store } = setUp();
      await store.ensureLoaded();
      expect(store.hasEnded()).toBe(true);
      expect(store.notice()).toBeNull();
    });

    it('acts again once a new session has begun', async () => {
      server.use(stateAt(() => stateBody()));
      const { store } = setUp();
      await store.ensureLoaded();
      expect(store.expire()).toBe(true);
      expect(store.expire()).toBe(false);
      store.begin();
      await store.refresh();
      expect(store.expire()).toBe(true);
    });
  });

  describe('the attempted route', () => {
    it('is kept in memory until the next successful sign-in, then forgotten', async () => {
      server.use(
        problemAt('get', ApiRoutes.readModel.myState, 'urn:sinapse:problem:unauthenticated'),
      );
      const { store } = setUp();
      store.remember('/plano');
      expect(store.attemptedRoute()).toBe('/plano');
      expect(store.begin()).toBe('/plano');
      expect(store.attemptedRoute()).toBeNull();
    });

    it('is never the sign-in screen itself', () => {
      const { store } = setUp();
      store.remember('/entrar');
      store.remember('/entrar?x=1');
      expect(store.attemptedRoute()).toBeNull();
    });

    it('is forgotten when the person signs out', async () => {
      server.use(stateAt(() => stateBody()));
      const { store } = setUp();
      await store.ensureLoaded();
      store.remember('/agenda');
      store.end();
      expect(store.attemptedRoute()).toBeNull();
    });
  });

  describe('sign-out', () => {
    async function signedIn() {
      server.use(stateAt(() => stateBody()));
      const context = setUp();
      await context.store.ensureLoaded();
      await context.router.navigateByUrl('/conta');
      return context;
    }

    it('on 204 clears the store and goes to sign in', async () => {
      server.use(
        http.delete(
          ApiRoutes.identity.currentSession,
          () => new HttpResponse(null, { status: 204 }),
        ),
      );
      const { store, router } = await signedIn();
      await store.signOut();
      expect(store.status()).toBe('signed-out');
      expect(store.notice()).toBeNull();
      await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    });

    it('on 401 — already gone — clears and goes to sign in anyway, without calling it an expiry', async () => {
      server.use(
        problemAt(
          'delete',
          ApiRoutes.identity.currentSession,
          'urn:sinapse:problem:unauthenticated',
        ),
      );
      const { store, router } = await signedIn();
      const expire = vi.spyOn(store, 'expire');
      await store.signOut();
      expect(expire).not.toHaveBeenCalled();
      expect(store.status()).toBe('signed-out');
      expect(store.notice()).toBeNull();
      expect(store.attemptedRoute()).toBeNull();
      await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    });

    it('on a transport failure clears locally, goes to sign in, and says the server may still hold it', async () => {
      server.use(networkFailureAt('delete', ApiRoutes.identity.currentSession));
      const { store, router } = await signedIn();
      await store.signOut();
      expect(store.status()).toBe('signed-out');
      expect(store.notice()).toBe('sign-out-unconfirmed');
      await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    });

    it('on a server error says the same: it cannot confirm the session ended', async () => {
      server.use(
        problemAt(
          'delete',
          ApiRoutes.identity.currentSession,
          'urn:sinapse:problem:internal-error',
        ),
      );
      const { store } = await signedIn();
      await store.signOut();
      expect(store.notice()).toBe('sign-out-unconfirmed');
    });
  });

  describe('the account time zone', () => {
    const INSTANT = '2026-03-10T01:30:00Z';

    it('is applied after a successful bootstrap', async () => {
      server.use(stateAt(() => stateBody({ timeZone: 'America/Sao_Paulo' })));
      const { store } = setUp();
      const time = TestBed.inject(AccountTimeService);
      await store.ensureLoaded();
      expect(time.zone()).toBe('America/Sao_Paulo');
    });

    it('keeps UTC and warns in development when the zone is not usable, and the screen does not break', async () => {
      server.use(stateAt(() => stateBody({ timeZone: 'Mars/Olympus_Mons' })));
      const { store } = setUp();
      const time = TestBed.inject(AccountTimeService);

      const outcome = await store.ensureLoaded();

      expect(outcome.kind).toBe('signed-in');
      expect(time.zone()).toBe('UTC');
      expect(warn.mock.calls.flat().map(String).join('\n')).toContain('not a known IANA zone');
      expect(() => time.formatInstant(INSTANT)).not.toThrow();
      expect(time.formatInstant(INSTANT)).toBe('10/03/2026, 01:30');
    });

    it('survives a refresh', async () => {
      server.use(stateAt(() => stateBody({ timeZone: 'Asia/Tokyo' })));
      const { store } = setUp();
      const time = TestBed.inject(AccountTimeService);
      await store.ensureLoaded();
      await store.refresh();
      expect(time.zone()).toBe('Asia/Tokyo');
      server.use(networkFailureAt('get', ApiRoutes.readModel.myState));
      await store.refresh();
      expect(time.zone()).toBe('Asia/Tokyo');
    });

    it('is emptied when the session ends, so the next account does not inherit it', async () => {
      server.use(stateAt(() => stateBody({ timeZone: 'Asia/Tokyo' })));
      const { store } = setUp();
      await store.ensureLoaded();
      store.end();
      expect(TestBed.inject(AccountTimeService).zone()).toBe('UTC');
    });

    it('governs the rendering, not the browser zone: the same text under any TZ', async () => {
      // `npm test` is also run under TZ=America/Sao_Paulo and TZ=Asia/Tokyo (docs/ai/STATE.md);
      // the expected text is fixed, so a run in any browser zone must produce exactly it.
      server.use(stateAt(() => stateBody({ timeZone: 'America/Sao_Paulo' })));
      const { store } = setUp();
      const time = TestBed.inject(AccountTimeService);
      await store.ensureLoaded();
      expect(time.formatInstant(INSTANT)).toBe('09/03/2026, 22:30');
      expect(time.formatInstant(INSTANT, 'date')).toBe('09/03/2026');
      expect(time.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('reads /me/state through the API layer, so the interceptors see it', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(ApiRoutes.readModel.myState, ({ request }) => {
        seen.push(request.headers.get('X-Correlation-Id'));
        return problemResponse('urn:sinapse:problem:internal-error');
      }),
    );
    const { store } = setUp();
    await store.ensureLoaded();
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBeNull();
  });
});
