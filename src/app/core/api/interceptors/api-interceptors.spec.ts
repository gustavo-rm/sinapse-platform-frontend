import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { firstValueFrom } from 'rxjs';

import { useMswServer } from '../../../../testing/msw/server';
import { problemResponse } from '../../../../testing/msw/problems';
import { networkFailureAt, problemAt, rawAt } from '../../../../testing/msw/scenarios';
import { appConfig } from '../../../app.config';
import { SessionExpiry } from '../../session/session-expiry';
import { ApiClient } from '../api-client';
import {
  type ApiFailure,
  ApiProblemFailure,
  TransportFailure,
  isApiFailure,
  isConflict,
  isPrerequisiteCycle,
  isSetupIncomplete,
  isValidationFailed,
} from '../api-problem';
import { ApiRoutes } from '../api-routes';
import { PROBLEM_TYPES } from '../contract/problem-type';
import { RateLimitState } from '../rate-limit-state';
import { NETWORK_RETRY_DELAYS_MS } from './network-retry.interceptor';

const server = useMswServer();

function setUp(): ApiClient {
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] }],
  });
  return TestBed.inject(ApiClient);
}

/** The failure a request ends with; fails the test if it succeeds. */
async function failureOf(request: Promise<unknown>): Promise<ApiFailure> {
  try {
    await request;
  } catch (error) {
    expect(isApiFailure(error)).toBe(true);
    return error as ApiFailure;
  }
  throw new Error('expected the request to fail');
}

describe('the API layer against MSW', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  describe('success path', () => {
    it('reads a generated body of the snapshot', async () => {
      const api = setUp();
      const state = await firstValueFrom(
        api.get<{ setupComplete?: boolean }>(ApiRoutes.readModel.myState),
      );
      expect(state).toEqual(expect.objectContaining({ setupComplete: false }));
    });

    it('answers a 204 with no body', async () => {
      const api = setUp();
      await expect(
        firstValueFrom(api.delete(ApiRoutes.identity.currentSession)),
      ).resolves.toBeNull();
    });
  });

  describe('problem conversion: no raw HttpErrorResponse escapes', () => {
    it.each(PROBLEM_TYPES.map((type) => [type]))(
      'turns %s into an ApiProblemFailure',
      async (type) => {
        const api = setUp();
        server.use(problemAt('post', ApiRoutes.planning.goals, type, { correlationId: 'corr-1' }));
        const failure = await failureOf(firstValueFrom(api.post(ApiRoutes.planning.goals, {})));
        expect(failure).toBeInstanceOf(ApiProblemFailure);
        expect((failure as ApiProblemFailure).problem.type).toBe(type);
        expect(failure.correlationId).toBe('corr-1');
        expect(failure.route).toBe(ApiRoutes.planning.goals);
      },
    );

    it('maps a 400 with errors[] field by field', async () => {
      const api = setUp();
      server.use(
        problemAt('post', ApiRoutes.planning.goals, 'urn:sinapse:problem:validation-failed'),
      );
      const failure = await failureOf(firstValueFrom(api.post(ApiRoutes.planning.goals, {})));
      expect(isValidationFailed(failure)).toBe(true);
      const errors = (failure as ApiProblemFailure).problem.errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      for (const error of errors) {
        expect(Object.keys(error).sort()).toEqual(['field', 'message']);
      }
    });

    it('tells the three 409 types apart by type, never by status', async () => {
      const api = setUp();
      const outcomes: string[] = [];
      for (const type of [
        'urn:sinapse:problem:prerequisite-cycle',
        'urn:sinapse:problem:setup-incomplete',
        'urn:sinapse:problem:conflict',
      ] as const) {
        server.use(problemAt('post', ApiRoutes.planning.generationRequests, type));
        const failure = await failureOf(
          firstValueFrom(api.post(ApiRoutes.planning.generationRequests)),
        );
        expect((failure as ApiProblemFailure).problem.status).toBe(409);
        outcomes.push(
          isPrerequisiteCycle(failure)
            ? 'cycle'
            : isSetupIncomplete(failure)
              ? 'setup'
              : isConflict(failure)
                ? 'conflict'
                : 'other',
        );
      }
      expect(outcomes).toEqual(['cycle', 'setup', 'conflict']);
    });

    it('makes a network failure a TransportFailure, distinct from a problem', async () => {
      const api = setUp();
      server.use(networkFailureAt('post', ApiRoutes.planning.goals));
      const failure = await failureOf(firstValueFrom(api.post(ApiRoutes.planning.goals, {})));
      expect(failure).toBeInstanceOf(TransportFailure);
      expect((failure as TransportFailure).reason).toBe('network');
    });

    it('makes an unparseable error body a transport failure, not a problem with empty fields', async () => {
      const api = setUp();
      server.use(
        rawAt(
          'get',
          ApiRoutes.planning.goals,
          500,
          '{"type": "urn:sin',
          'application/problem+json',
        ),
      );
      const failure = await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(failure).toEqual(
        expect.objectContaining({ kind: 'transport', reason: 'unreadable', status: 500 }),
      );
    });

    it('makes an error that is not problem+json a transport failure (a proxy page)', async () => {
      const api = setUp();
      server.use(
        rawAt('get', ApiRoutes.planning.goals, 502, '<html>Bad gateway</html>', 'text/html'),
      );
      const failure = await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(failure).toEqual(
        expect.objectContaining({ kind: 'transport', reason: 'unreadable', status: 502 }),
      );
    });

    it('makes a problem of an unknown type a transport failure rather than guessing', async () => {
      const api = setUp();
      const body = JSON.stringify({
        type: 'urn:sinapse:problem:new-thing',
        title: 't',
        status: 409,
        detail: 'd',
        instance: '/',
      });
      server.use(rawAt('post', ApiRoutes.planning.goals, 409, body, 'application/problem+json'));
      const failure = await failureOf(firstValueFrom(api.post(ApiRoutes.planning.goals, {})));
      expect(failure).toEqual(
        expect.objectContaining({ kind: 'transport', reason: 'unreadable', status: 409 }),
      );
    });

    it('makes a 2xx with an unparseable body a transport failure', async () => {
      const api = setUp();
      server.use(rawAt('get', ApiRoutes.planning.goals, 200, '[{"id":', 'application/json'));
      const failure = await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(failure).toEqual(
        expect.objectContaining({ kind: 'transport', reason: 'unreadable', status: 200 }),
      );
    });
  });

  describe('401: session expiry', () => {
    it('fires the expiry path once and does not retry', async () => {
      const api = setUp();
      const handler = problemAt(
        'get',
        ApiRoutes.readModel.myState,
        'urn:sinapse:problem:unauthenticated',
      );
      server.use(handler);
      const session = TestBed.inject(SessionExpiry);
      const expire = vi.spyOn(session, 'expire');

      await failureOf(firstValueFrom(api.get(ApiRoutes.readModel.myState)));

      expect(handler.calls()).toBe(1);
      expect(expire).toHaveBeenCalledTimes(1);
      expect(session.hasEnded()).toBe(true);
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/entrar'));
    });

    it('ends the session once when several requests fail with 401 together', async () => {
      const api = setUp();
      server.use(
        problemAt('get', ApiRoutes.readModel.myState, 'urn:sinapse:problem:unauthenticated'),
        problemAt('get', ApiRoutes.planning.goals, 'urn:sinapse:problem:unauthenticated'),
      );
      const session = TestBed.inject(SessionExpiry);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

      await Promise.all([
        failureOf(firstValueFrom(api.get(ApiRoutes.readModel.myState))),
        failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals))),
      ]);

      expect(session.hasEnded()).toBe(true);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('keeps the route the person was on, to return to it', async () => {
      const api = setUp();
      await TestBed.inject(Router).navigateByUrl('/agenda');
      server.use(
        problemAt('get', ApiRoutes.readModel.myAgenda, 'urn:sinapse:problem:unauthenticated'),
      );
      await failureOf(firstValueFrom(api.get(ApiRoutes.readModel.myAgenda)));
      expect(TestBed.inject(SessionExpiry).attemptedRoute()).toBe('/agenda');
    });

    it('does not end the session when signing in is refused', async () => {
      const api = setUp();
      server.use(
        problemAt('post', ApiRoutes.identity.sessions, 'urn:sinapse:problem:unauthenticated'),
      );
      const expire = vi.spyOn(TestBed.inject(SessionExpiry), 'expire');
      await failureOf(firstValueFrom(api.post(ApiRoutes.identity.sessions, {})));
      expect(expire).not.toHaveBeenCalled();
    });

    it('decides by the problem type, not the status: a 401 that is not a problem ends nothing', async () => {
      const api = setUp();
      server.use(rawAt('get', ApiRoutes.readModel.myState, 401, 'nope', 'text/plain'));
      const expire = vi.spyOn(TestBed.inject(SessionExpiry), 'expire');
      await failureOf(firstValueFrom(api.get(ApiRoutes.readModel.myState)));
      expect(expire).not.toHaveBeenCalled();
    });
  });

  describe('429: rate limit', () => {
    it('surfaces retryAfter, publishes the refusal and never retries', async () => {
      const api = setUp();
      const handler = problemAt(
        'post',
        ApiRoutes.planning.generationRequests,
        'urn:sinapse:problem:rate-limit-exceeded',
        { retryAfterSeconds: 1800 },
      );
      server.use(handler);

      const failure = await failureOf(
        firstValueFrom(api.post(ApiRoutes.planning.generationRequests)),
      );

      expect(handler.calls()).toBe(1);
      expect((failure as ApiProblemFailure).retryAfterSeconds).toBe(1800);
      expect(TestBed.inject(RateLimitState).lastRefusal()).toEqual(
        expect.objectContaining({
          route: ApiRoutes.planning.generationRequests,
          method: 'POST',
          retryAfterSeconds: 1800,
        }),
      );
    });

    it('never retries a 429 on a GET either', async () => {
      const api = setUp();
      const handler = problemAt(
        'get',
        ApiRoutes.dataRights.dataExport,
        'urn:sinapse:problem:rate-limit-exceeded',
        {
          retryAfterSeconds: 60,
        },
      );
      server.use(handler);
      await failureOf(firstValueFrom(api.get(ApiRoutes.dataRights.dataExport)));
      expect(handler.calls()).toBe(1);
    });
  });

  describe('retry policy', () => {
    it('retries a GET that met a network error at most twice', async () => {
      const api = setUp();
      const handler = networkFailureAt('get', ApiRoutes.planning.goals);
      server.use(handler);
      const failure = await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(failure).toBeInstanceOf(TransportFailure);
      expect(handler.calls()).toBe(3);
    });

    it('succeeds when the network comes back within the retries', async () => {
      const api = setUp();
      let calls = 0;
      server.use(
        http.get(ApiRoutes.planning.goals, () =>
          ++calls < 3 ? HttpResponse.error() : HttpResponse.json([]),
        ),
      );
      await expect(firstValueFrom(api.get(ApiRoutes.planning.goals))).resolves.toEqual([]);
      expect(calls).toBe(3);
    });

    it.each([
      [
        'POST',
        () => networkFailureAt('post', ApiRoutes.planning.goals),
        (api: ApiClient) => api.post(ApiRoutes.planning.goals, {}),
      ],
      [
        'PATCH',
        () => networkFailureAt('patch', ApiRoutes.planning.goal({ goalId: 'g' })),
        (api: ApiClient) => api.patch(ApiRoutes.planning.goal({ goalId: 'g' }), {}),
      ],
      [
        'DELETE',
        () => networkFailureAt('delete', ApiRoutes.identity.currentSession),
        (api: ApiClient) => api.delete(ApiRoutes.identity.currentSession),
      ],
    ] as const)('never retries a %s, even on a network error', async (_, scenario, call) => {
      const api = setUp();
      const handler = scenario();
      server.use(handler);
      await failureOf(firstValueFrom(call(api)));
      expect(handler.calls()).toBe(1);
    });

    it.each([
      'urn:sinapse:problem:internal-error',
      'urn:sinapse:problem:service-unavailable',
      'urn:sinapse:problem:resource-not-found',
      'urn:sinapse:problem:unauthenticated',
    ] as const)('never retries a GET answered with %s', async (type) => {
      const api = setUp();
      const handler = problemAt('get', ApiRoutes.planning.goals, type);
      server.use(handler);
      await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(handler.calls()).toBe(1);
    });

    it('never retries an unreadable answer', async () => {
      const api = setUp();
      const handler = rawAt('get', ApiRoutes.planning.goals, 502, '<html/>', 'text/html');
      server.use(handler);
      await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(handler.calls()).toBe(1);
    });
  });

  describe('correlation id and logging', () => {
    it('sends one correlation id per request, the same across its retries', async () => {
      const api = setUp();
      const seen: (string | null)[] = [];
      server.use(
        http.get(ApiRoutes.planning.goals, ({ request }) => {
          seen.push(request.headers.get('X-Correlation-Id'));
          return HttpResponse.error();
        }),
      );
      await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(seen).toHaveLength(3);
      expect(seen[0]).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
      expect(new Set(seen).size).toBe(1);

      const first = seen[0];
      seen.length = 0;
      await failureOf(firstValueFrom(api.get(ApiRoutes.planning.goals)));
      expect(seen[0]).not.toBe(first);
    });

    it('logs the route template, the type and the correlation id, and no personal data', async () => {
      const api = setUp();
      const code = 'INVITE-CODE-SECRET';
      const email = 'pessoa.real@example.com';
      server.use(
        http.post(ApiRoutes.educational.inviteRedemptions({ code }), () =>
          HttpResponse.json(
            {
              type: 'urn:sinapse:problem:conflict',
              title: 'Conflict',
              status: 409,
              detail: `Account ${email} already enrolled`,
              instance: ApiRoutes.educational.inviteRedemptions({ code }),
            },
            {
              status: 409,
              headers: {
                'Content-Type': 'application/problem+json',
                'X-Correlation-Id': 'corr-42',
              },
            },
          ),
        ),
      );
      await failureOf(
        firstValueFrom(
          api.post(ApiRoutes.educational.inviteRedemptions({ code }), {
            email,
            dateOfBirth: '2001-04-17',
          }),
        ),
      );

      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain(`POST ${ApiRoutes.educational.inviteRedemptions.template}`);
      expect(line).toContain('urn:sinapse:problem:conflict');
      expect(line).toContain('corr-42');
      for (const secret of [code, email, '2001-04-17', 'already enrolled']) {
        expect(line).not.toContain(secret);
      }
    });
  });

  describe('the declared order', () => {
    // Each observation below is only possible once the step before it has run: the session and
    // rate-limit interceptors act only on an ApiProblemFailure, so their acting proves the
    // converter ran first; the log line names the problem type, so it saw the converted failure.
    it('acts on a 401 in the sequence: id set, converted, session expiry, logged', async () => {
      const api = setUp();
      const events: string[] = [];
      server.use(
        http.get(ApiRoutes.readModel.myState, ({ request }) => {
          events.push(`request with id: ${request.headers.has('X-Correlation-Id')}`);
          return problemResponse('urn:sinapse:problem:unauthenticated');
        }),
      );
      vi.spyOn(TestBed.inject(SessionExpiry), 'expire').mockImplementation(() => {
        events.push('session expiry');
        return true;
      });
      const record = vi.spyOn(TestBed.inject(RateLimitState), 'record');
      warn.mockImplementation((line: unknown) =>
        events.push(`log: ${String(line).includes('unauthenticated')}`),
      );

      await failureOf(firstValueFrom(api.get(ApiRoutes.readModel.myState)));

      expect(events).toEqual(['request with id: true', 'session expiry', 'log: true']);
      expect(record).not.toHaveBeenCalled();
    });

    it('acts on a 429 in the sequence: id set, converted, rate limit, logged', async () => {
      const api = setUp();
      const events: string[] = [];
      server.use(
        http.get(ApiRoutes.dataRights.dataExport, ({ request }) => {
          events.push(`request with id: ${request.headers.has('X-Correlation-Id')}`);
          return problemResponse('urn:sinapse:problem:rate-limit-exceeded', {
            retryAfterSeconds: 5,
          });
        }),
      );
      const expire = vi.spyOn(TestBed.inject(SessionExpiry), 'expire');
      vi.spyOn(TestBed.inject(RateLimitState), 'record').mockImplementation(() => {
        events.push('rate limit');
      });
      warn.mockImplementation((line: unknown) =>
        events.push(`log: ${String(line).includes('rate-limit-exceeded')}`),
      );

      await failureOf(firstValueFrom(api.get(ApiRoutes.dataRights.dataExport)));

      expect(events).toEqual(['request with id: true', 'rate limit', 'log: true']);
      expect(expire).not.toHaveBeenCalled();
    });

    it('registers the interceptors so that the converter is innermost and the correlation id outermost', () => {
      const names = interceptorNames();
      expect(names).toEqual([
        'correlationIdInterceptor',
        'rateLimitInterceptor',
        'sessionExpiryInterceptor',
        'networkRetryInterceptor',
        'problemDetailInterceptor',
      ]);
    });
  });
});

/** The names of the interceptor functions registered in app.config.ts, in registration order. */
function interceptorNames(): string[] {
  const source = appConfig.providers.flatMap((provider) => collect(provider));
  return source;
}

function collect(value: unknown, seen = new Set<unknown>()): string[] {
  if (seen.has(value) || value === null || typeof value !== 'object') {
    return [];
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.flatMap((item) => collect(item, seen));
  }
  const record = value as Record<string, unknown>;
  if ('useValue' in record && typeof record['useValue'] === 'function') {
    const name = (record['useValue'] as { name: string }).name;
    return name.endsWith('Interceptor') ? [name] : [];
  }
  return Object.values(record).flatMap((item) => collect(item, seen));
}
