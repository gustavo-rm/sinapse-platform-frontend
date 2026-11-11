import {
  type ApiFailure,
  isRateLimitExceeded,
  isResourceNotFound,
  isValidationFailed,
} from '../../../core/api/api-problem';

/**
 * What a reset REQUEST (`POST /api/v1/password-resets`) came to.
 *
 * `accepted` is the only success, and it says NOTHING about the address: the server "answers the
 * same way whether or not the address is registered. The alternative turns this route into a way of
 * testing who has an account here." So the screen shows one confirmation for every 204, worded so
 * that it holds in both cases, and has no branch that could tell them apart.
 */
export type ResetRequestOutcome =
  | { readonly kind: 'accepted' }
  /**
   * 400 `validation-failed`: not declared (K-D), but `PasswordResetRequest.email` is `@NotBlank`.
   * About the shape of what was typed, never about whether an account exists.
   */
  | { readonly kind: 'invalid' }
  /** 429: 5 requests per hour, keyed by address. */
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function resetRequestFailureOf(failure: ApiFailure): ResetRequestOutcome {
  if (isValidationFailed(failure)) {
    return { kind: 'invalid' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

/** The two fields of `PasswordResetConfirmation`. */
export type ResetConfirmationField = 'token' | 'newPassword';

/** What a reset CONFIRMATION (`POST /api/v1/password-resets/confirmation`) came to. */
export type ResetConfirmationOutcome =
  /** 204: "Password changed and sessions ended" — every session of the account, in one transaction. */
  | { readonly kind: 'reset' }
  /** 404: "Token unknown, expired or already used" — one message for the three, no guess. */
  | { readonly kind: 'not-accepted' }
  /** 400 `validation-failed` (not declared, K-D): the fields the server named. */
  | {
      readonly kind: 'invalid';
      readonly fields: ReadonlySet<ResetConfirmationField>;
      readonly formLevel: boolean;
    }
  /** 429: 10 confirmations per 5 minutes, keyed by address. */
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

const CONFIRMATION_FIELDS: readonly ResetConfirmationField[] = ['token', 'newPassword'];

export function resetConfirmationFailureOf(failure: ApiFailure): ResetConfirmationOutcome {
  if (isResourceNotFound(failure)) {
    return { kind: 'not-accepted' };
  }
  if (isValidationFailed(failure)) {
    const named = (failure.problem.errors ?? []).map((error) => error.field);
    const fields = new Set(CONFIRMATION_FIELDS.filter((field) => named.includes(field)));
    const formLevel =
      named.length === 0 ||
      named.some((name) => !(CONFIRMATION_FIELDS as readonly string[]).includes(name));
    return { kind: 'invalid', fields, formLevel };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}
