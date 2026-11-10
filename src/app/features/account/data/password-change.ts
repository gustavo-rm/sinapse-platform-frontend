import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure, isUnauthenticated } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { PasswordChangeRequest } from '../../../core/api/contract/models';
import { SessionStore } from '../../../core/session/session-store';
import {
  type PasswordChangeOutcome,
  passwordChangeFailureOf,
} from '../model/password-change-outcome';

/**
 * Changing the password: `POST /api/v1/password-changes` with `PasswordChangeRequest`.
 *
 * A change ends every session of the account, the one that asked included, and the answer is
 * 204: the session is cleared here, at once, without waiting for a 401 that would only come on
 * the next request (`CLAUDE.md`, *Session and time, in one place*).
 */
@Injectable({ providedIn: 'root' })
export class PasswordChange {
  private readonly api = inject(ApiClient);
  private readonly store = inject(SessionStore);

  async submit(request: PasswordChangeRequest): Promise<PasswordChangeOutcome> {
    try {
      await firstValueFrom(this.api.post<void>(ApiRoutes.identity.passwordChanges, request));
    } catch (error) {
      if (!isApiFailure(error)) {
        throw error;
      }
      return isUnauthenticated(error) ? this.probe() : passwordChangeFailureOf(error);
    }
    this.store.end('password-changed');
    return { kind: 'changed' };
  }

  /**
   * DECISION D2 of FE-4 (`docs/ai/STATE.md`), and the one place to delete when the backend gives a
   * refused credential its own problem type (K-C).
   *
   * This route answers 401 `unauthenticated` both for "no usable session" and for "the current
   * password does not match", in the snapshot's own words, and the two need opposite answers. So
   * the state is read once more, through the store — the only caller of `GET /api/v1/me/state`:
   *
   * - signed in: the session is alive, so the password was wrong; the form says so on its field;
   * - signed out: the session is gone, and the 401 of the probe has already gone through the
   *   expiry path like any other (to sign in, remembering the route);
   * - failed: nothing can be told. The form shows the error state and the session is kept.
   *
   * Never after a 401 of `POST /api/v1/sessions`: there the single answer is deliberate.
   */
  private async probe(): Promise<PasswordChangeOutcome> {
    const outcome = await this.store.refresh();
    switch (outcome.kind) {
      case 'signed-in':
        return { kind: 'wrong-current-password' };
      case 'signed-out':
        return { kind: 'session-gone' };
      case 'failed':
        return { kind: 'undetermined', failure: outcome.failure };
    }
  }
}
