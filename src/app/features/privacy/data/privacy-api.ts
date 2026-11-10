import type { HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ConsentPurpose } from '../../../core/api/contract/enums';
import type {
  ConsentRequest,
  ConsentSummary,
  ErasureRequestView,
  PersonalDataExport,
  ReaffirmationRequest,
  TermsVersionSummary,
} from '../../../core/api/contract/models';
import {
  type GrantOutcome,
  type ReaffirmationOutcome,
  type WithdrawalOutcome,
  grantFailureOf,
  reaffirmationFailureOf,
  withdrawalFailureOf,
} from '../model/consent';
import {
  type CancellationOutcome,
  type ExportFailure,
  cancellationFailureOf,
  exportFailureOf,
} from '../model/suspension';

/** The data export, or why not. Its body is personal data: never logged, never kept. */
export type ExportRead =
  { readonly kind: 'exported'; readonly body: PersonalDataExport } | ExportFailure;

/**
 * The routes of consent and of the holder's data rights, as this feature uses them. Reads are
 * resources (call them from a field initialiser of a component); writes are imperative and return
 * an outcome decided by the problem `type`.
 */
@Injectable({ providedIn: 'root' })
export class PrivacyApi {
  private readonly api = inject(ApiClient);

  /** `GET /api/v1/terms`: every published wording, with its full text. Open, no session. */
  terms(): HttpResourceRef<TermsVersionSummary[] | undefined> {
    return this.api.read<TermsVersionSummary[]>(() => ({ url: ApiRoutes.identity.terms }));
  }

  /** `GET /api/v1/consents`: the caller's history, withdrawn records included. */
  consentHistory(): HttpResourceRef<ConsentSummary[] | undefined> {
    return this.api.read<ConsentSummary[]>(() => ({ url: ApiRoutes.identity.consents }));
  }

  /** `GET /api/v1/me/erasure-requests`: including withdrawn and failed ones. */
  erasureRequests(): HttpResourceRef<ErasureRequestView[] | undefined> {
    return this.api.read<ErasureRequestView[]>(() => ({
      url: ApiRoutes.dataRights.erasureRequests,
    }));
  }

  /**
   * `POST /api/v1/consents` with the purpose and the id of the wording that was DISPLAYED — the
   * server ties the record to it, which is what makes the record probative. Never a remembered id.
   */
  async grant(purpose: ConsentPurpose, termsVersionId: string): Promise<GrantOutcome> {
    const body: ConsentRequest = { purpose, termsVersionId };
    try {
      await firstValueFrom(this.api.post<void>(ApiRoutes.identity.consents, body));
      return { kind: 'granted' };
    } catch (error) {
      if (isApiFailure(error)) {
        return grantFailureOf(error);
      }
      throw error;
    }
  }

  /** `DELETE /api/v1/consents/{purpose}`. For the essential purpose the session dies with it. */
  async withdraw(purpose: ConsentPurpose): Promise<WithdrawalOutcome> {
    try {
      await firstValueFrom(this.api.delete(ApiRoutes.identity.consent({ purpose })));
      return { kind: 'withdrawn' };
    } catch (error) {
      if (isApiFailure(error)) {
        return withdrawalFailureOf(error);
      }
      throw error;
    }
  }

  /**
   * `POST /api/v1/consents/reaffirmation`, signed in. The body is required and its one member,
   * `token`, is "present only when the caller is not signed in": so the body is empty. The session
   * identifies the holder.
   */
  async reaffirm(): Promise<ReaffirmationOutcome> {
    const body: ReaffirmationRequest = {};
    try {
      await firstValueFrom(this.api.post<void>(ApiRoutes.identity.consentReaffirmation, body));
      return { kind: 'reaffirmed' };
    } catch (error) {
      if (isApiFailure(error)) {
        return reaffirmationFailureOf(error);
      }
      throw error;
    }
  }

  /** `POST /api/v1/me/erasure-requests/{requestId}/cancellation`. */
  async cancelErasure(requestId: string): Promise<CancellationOutcome> {
    try {
      await firstValueFrom(
        this.api.post<ErasureRequestView>(
          ApiRoutes.dataRights.erasureRequestCancellation({ requestId }),
        ),
      );
      return { kind: 'cancelled' };
    } catch (error) {
      if (isApiFailure(error)) {
        return cancellationFailureOf(error);
      }
      throw error;
    }
  }

  /**
   * `GET /api/v1/me/data-export`: assembled on demand, so `ApiClient` gives it 120 s. It takes as
   * long as it takes, and the backend reports no progress.
   */
  async exportData(): Promise<ExportRead> {
    try {
      const body = await firstValueFrom(
        this.api.get<PersonalDataExport>(ApiRoutes.dataRights.dataExport),
      );
      return { kind: 'exported', body };
    } catch (error) {
      if (isApiFailure(error)) {
        return exportFailureOf(error);
      }
      throw error;
    }
  }
}
