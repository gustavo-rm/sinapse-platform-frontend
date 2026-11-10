import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { SessionStore } from '../../session/session-store';
import { type ApiFailure, isApiProblem, problemHandling } from '../api-problem';
import { ApiRoutes } from '../api-routes';

/**
 * The requests whose `unauthenticated` the caller handles itself, so the expiry path must not.
 *
 * - Signing in ("Credential refused…"): a mistyped password is not a session that ended. The
 *   form says one thing for every refusal, and never probes: telling an unknown address from a
 *   wrong password would reveal whether an account exists.
 * - Changing the password ("No usable session, or the current password does not match"): the two
 *   meanings need opposite answers, so the form probes `GET /api/v1/me/state` once (decision D2
 *   of FE-4); a 401 there goes through this path like any other.
 * - Signing out: a 401 means the session was already gone, which is what the person asked for;
 *   `SessionStore.signOut` ends it locally either way and must not be told the session "expired".
 */
const HANDLED_BY_CALLER: readonly { readonly method: string; readonly route: string }[] = [
  { method: 'POST', route: ApiRoutes.identity.sessions },
  { method: 'POST', route: ApiRoutes.identity.passwordChanges },
  { method: 'DELETE', route: ApiRoutes.identity.currentSession },
];

function isHandledByCaller(failure: ApiFailure): boolean {
  return HANDLED_BY_CALLER.some(
    ({ method, route }) => failure.method === method && failure.route === route,
  );
}

/**
 * Interceptor 3. On `urn:sinapse:problem:unauthenticated` — decided by the problem type, never by
 * the 401 — ends the session: clears the session state, keeps the route the person was on, and
 * sends them to sign in (`SessionStore.expire`). Once, however many requests fail
 * together. The failure still reaches the caller, which shows nothing more.
 *
 * Never retries: the session is gone, and only the person can open a new one.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionStore);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        isApiProblem(error) &&
        problemHandling(error.type) === 'session-expiry' &&
        !isHandledByCaller(error)
      ) {
        session.expire();
      }
      return throwError(() => error);
    }),
  );
};
