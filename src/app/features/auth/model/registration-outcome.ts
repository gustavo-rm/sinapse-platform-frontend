import {
  type ApiFailure,
  isConflict,
  isMinorRegistrationNotSupported,
  isRateLimitExceeded,
  isValidationFailed,
} from '../../../core/api/api-problem';
import type { ConsentPurpose } from '../../../core/api/contract/enums';
import type { Wording } from '../../../shared/ui/consent-disclosure/wording';

/** The fields of the registration form, as `RegistrationRequest` names them. */
export type RegistrationField = 'email' | 'password' | 'dateOfBirth' | 'timeZone';

/**
 * The purposes a registration may carry. `INSTITUTION_SHARING` is NOT one of them: it is consented
 * to when an invite is redeemed, and only then (closed decision F1 of the backend's flows document);
 * the server refuses it here with 400 `validation-failed`, `field: institutionSharingAbsent` (K-I,
 * observed in FE-4.1). In contract order.
 */
export const REGISTRATION_PURPOSES = [
  'LEARNING_DATA_PROCESSING',
  'ACADEMIC_RESEARCH',
] as const satisfies readonly ConsentPurpose[];
export type RegistrationPurpose = (typeof REGISTRATION_PURPOSES)[number];

/**
 * The key of the navigation state with which registration hands over to `/verificar-email` after a
 * 201, so that screen says the account was just created. A flag, nothing of the account.
 */
export const REGISTERED_STATE_KEY = 'sinapseRegistered';

/** The password policy of the contract: `password` and `newPassword` are 12 to 256 characters. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

/**
 * What a refused registration means for the form, decided by the problem `type`, never the status.
 * The success, 201, is the caller's: the account is `PENDING_VERIFICATION` and the person goes to
 * `/verificar-email` — no session is opened by registering.
 */
export type RegistrationRefusal =
  /**
   * 400 `validation-failed`, declared for this route: the fields the server named. `terms` when it
   * named the acceptance list or one of its class-level rules (`essentialPurposesAccepted`,
   * `institutionSharingAbsent`); `formLevel` when it named anything else, or nothing.
   */
  | {
      readonly kind: 'invalid';
      readonly fields: ReadonlySet<RegistrationField>;
      readonly terms: boolean;
      readonly formLevel: boolean;
    }
  /**
   * 422 `minor-registration-not-supported`: below the configured consent age. The guardian branch
   * exists in the schema and its flow is not implemented (backend ADR 0004, "Consequência para a
   * v1"), so there is nothing to offer instead. The server writes nothing in this case.
   */
  | { readonly kind: 'under-age' }
  /**
   * 409 `conflict`: "Address already registered, or the accepted wording is no longer the one in
   * force" — one type for two causes (K-O). The page tells them apart with `conflictCauseOf`.
   */
  | { readonly kind: 'conflict' }
  /** 429: 5 per hour per address, and one bucket for every visitor behind an untrusted proxy. */
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

const FIELDS: readonly RegistrationField[] = ['email', 'password', 'dateOfBirth', 'timeZone'];

/** The names the server gives the acceptance list and its two class-level rules. */
function isTermsName(name: string): boolean {
  return (
    name === 'acceptedTerms' ||
    name.startsWith('acceptedTerms[') ||
    name.startsWith('acceptedTerms.') ||
    name === 'essentialPurposesAccepted' ||
    name === 'institutionSharingAbsent'
  );
}

/**
 * Reads the failure of `POST /api/v1/accounts`. The server's `errors[].message` is English text for
 * a developer and is never shown (D3); only `field` is read.
 */
export function registrationRefusalOf(failure: ApiFailure): RegistrationRefusal {
  if (isValidationFailed(failure)) {
    const named = (failure.problem.errors ?? []).map((error) => error.field);
    const fields = new Set(FIELDS.filter((field) => named.includes(field)));
    const terms = named.some(isTermsName);
    const formLevel =
      named.length === 0 ||
      named.some((name) => !(FIELDS as readonly string[]).includes(name) && !isTermsName(name));
    return { kind: 'invalid', fields, terms, formLevel };
  }
  if (isMinorRegistrationNotSupported(failure)) {
    return { kind: 'under-age' };
  }
  if (isConflict(failure)) {
    return { kind: 'conflict' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}

/**
 * Which of the two causes of a registration's 409 it was, decided by reading `GET /api/v1/terms`
 * again and comparing what is NOW in force with the ids that were submitted (decision G2).
 *
 * - `wording-changed`: a submitted id is no longer the one in force for its purpose. The person
 *   accepted a text that is no longer the terms; a stale acceptance is not consent, so the new text
 *   is shown for a fresh reading. `changed` lists those purposes.
 * - `address-unavailable`: every submitted id is still in force, so the wording did not cause it —
 *   the address did. The screen says the address cannot be used and offers sign-in and password
 *   reset; it does not assert that an account exists.
 *
 * A wording published between the two reads that the person did NOT accept (research declined)
 * changes nothing here: nothing stale was submitted for it.
 */
export type ConflictCause =
  | { readonly kind: 'wording-changed'; readonly changed: readonly RegistrationPurpose[] }
  | { readonly kind: 'address-unavailable' };

export function conflictCauseOf(
  submitted: ReadonlyMap<RegistrationPurpose, string>,
  current: ReadonlyMap<ConsentPurpose, Wording>,
): ConflictCause {
  const changed = REGISTRATION_PURPOSES.filter(
    (purpose) => submitted.has(purpose) && current.get(purpose)?.id !== submitted.get(purpose),
  );
  return changed.length > 0
    ? { kind: 'wording-changed', changed }
    : { kind: 'address-unavailable' };
}

/**
 * Whether `value` is a calendar date written as `yyyy-MM-dd` — the `format: date` of
 * `dateOfBirth`. Checked as text, never through a `Date` in the browser's zone: a local date must
 * reach the server exactly as the person typed it, in any zone. Nothing else is checked here — not
 * the age, which is the server's (configurable, and not in the contract).
 */
export function isLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= days;
}
