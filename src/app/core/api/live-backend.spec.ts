/**
 * OPT-IN. The API layer against a REAL backend, under the `local` profile — the only profile in
 * which `/api-docs` and the probe routes exist. Skipped unless `SINAPSE_LIVE_API` names the
 * backend's origin:
 *
 *   SINAPSE_LIVE_API=http://localhost:8080 npx ng test --watch=false \
 *     --include=src/app/core/api/live-backend.spec.ts
 *
 * The client code is unchanged; only the transport's origin is set, as the reverse proxy sets it
 * in a deployment: `fetch` resolves this client's relative paths against `SINAPSE_LIVE_API`. Each
 * fetch is counted, so "not retried" is observed on the wire, not inferred.
 */
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { appConfig } from '../../app.config';
import { SessionExpiry } from '../session/session-expiry';
import { ApiClient } from './api-client';
import {
  type ApiFailure,
  ApiProblemFailure,
  isApiFailure,
  isInternalError,
  isRateLimitExceeded,
  isUnauthenticated,
  isValidationFailed,
} from './api-problem';
import { ApiRoutes, DevProbeRoutes } from './api-routes';
import { NETWORK_RETRY_DELAYS_MS } from './interceptors/network-retry.interceptor';
import { RateLimitState } from './rate-limit-state';

const LIVE_ORIGIN = (globalThis as { process?: { env: Record<string, string | undefined> } })
  .process?.env['SINAPSE_LIVE_API'];

/** The probe's rate-limit policy in `application-local.yml`: 5 requests a minute per address. */
const PROBE_LIMIT = 5;

async function failureOf(request: Promise<unknown>): Promise<ApiFailure> {
  try {
    await request;
  } catch (error) {
    expect(isApiFailure(error)).toBe(true);
    return error as ApiFailure;
  }
  throw new Error('expected the request to fail');
}

describe.skipIf(!LIVE_ORIGIN)('the API layer against a live local backend', () => {
  const realFetch = globalThis.fetch;
  const fetched: string[] = [];
  let api: ApiClient;

  beforeAll(() => {
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), LIVE_ORIGIN);
      fetched.push(`${init?.method ?? 'GET'} ${url.pathname}`);
      return realFetch(url, init);
    };
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  beforeEach(() => {
    fetched.length = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: NETWORK_RETRY_DELAYS_MS, useValue: [10, 10] }],
    });
    api = TestBed.inject(ApiClient);
  });
  afterEach(() => vi.restoreAllMocks());

  it('GET probe/ping: 200, body parsed', async () => {
    const body = await firstValueFrom(
      api.get<{ status: string; observedAt: string }>(DevProbeRoutes.ping),
    );
    expect(body.status).toBe('ok');
    expect(body.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('POST probe/validation with an invalid body: 400, errors[] populated and mapped', async () => {
    const failure = await failureOf(
      firstValueFrom(api.post(DevProbeRoutes.validation, { label: '' })),
    );
    expect(isValidationFailed(failure)).toBe(true);
    const problem = (failure as ApiProblemFailure).problem;
    expect(problem.status).toBe(400);
    expect(problem.errors).toEqual([{ field: 'label', message: expect.any(String) }]);
    expect(failure.correlationId).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
    expect(fetched).toHaveLength(1);
  });

  it('GET probe/failure: 500 mapped to internal-error, not retried', async () => {
    const failure = await failureOf(firstValueFrom(api.get(DevProbeRoutes.failure)));
    expect(isInternalError(failure)).toBe(true);
    expect((failure as ApiProblemFailure).problem.status).toBe(500);
    expect(fetched).toHaveLength(1);
  });

  it('GET probe/rate-limited past the limit: 429 with retryAfter, not retried', async () => {
    let refusal: ApiFailure | null = null;
    for (let i = 0; i <= PROBE_LIMIT && refusal === null; i++) {
      refusal = await firstValueFrom(api.get(DevProbeRoutes.rateLimited)).then(
        () => null,
        (error: unknown) => error as ApiFailure,
      );
    }
    expect(isRateLimitExceeded(refusal)).toBe(true);
    const retryAfter = (refusal as ApiProblemFailure).retryAfterSeconds;
    expect(retryAfter).toBeGreaterThan(0);
    expect(TestBed.inject(RateLimitState).lastRefusal()?.retryAfterSeconds).toBe(retryAfter);
    // One fetch per call: the refused call was sent once.
    expect(
      fetched.filter((line) => line.endsWith(DevProbeRoutes.rateLimited)).length,
    ).toBeLessThanOrEqual(PROBE_LIMIT + 1);
    const before = fetched.length;
    await failureOf(firstValueFrom(api.get(DevProbeRoutes.rateLimited)));
    expect(fetched.length - before).toBe(1);
  });

  it('GET /me/state, anonymous: 401 mapped to unauthenticated, expiry path fired once', async () => {
    const expire = vi.spyOn(TestBed.inject(SessionExpiry), 'expire');
    const failure = await failureOf(firstValueFrom(api.get(ApiRoutes.readModel.myState)));
    expect(isUnauthenticated(failure)).toBe(true);
    expect((failure as ApiProblemFailure).problem.status).toBe(401);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(fetched).toEqual([`GET ${ApiRoutes.readModel.myState}`]);
  });
});
