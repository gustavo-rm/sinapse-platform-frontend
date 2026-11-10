import {
  type ApiFailure,
  isRateLimitExceeded,
  isValidationFailed,
} from '../../../core/api/api-problem';

/** The two fields of `PasswordChangeRequest`. */
export type PasswordField = 'currentPassword' | 'newPassword';

/** What a password change came to, for the form. */
export type PasswordChangeOutcome =
  /** 204: every session of the account ended; the store was cleared and sign-in shown. */
  | { readonly kind: 'changed' }
  /** 401, and the probe found the session alive: the current password does not match. */
  | { readonly kind: 'wrong-current-password' }
  /** 401, and the probe found the session gone: the expiry path has already run. */
  | { readonly kind: 'session-gone' }
  /** 401, and the probe got no answer: nothing can be told, and nothing is cleared. */
  | { readonly kind: 'undetermined'; readonly failure: ApiFailure }
  | {
      readonly kind: 'invalid';
      readonly fields: ReadonlySet<PasswordField>;
      readonly formLevel: boolean;
    }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

const FIELDS: readonly PasswordField[] = ['currentPassword', 'newPassword'];

/**
 * Reads a failure of `POST /api/v1/password-changes` other than `unauthenticated`, which the
 * probe decides. `validation-failed` is handled although the snapshot declares no 400 for this
 * operation (D3, K-D); only `errors[].field` is read, never the English `message`.
 */
export function passwordChangeFailureOf(failure: ApiFailure): PasswordChangeOutcome {
  if (isValidationFailed(failure)) {
    const named = (failure.problem.errors ?? []).map((error) => error.field);
    const fields = new Set(FIELDS.filter((field) => named.includes(field)));
    const formLevel =
      named.length === 0 || named.some((name) => !(FIELDS as readonly string[]).includes(name));
    return { kind: 'invalid', fields, formLevel };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}
