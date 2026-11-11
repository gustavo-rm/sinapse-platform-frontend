import type { HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { type ApiFailure, isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type {
  RegistrationRequest,
  RegistrationResponse,
  TermsVersionSummary,
} from '../../../core/api/contract/models';
import { type RegistrationRefusal, registrationRefusalOf } from '../model/registration-outcome';

/** What a registration came to. */
export type RegistrationResult =
  /** 201: the account exists, `PENDING_VERIFICATION`. No session is opened by registering. */
  { readonly kind: 'registered'; readonly response: RegistrationResponse } | RegistrationRefusal;

/** A read of the wordings now in force, for the decision on a 409. */
export type TermsRead =
  | { readonly kind: 'read'; readonly terms: TermsVersionSummary[] }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

/**
 * Registration: `GET /api/v1/terms` then `POST /api/v1/accounts`. Both open — there is no session,
 * and the terms route is open on purpose, "because the screen that collects a registration has to
 * show the full text before there is an account to attribute the reading to".
 *
 * The password travels in the body only and is not kept here; nothing of the request is logged
 * (the failure log keeps the method, the route template, the type and the correlation id).
 */
@Injectable({ providedIn: 'root' })
export class Registration {
  private readonly api = inject(ApiClient);

  /** `GET /api/v1/terms`, as a resource: call it from a field initialiser of a component. */
  terms(): HttpResourceRef<TermsVersionSummary[] | undefined> {
    return this.api.read<TermsVersionSummary[]>(() => ({ url: ApiRoutes.identity.terms }));
  }

  /** `GET /api/v1/terms` again, imperatively: what is in force NOW, to decide a 409. */
  async termsNow(): Promise<TermsRead> {
    try {
      const terms = await firstValueFrom(
        this.api.get<TermsVersionSummary[]>(ApiRoutes.identity.terms),
      );
      return { kind: 'read', terms: terms ?? [] };
    } catch (error) {
      if (isApiFailure(error)) {
        return { kind: 'failed', failure: error };
      }
      throw error;
    }
  }

  /** `POST /api/v1/accounts`. */
  async register(request: RegistrationRequest): Promise<RegistrationResult> {
    try {
      const response = await firstValueFrom(
        this.api.post<RegistrationResponse>(ApiRoutes.identity.accounts, request),
      );
      return { kind: 'registered', response: response ?? {} };
    } catch (error) {
      if (isApiFailure(error)) {
        return registrationRefusalOf(error);
      }
      throw error;
    }
  }
}
