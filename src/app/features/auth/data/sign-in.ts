import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { LoginRequest } from '../../../core/api/contract/models';
import { SessionStore } from '../../../core/session/session-store';
import { type SignInRefusal, signInRefusalOf } from '../model/sign-in-outcome';

/** The outcome of a sign-in: where to go, or why not. */
export type SignInResult =
  | { readonly kind: 'signed-in'; readonly destination: string }
  /** 201, then a 401 on the state: no session in this browser. The store says so; stay here. */
  | { readonly kind: 'not-established' }
  | SignInRefusal;

/**
 * Signing in: `POST /api/v1/sessions` with a `LoginRequest`.
 *
 * The 201 body carries the session token, for clients that send it back as a bearer token. This
 * client does not: the server also sets it as an `HttpOnly` cookie, which is the session here. So
 * the body is DISCARDED as it arrives — never read, stored, logged or passed on — and only the
 * fact that the request succeeded is kept.
 *
 * On success the store establishes the session (`SessionStore.establish`) — which also tells a
 * session that could not be kept from one that expired; the caller then navigates to
 * the route the person was on before, or to `/hoje`, and the guard chain runs on arrival: signing
 * in does not bypass it.
 */
@Injectable({ providedIn: 'root' })
export class SignIn {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  async submit(credentials: LoginRequest): Promise<SignInResult> {
    try {
      // The body (SessionResponse, with the token) is not even given a type: it is dropped here.
      await firstValueFrom(this.api.post<unknown>(ApiRoutes.identity.sessions, credentials));
    } catch (error) {
      if (isApiFailure(error)) {
        return signInRefusalOf(error);
      }
      throw error;
    }
    const { outcome, destination } = await this.store.establish();
    return outcome.kind === 'signed-out'
      ? { kind: 'not-established' }
      : { kind: 'signed-in', destination };
  }
}
