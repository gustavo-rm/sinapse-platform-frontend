import {
  type ApiFailure,
  isConflict,
  isRateLimitExceeded,
  isResourceNotFound,
} from '../../../core/api/api-problem';
import { CONSENT_PURPOSES, type ConsentPurpose } from '../../../core/api/contract/enums';
import type { ConsentSummary } from '../../../core/api/contract/models';

/** A consent in force: granted and not withdrawn. */
export interface ConsentInForce {
  readonly purpose: ConsentPurpose;
  readonly grantedAt: string | null;
  readonly termsVersion: string | null;
}

/**
 * The consents in force, by purpose, from `GET /api/v1/consents` — the history, withdrawn records
 * included. In force is a record with no `revokedAt`; the server allows one per purpose (a partial
 * unique index), so the first one found is the one.
 */
export function consentsInForce(
  history: readonly ConsentSummary[],
): ReadonlyMap<ConsentPurpose, ConsentInForce> {
  const inForce = new Map<ConsentPurpose, ConsentInForce>();
  for (const record of history) {
    if (record.purpose === undefined || record.revokedAt !== undefined) {
      continue;
    }
    if (!inForce.has(record.purpose)) {
      inForce.set(record.purpose, {
        purpose: record.purpose,
        grantedAt: record.grantedAt ?? null,
        termsVersion: record.termsVersion ?? null,
      });
    }
  }
  return inForce;
}

/** The purposes in their contract order, filtered: for a stable order on every screen. */
export function inContractOrder(purposes: Iterable<ConsentPurpose>): ConsentPurpose[] {
  const wanted = new Set(purposes);
  return CONSENT_PURPOSES.filter((purpose) => wanted.has(purpose));
}

/**
 * What withdrawing a purpose does, as the confirmation must say it beforehand.
 *
 * - `suspends-account`: the essential purpose. Suspends and ends every session in the same
 *   transaction; a destructive confirmation, by typed word.
 * - `ends-teacher-access`: a teacher's reads stop at once. An ordinary confirmation, which says
 *   nothing about suspension.
 * - `none`: research. No confirmation at all: withdrawing is no harder than granting.
 */
export type WithdrawalEffect = 'suspends-account' | 'ends-teacher-access' | 'none';

export function withdrawalEffectOf(purpose: ConsentPurpose): WithdrawalEffect {
  switch (purpose) {
    case 'LEARNING_DATA_PROCESSING':
      return 'suspends-account';
    case 'INSTITUTION_SHARING':
      return 'ends-teacher-access';
    case 'ACADEMIC_RESEARCH':
      return 'none';
    default:
      return unreachable(purpose);
  }
}

/**
 * Whether a purpose can be granted from a consent screen. `INSTITUTION_SHARING` cannot: it is
 * consented to when an invite is redeemed and only then (closed decision F1), with the classroom's
 * preview in full; granting it on its own would be consent to sharing with nobody in particular.
 */
export function grantableHere(purpose: ConsentPurpose): boolean {
  return purpose !== 'INSTITUTION_SHARING';
}

/** The word the destructive confirmation asks for. */
export const SUSPENSION_CONFIRM_WORD = 'SUSPENDER';

/** What a grant came to. Decided by the problem `type`, never the status. */
export type GrantOutcome =
  | { readonly kind: 'granted' }
  /**
   * 409 `conflict`: the purpose already has a consent in force, OR the wording sent is no longer
   * the one published — the snapshot's own words, one type for both. The remedy is the same: read
   * the state and the wordings again, and let the person read what is now in force.
   */
  | { readonly kind: 'changed' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function grantFailureOf(failure: ApiFailure): GrantOutcome {
  if (isConflict(failure)) {
    return { kind: 'changed' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

/** What a withdrawal came to. */
export type WithdrawalOutcome =
  | { readonly kind: 'withdrawn' }
  /** 404: no consent in force for that purpose — it was already withdrawn, elsewhere. */
  | { readonly kind: 'not-in-force' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function withdrawalFailureOf(failure: ApiFailure): WithdrawalOutcome {
  if (isResourceNotFound(failure)) {
    return { kind: 'not-in-force' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

function unreachable(value: never): never {
  throw new RangeError(`Unhandled case: ${JSON.stringify(value)}`);
}

/** What a reaffirmation came to. */
export type ReaffirmationOutcome =
  /** 204: a record in the holder's own name replaces the guardian's. */
  | { readonly kind: 'reaffirmed' }
  /**
   * 409 `conflict`: "the account is in a state that cannot reaffirm, or the holder has not reached
   * the consent age". Nothing for the person to fix here; the state is read again.
   */
  | { readonly kind: 'refused' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function reaffirmationFailureOf(failure: ApiFailure): ReaffirmationOutcome {
  if (isConflict(failure)) {
    return { kind: 'refused' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}
