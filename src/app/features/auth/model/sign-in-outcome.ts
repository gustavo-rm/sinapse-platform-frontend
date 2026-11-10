import {
  type ApiFailure,
  isRateLimitExceeded,
  isUnauthenticated,
  isValidationFailed,
} from '../../../core/api/api-problem';

/** The two fields of `LoginRequest`. */
export type SignInField = 'email' | 'password';

/** What a refused sign-in means for the form. Decided by the problem `type`, never the status. */
export type SignInRefusal =
  /** 401, for an unknown address, a wrong password and an inactive account alike. */
  | { readonly kind: 'refused' }
  /** 400 `validation-failed`: the fields the server pointed at, and whether any was not a field. */
  | {
      readonly kind: 'invalid';
      readonly fields: ReadonlySet<SignInField>;
      readonly formLevel: boolean;
    }
  /** 429: how long to wait, when the server said. */
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  /** Anything else: the error state, by type or reason. */
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

const FIELDS: readonly SignInField[] = ['email', 'password'];

/**
 * Reads the failure of `POST /api/v1/sessions` for the sign-in form.
 *
 * `validation-failed` is handled although the snapshot declares no 400 for this operation (K-D):
 * `LoginRequest` declares both fields required, and FE-3 saw the backend answer a body that
 * breaks a constraint with 400 `validation-failed`. Its `errors[].message` is English text for a
 * developer and is never shown; only `field` is read. `field: "request"`, or a name that is not a
 * field of the form, is a form-level error.
 *
 * Nothing here distinguishes the three causes of a 401. The backend gives one answer for an
 * unknown address, a wrong password and an inactive account so that nobody can learn whether an
 * account exists, and the interface must not undo that: no probe, no second request.
 */
export function signInRefusalOf(failure: ApiFailure): SignInRefusal {
  if (isUnauthenticated(failure)) {
    return { kind: 'refused' };
  }
  if (isValidationFailed(failure)) {
    const named = (failure.problem.errors ?? []).map((error) => error.field);
    const fields = new Set(FIELDS.filter((field) => named.includes(field)));
    const formLevel = named.length === 0 || named.some((name) => !isField(name));
    return { kind: 'invalid', fields, formLevel };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

function isField(name: string): name is SignInField {
  return (FIELDS as readonly string[]).includes(name);
}
