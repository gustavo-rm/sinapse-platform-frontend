import {
  type ApiFailure,
  isRateLimitExceeded,
  isResourceNotFound,
  isValidationFailed,
} from '../../../core/api/api-problem';

/** What consuming a verification token came to. Decided by the problem `type`. */
export type EmailVerificationOutcome =
  /** 204: the address is verified. The server decides the account's status; signing in shows it. */
  | { readonly kind: 'verified' }
  /**
   * 404: "Token unknown, expired or already used" — deliberately one answer for the three. One
   * message, which does not guess which.
   */
  | { readonly kind: 'not-accepted' }
  /**
   * 400 `validation-failed`: not declared for this route (K-D), but `EmailVerificationRequest`
   * requires a non-empty `token`; the field is the only one, so it is the field's error.
   */
  | { readonly kind: 'invalid' }
  /** 429: 10 per 5 minutes, keyed by address. The notice says how long. */
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function emailVerificationFailureOf(failure: ApiFailure): EmailVerificationOutcome {
  if (isResourceNotFound(failure)) {
    return { kind: 'not-accepted' };
  }
  if (isValidationFailed(failure)) {
    return { kind: 'invalid' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}
