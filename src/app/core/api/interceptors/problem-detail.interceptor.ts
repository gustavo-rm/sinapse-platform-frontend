import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { toApiFailure } from '../problem-conversion';

/**
 * Interceptor 2. Converts every failed exchange into an `ApiProblemFailure` (the server answered
 * `application/problem+json` with a type of the catalogue) or a `TransportFailure` (it did not
 * answer in the contract). No raw `HttpErrorResponse` gets past it.
 *
 * Registered last, so it is the innermost and the first to see a response: Angular runs the
 * response side of interceptors in reverse registration order. Everything that reads a problem
 * type — the retry policy, the session expiry, the rate limit, the log — therefore reads a
 * converted failure, never an HTTP status (`CLAUDE.md` R6).
 */
export const problemDetailInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) => throwError(() => toApiFailure(error, request))),
  );
