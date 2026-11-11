import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type {
  PasswordResetConfirmation,
  PasswordResetRequest,
} from '../../../core/api/contract/models';
import {
  type ResetConfirmationOutcome,
  type ResetRequestOutcome,
  resetConfirmationFailureOf,
  resetRequestFailureOf,
} from '../model/password-reset-outcome';

/**
 * Password reset: `POST /api/v1/password-resets` with `{email}`, then
 * `POST /api/v1/password-resets/confirmation` with `{token, newPassword}`. Both open: the person
 * cannot sign in, which is why they are here.
 *
 * The token is a single-use credential that authorises the change on its own, and the new password
 * is a secret: both travel in the body only, never in a path or a query, and neither is kept here
 * after the call.
 */
@Injectable({ providedIn: 'root' })
export class PasswordReset {
  private readonly api = inject(ApiClient);

  async request(email: string): Promise<ResetRequestOutcome> {
    const body: PasswordResetRequest = { email };
    try {
      await firstValueFrom(this.api.post<void>(ApiRoutes.identity.passwordResets, body));
      return { kind: 'accepted' };
    } catch (error) {
      if (isApiFailure(error)) {
        return resetRequestFailureOf(error);
      }
      throw error;
    }
  }

  async confirm(token: string, newPassword: string): Promise<ResetConfirmationOutcome> {
    const body: PasswordResetConfirmation = { token, newPassword };
    try {
      await firstValueFrom(this.api.post<void>(ApiRoutes.identity.passwordResetConfirmation, body));
      return { kind: 'reset' };
    } catch (error) {
      if (isApiFailure(error)) {
        return resetConfirmationFailureOf(error);
      }
      throw error;
    }
  }
}
