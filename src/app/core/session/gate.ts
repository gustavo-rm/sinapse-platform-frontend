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
 * The precedence chain: where a person must be, or null when nothing stands in the way of the
 * screen they asked for. A pure function of the bootstrap, so it is tested without a router.
 *
 * | # | condition                              | gate               |
 * |---|----------------------------------------|--------------------|
 * | 1 | the bootstrap answered 401             | `sign-in`          |
 * | 2 | `accountStatus = ANONYMIZED`           | `anonymized`       |
 * | 3 | `accountStatus = SUSPENDED`            | `suspended`        |
 * | 4 | `accountStatus = PENDING_VERIFICATION` | `verify-email`     |
 * | 5 | `accountStatus = PENDING_GUARDIAN_CONSENT` | `guardian-consent` |
 * | 6 | `requiresMajorityReaffirmation`        | `reaffirmation`    |
 * | 7 | `pendingConsents` not empty            | `consent`          |
 * | 8 | `setupComplete` false                  | `setup`            |
 * | 9 | none of the above                      | null               |
 *
 * Rows 2–5 cover every status but ACTIVE, so rows 6–8 are read only for an ACTIVE account, for
 * which `readAccountState` guarantees `setupComplete` is a boolean. `activeGenerationJobId` is not
 * a gate: a plan being made is a state of the plan screen, never a block on navigation.
 */
export function gateOf(bootstrap: Bootstrap): Gate | null {
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
      if (state.requiresMajorityReaffirmation) {
        return 'reaffirmation';
      }
      if (state.pendingConsents.length > 0) {
        return 'consent';
      }
      return state.setupComplete ? null : 'setup';
    default:
      return unreachable(state);
  }
}

/** The screens a guard protects: the application proper, or one gate screen. */
export type GuardTarget = 'app' | Exclude<Gate, 'sign-in'>;

/**
 * What a guard does for a person who asked for `target`: let them through (`true`), or send them
 * to where the chain says they must be. A gate screen is open only to the person the chain sends
 * there; anyone else is sent on — to their own gate, or into the application.
 */
export function accessTo(bootstrap: Bootstrap, target: GuardTarget): true | Gate | 'app' {
  const gate = gateOf(bootstrap);
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
