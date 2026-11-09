import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { SessionExpiry } from '../../session/session-expiry';
import { type ApiFailure, isApiProblem, problemHandling } from '../api-problem';
import { ApiRoutes } from '../api-routes';

/**
 * The requests whose `unauthenticated` answers a credential the person just typed rather than a
 * session that ended, by the snapshot's own description of their 401: signing in ("Credential
 * refused…") and changing the password ("No usable session, or the current password does not
 * match"). Sending someone who mistyped a password to the sign-in screen would be wrong; the form
 * that made the request handles the problem.
 */
const CREDENTIAL_CHECKS: readonly { readonly method: string; readonly route: string }[] = [
  { method: 'POST', route: ApiRoutes.identity.sessions },
  { method: 'POST', route: ApiRoutes.identity.passwordChanges },
];

function isCredentialCheck(failure: ApiFailure): boolean {
  return CREDENTIAL_CHECKS.some(
    ({ method, route }) => failure.method === method && failure.route === route,
  );
}

/**
 * Interceptor 3. On `urn:sinapse:problem:unauthenticated` — decided by the problem type, never by
 * the 401 — ends the session: clears the session state, keeps the route the person was on, and
 * sends them to sign in (`SessionExpiry`, a stub until FE-4). Once, however many requests fail
 * together. The failure still reaches the caller, which shows nothing more.
 *
 * Never retries: the session is gone, and only the person can open a new one.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionExpiry);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        isApiProblem(error) &&
        problemHandling(error.type) === 'session-expiry' &&
        !isCredentialCheck(error)
      ) {
        session.expire();
      }
      return throwError(() => error);
    }),
  );
};
