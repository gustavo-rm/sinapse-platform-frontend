import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { isApiProblem, problemHandling } from '../api-problem';
import { RateLimitState } from '../rate-limit-state';

/**
 * Interceptor 4. On `urn:sinapse:problem:rate-limit-exceeded` — decided by the problem type, never
 * by the 429 — publishes the refusal and its `Retry-After` to `RateLimitState`, for the screen that
 * shows `RateLimitNotice`. The failure, which carries `retryAfterSeconds` too, still reaches the
 * caller.
 *
 * Never retries, and schedules nothing: the person decides when to try again, after the wait.
 */
export const rateLimitInterceptor: HttpInterceptorFn = (request, next) => {
  const state = inject(RateLimitState);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (isApiProblem(error) && problemHandling(error.type) === 'rate-limit') {
        state.record({
          route: error.route,
          method: error.method,
          retryAfterSeconds: error.retryAfterSeconds,
          receivedAt: Date.now(),
        });
      }
      return throwError(() => error);
    }),
  );
};
