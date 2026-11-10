import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { EmailVerificationRequest } from '../../../core/api/contract/models';
import {
  type EmailVerificationOutcome,
  emailVerificationFailureOf,
} from '../model/email-verification-outcome';

/**
 * `POST /api/v1/email-verifications` with `{token}`. Open: the person has no session — an account
 * that is not verified cannot sign in (FE-4.1).
 *
 * The token is a single-use credential. It travels in the body, never in a path or a query of a
 * request (so neither the route template the failure log keeps nor any URL carries it), and it is
 * not kept here after the call.
 */
@Injectable({ providedIn: 'root' })
export class EmailVerification {
  private readonly api = inject(ApiClient);

  async submit(token: string): Promise<EmailVerificationOutcome> {
    const body: EmailVerificationRequest = { token };
    try {
      await firstValueFrom(this.api.post<void>(ApiRoutes.identity.emailVerifications, body));
      return { kind: 'verified' };
    } catch (error) {
      if (isApiFailure(error)) {
        return emailVerificationFailureOf(error);
      }
      throw error;
    }
  }
}
