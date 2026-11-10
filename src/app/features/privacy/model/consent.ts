import {
  type ApiFailure,
  isConflict,
  isRateLimitExceeded,
  isResourceNotFound,
} from '../../../core/api/api-problem';
import { CONSENT_PURPOSES, type ConsentPurpose } from '../../../core/api/contract/enums';
import type { ConsentSummary, TermsVersionSummary } from '../../../core/api/contract/models';

/** A published wording, with the three members this client cannot do without. */
export interface Wording {
  readonly id: string;
  readonly purpose: ConsentPurpose;
  readonly version: string;
  readonly body: string;
  /** Absent in no observed body, but optional in the schema (K-A): then no date is shown. */
  readonly publishedAt: string | null;
}

/**
 * The wording in force for each purpose: the most recently published one, which is the one the
 * server will accept (`TermsService.currentFor`: the first by `publishedAt` descending). An entry
 * without an `id`, a `purpose`, a `version` or a `body` is skipped: it cannot be shown in full or
 * accepted, and consent to a text that was not shown is not consent.
 */
export function currentWordings(
  terms: readonly TermsVersionSummary[],
): ReadonlyMap<ConsentPurpose, Wording> {
  const current = new Map<ConsentPurpose, Wording>();
  for (const entry of terms) {
    const { id, purpose, version, body } = entry;
    if (!id || !purpose || !version || body === undefined || body.trim() === '') {
      continue;
    }
    const wording: Wording = { id, purpose, version, body, publishedAt: entry.publishedAt ?? null };
    const held = current.get(purpose);
    if (held === undefined || isLater(wording.publishedAt, held.publishedAt)) {
      current.set(purpose, wording);
    }
  }
  return current;
}

function isLater(candidate: string | null, held: string | null): boolean {
  if (candidate === null) {
    return false;
  }
  return held === null || Date.parse(candidate) > Date.parse(held);
}

/** The marker the backend's `local` profile puts on its three wordings (`application-local.yml`). */
const PLACEHOLDER_VERSION = 'dev-0';
const PLACEHOLDER_BODY = 'Development placeholder';

/**
 * Whether a wording is one of the development placeholders, which are not consent terms (F5). Any
 * screen that shows one says so visibly, so nobody in development mistakes it for a real term.
 */
export function isDevelopmentPlaceholder(wording: Wording): boolean {
  return wording.version === PLACEHOLDER_VERSION || wording.body.includes(PLACEHOLDER_BODY);
}

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
