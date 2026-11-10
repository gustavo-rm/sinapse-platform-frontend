import {
  type ApiFailure,
  isConflict,
  isRateLimitExceeded,
  isResourceNotFound,
} from '../../../core/api/api-problem';
import type { ConsentSummary, ErasureRequestView } from '../../../core/api/contract/models';
import { consentsInForce } from './consent';

const DAY_MS = 86_400_000;

/** An erasure request inside its window, with what the screen tells the person about it. */
export interface OpenErasureRequest {
  readonly id: string;
  readonly requestedAt: string | null;
  /** When the erasure happens, and the window to withdraw it closes. */
  readonly effectiveAt: string | null;
  /**
   * The window in whole days, from the request's own two instants — never the configured
   * default, which a deployment may override (`sinapse.data-rights.erasure-window`, 7 days).
   */
  readonly windowDays: number | null;
}

/**
 * Why a SUSPENDED account is suspended. The bootstrap cannot tell — both causes produced the same
 * body in FE-4.1 — so the suspended screen reads two other routes:
 *
 * - `erasure`: `GET /api/v1/me/erasure-requests` has one `REQUESTED`. The holder may withdraw it,
 *   or take their data.
 * - `consent-withdrawn`: no open request, and `GET /api/v1/consents` shows the
 *   `LEARNING_DATA_PROCESSING` consent withdrawn — or none in force. MEASURED in FE-5: granting it
 *   again answers 201 and the account stays SUSPENDED, so a withdrawn record decides the cause
 *   even after a new grant (the walk-through showed the screen losing its explanation otherwise),
 *   and the screen offers no grant — an action that does nothing.
 * - `unknown`: neither. The suspension at the end of the majority grace period is the one other
 *   cause the backend has (ADR 0004), and it cannot happen in this version (registration refuses
 *   minors, K-E); the screen states the situation and promises nothing (D4).
 *
 * An open request wins over a missing consent: it is what the person can act on, and its
 * cancellation answers 409 if the consent is missing too, which the screen then says.
 */
export type SuspensionCause =
  | { readonly kind: 'erasure'; readonly request: OpenErasureRequest }
  | { readonly kind: 'consent-withdrawn' }
  | { readonly kind: 'unknown' };

export function suspensionCauseOf(
  requests: readonly ErasureRequestView[],
  history: readonly ConsentSummary[],
): SuspensionCause {
  const open = requests.find((request) => request.status === 'REQUESTED' && request.id);
  if (open?.id) {
    const requestedAt = open.requestedAt ?? null;
    const effectiveAt = open.effectiveAt ?? null;
    return {
      kind: 'erasure',
      request: {
        id: open.id,
        requestedAt,
        effectiveAt,
        windowDays: windowDaysOf(requestedAt, effectiveAt),
      },
    };
  }
  const essentialWithdrawn = history.some(
    (record) => record.purpose === 'LEARNING_DATA_PROCESSING' && record.revokedAt !== undefined,
  );
  if (essentialWithdrawn || !consentsInForce(history).has('LEARNING_DATA_PROCESSING')) {
    return { kind: 'consent-withdrawn' };
  }
  return { kind: 'unknown' };
}

function windowDaysOf(requestedAt: string | null, effectiveAt: string | null): number | null {
  if (requestedAt === null || effectiveAt === null) {
    return null;
  }
  const span = Date.parse(effectiveAt) - Date.parse(requestedAt);
  return Number.isFinite(span) && span > 0 ? Math.round(span / DAY_MS) : null;
}

/** What withdrawing an erasure request came to. */
export type CancellationOutcome =
  /** 200: the request is withdrawn; the account is back to ACTIVE, the chain will show. */
  | { readonly kind: 'cancelled' }
  /** 404: no such request for this account. Read the requests again. */
  | { readonly kind: 'gone' }
  /**
   * 409 `conflict`: the request was already carried out, withdrawn or failed — or, read in the
   * backend (`ConsentService.reactivate`), the essential consent is not in force, so the account
   * could not be put back, and the cancellation is rolled back with it.
   */
  | { readonly kind: 'refused' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function cancellationFailureOf(failure: ApiFailure): CancellationOutcome {
  if (isResourceNotFound(failure)) {
    return { kind: 'gone' };
  }
  if (isConflict(failure)) {
    return { kind: 'refused' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

/** Why the data export did not come. */
export type ExportFailure =
  /** 429: five per hour, keyed by account (`application.yml`). The notice says how long. */
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function exportFailureOf(failure: ApiFailure): ExportFailure {
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

/** The file name of an export: the platform and the account's local date (`yyyy-MM-dd`). */
export function exportFileName(localDate: string): string {
  return `sinapse-meus-dados-${localDate}.json`;
}
