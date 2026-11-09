import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { logApiFailure } from '../../telemetry/api-failure-log';
import { isApiFailure } from '../api-problem';
import { CORRELATION_ID_HEADER } from '../problem-conversion';

/**
 * Interceptor 1. Gives every request an `X-Correlation-Id`, the identifier the backend puts in
 * every line of its structured log for that request (`CorrelationIdFilter`, which accepts
 * `[A-Za-z0-9._-]{1,64}` and echoes it back). A failure reported by a person can then be found in
 * the server's log by that id, which `ErrorState` shows them.
 *
 * Registered first, so it is the outermost: the id is set before anything else sees the request,
 * the automatic retries of a GET carry the same id, and the failure it logs is the final one,
 * already converted. It logs the method, the route template, the problem type and the id — never
 * a body, a query string or a concrete path (`apiFailureLogEntry`).
 */
export const correlationIdInterceptor: HttpInterceptorFn = (request, next) => {
  const tagged = request.headers.has(CORRELATION_ID_HEADER)
    ? request
    : request.clone({ setHeaders: { [CORRELATION_ID_HEADER]: newCorrelationId() } });
  return next(tagged).pipe(
    catchError((error: unknown) => {
      if (isApiFailure(error)) {
        logApiFailure(error);
      }
      return throwError(() => error);
    }),
  );
};

/**
 * A random UUID. `crypto.randomUUID` exists only in a secure context (HTTPS or localhost), so a
 * page served over plain HTTP falls back to the same format from `getRandomValues`.
 */
export function newCorrelationId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
