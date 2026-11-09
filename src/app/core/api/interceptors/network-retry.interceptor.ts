import { type HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { retry, throwError, timer } from 'rxjs';

import { isTransportFailure } from '../api-problem';

/** At most this many automatic retries of one request (`CLAUDE.md` §9). */
export const MAX_NETWORK_RETRIES = 2;

/**
 * The wait before each automatic retry, in milliseconds: the first, then the second. Growing, so
 * a network that is coming back is not hammered. A test may provide shorter waits; more than
 * `MAX_NETWORK_RETRIES` entries are ignored.
 */
export const NETWORK_RETRY_DELAYS_MS = new InjectionToken<readonly number[]>(
  'NETWORK_RETRY_DELAYS_MS',
  { providedIn: 'root', factory: () => [500, 1500] },
);

/**
 * The retry policy, and the only place this client repeats a request by itself: a GET whose
 * failure is `TransportFailure('network')` — no response at all — is tried again, at most twice,
 * with backoff.
 *
 * Never a write: the server may have acted before the connection dropped. Never a timeout or an
 * unreadable answer: a response was under way or came. Never a problem of the catalogue, 4xx or
 * 5xx: the server decided. Above all never a 401 or a 429: plan generation is capped at 10
 * requests per hour per account, and a retry spends that budget on the student's behalf.
 *
 * Registered just outside `problemDetailInterceptor`, so it reads converted failures, and inside
 * the session and rate-limit interceptors, so they see only the final outcome.
 */
export const networkRetryInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method !== 'GET') {
    return next(request);
  }
  const delays = inject(NETWORK_RETRY_DELAYS_MS).slice(0, MAX_NETWORK_RETRIES);
  return next(request).pipe(
    retry({
      count: delays.length,
      delay: (error: unknown, attempt: number) =>
        isTransportFailure(error) && error.reason === 'network'
          ? timer(delays[attempt - 1])
          : throwError(() => error),
    }),
  );
};
