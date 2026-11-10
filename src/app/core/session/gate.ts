import type { ConsentPurpose } from '../api/contract/enums';
import type { AccountState } from './account-state';

/**
 * A place the guard chain can send a person instead of the screen they asked for. Each is a
 * screen of this client; none is a backend route.
 */
export type Gate =
  | 'sign-in'
  | 'anonymized'
  | 'suspended'
  | 'verify-email'
  | 'guardian-consent'
  | 'reaffirmation'
  | 'consent'
  | 'setup';

/** Every gate, in the order of the chain. */
export const GATES: readonly Gate[] = [
  'sign-in',
  'anonymized',
  'suspended',
  'verify-email',
  'guardian-consent',
  'reaffirmation',
  'consent',
  'setup',
];

/** What the bootstrap answered, as the chain reads it. */
export type Bootstrap =
  { readonly kind: 'unauthenticated' } | { readonly kind: 'state'; readonly state: AccountState };

/**
 * What this client knows beyond the bootstrap, held in memory for one session by `SessionStore`.
 *
 * `reaffirmationDeferred`: the person chose, on the reaffirmation screen, to keep using the account
 * for now. ADR 0004 of the backend: at the transition to majority the account is NOT blocked — the
 * holder is asked, and has a grace period — so row 6 asks and does not hold. FE-5.
 */
export interface ChainContext {
  readonly reaffirmationDeferred?: boolean;
}

/**
 * The precedence chain: where a person must be, or null when nothing stands in the way of the
 * screen they asked for. A pure function of the bootstrap, so it is tested without a router.
 *
 * | # | condition                                          | gate               |
 * |---|----------------------------------------------------|--------------------|
 * | 1 | the bootstrap answered 401                         | `sign-in`          |
 * | 2 | `accountStatus = ANONYMIZED`                       | `anonymized`       |
 * | 3 | `accountStatus = SUSPENDED`                        | `suspended`        |
 * | 4 | `accountStatus = PENDING_VERIFICATION`             | `verify-email`     |
 * | 5 | `accountStatus = PENDING_GUARDIAN_CONSENT`         | `guardian-consent` |
 * | 6 | `requiresMajorityReaffirmation`, not deferred      | `reaffirmation`    |
 * | 7 | `pendingConsents` holds a purpose that cannot be declined freely (`holdsOnConsentScreen`) | `consent` |
 * | 8 | `setupComplete` false                              | `setup`            |
 * | 9 | none of the above                                  | null               |
 *
 * Rows 2–5 cover every status but ACTIVE, so rows 6–8 are read only for an ACTIVE account, for
 * which `readAccountState` guarantees `setupComplete` is a boolean. `activeGenerationJobId` is not
 * a gate: a plan being made is a state of the plan screen, never a block on navigation.
 *
 * UNREACHABLE TODAY, kept on purpose (FE-5). Each status exists in the contract and
 * `readAccountState` rejects an unknown one, so removing a row would turn a future server state
 * into an unreadable body instead of a screen:
 *
 * - row 2: MEASURED in FE-4.1 — the erasure sweep removes every session and anonymises the row, so
 *   no session can exist to read the status with;
 * - row 4: MEASURED in FE-4.1 — `POST /api/v1/sessions` refuses an account that is not ACTIVE or
 *   SUSPENDED, so `/me/state` never answers PENDING_VERIFICATION. Its screen is the public route
 *   `/verificar-email`, which needs no session; the row stays;
 * - row 5: MEASURED in FE-4.1 — registration refuses a holder below the consent age (K-E);
 * - row 6: READ in FE-5, not measured — the flag is true only for a holder whose essential consent
 *   predates their majority, and registration refuses anyone below the consent age (K-E), so every
 *   consent is the adult holder's own from the start;
 * - row 7: READ in FE-5, not measured — the backend lists only purposes "never acted on" and
 *   "requested on [their] own", and registration must accept `LEARNING_DATA_PROCESSING`, so the one
 *   purpose that holds here is never pending after registration.
 */
export function gateOf(bootstrap: Bootstrap, context: ChainContext = {}): Gate | null {
  if (bootstrap.kind === 'unauthenticated') {
    return 'sign-in';
  }
  const state = bootstrap.state;
  switch (state.accountStatus) {
    case 'ANONYMIZED':
      return 'anonymized';
    case 'SUSPENDED':
      return 'suspended';
    case 'PENDING_VERIFICATION':
      return 'verify-email';
    case 'PENDING_GUARDIAN_CONSENT':
      return 'guardian-consent';
    case 'ACTIVE':
      if (state.requiresMajorityReaffirmation && context.reaffirmationDeferred !== true) {
        return 'reaffirmation';
      }
      if (state.pendingConsents.some(holdsOnConsentScreen)) {
        return 'consent';
      }
      return state.setupComplete ? null : 'setup';
    default:
      return unreachable(state);
  }
}

/**
 * Whether a pending purpose holds an ACTIVE account on the consent screen (row 7). Only a purpose
 * the student cannot decline without consequence may: a gate on any other makes the refusal cost
 * the whole product.
 *
 * Decision K-H of FE-5. ADR 0004 of the backend: `LEARNING_DATA_PROCESSING` is essential,
 * `INSTITUTION_SHARING` conditional — consented only when an invite is redeemed (closed decision
 * F1) — and `ACADEMIC_RESEARCH` optional, "refusable without any prejudice to the service", because
 * if the product degrades on refusal the consent is not free and the data is not publishable. The
 * server lists research as pending for an account that declined it at registration (observed,
 * FE-4.1) and no operation records a refusal, so gating on it would hold that student for good.
 * Research is still offered on the consent screen; it is never required there.
 */
export function holdsOnConsentScreen(purpose: ConsentPurpose): boolean {
  switch (purpose) {
    case 'LEARNING_DATA_PROCESSING':
      return true;
    case 'INSTITUTION_SHARING':
    case 'ACADEMIC_RESEARCH':
      return false;
    default:
      return unreachable(purpose);
  }
}

/**
 * The screens a guard protects: the application proper, or one gate screen. `verify-email` is not
 * one: its screen is a public route (FE-5), reached by a link with a token and no session.
 */
export type GuardTarget = 'app' | Exclude<Gate, 'sign-in' | 'verify-email'>;

/**
 * What a guard does for a person who asked for `target`: let them through (`true`), or send them
 * to where the chain says they must be. A gate screen is open only to the person the chain sends
 * there; anyone else is sent on — to their own gate, or into the application. One exception: a
 * person who deferred the reaffirmation may go back to its screen while it is still owed.
 */
export function accessTo(
  bootstrap: Bootstrap,
  target: GuardTarget,
  context: ChainContext = {},
): true | Gate | 'app' {
  const gate = gateOf(bootstrap, context);
  if (
    target === 'reaffirmation' &&
    gate === null &&
    bootstrap.kind === 'state' &&
    bootstrap.state.accountStatus === 'ACTIVE' &&
    bootstrap.state.requiresMajorityReaffirmation
  ) {
    return true;
  }
  if (gate === null) {
    return target === 'app' ? true : 'app';
  }
  return gate === target ? true : gate;
}

/** The in-app path of each gate, and where the application opens. */
export const SIGN_IN_PATH = '/entrar';
export const APP_HOME_PATH = '/hoje';
/** The screen shown when the bootstrap itself failed, so no gate can be decided. */
export const SESSION_UNAVAILABLE_PATH = '/indisponivel';

export function pathOf(gate: Gate): string {
  switch (gate) {
    case 'sign-in':
      return SIGN_IN_PATH;
    case 'anonymized':
      return '/conta-encerrada';
    case 'suspended':
      return '/conta-suspensa';
    case 'verify-email':
      return '/verificar-email';
    case 'guardian-consent':
      return '/consentimento-do-responsavel';
    case 'reaffirmation':
      return '/reafirmar-consentimento';
    case 'consent':
      return '/consentimentos';
    case 'setup':
      return '/configurar';
    default:
      return unreachable(gate);
  }
}

function unreachable(value: never): never {
  throw new RangeError(`Unhandled case: ${JSON.stringify(value)}`);
}
