import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  CONSENT_PURPOSES,
  type ConsentPurpose,
} from '../api/contract/enums';
import type { StudentStateView } from '../api/contract/models';

/** The identifiers every state may carry. Each names something that may not exist: null is none. */
interface Identifiers {
  /** The plan in force, or null when there is none. */
  readonly activePlanId: string | null;
  /** The plan generation under way, or null. Never a gate: the plan screen shows it. */
  readonly activeGenerationJobId: string | null;
  /** The study session running now, or null. */
  readonly openSessionId: string | null;
}

/** An ACTIVE account: every member the guard chain reads, and the zone every date needs. */
export interface ActiveAccountState extends Identifiers {
  readonly accountStatus: 'ACTIVE';
  /** The account's IANA zone, as the server reports it. Validated before use by `AccountTimeService`. */
  readonly timeZone: string;
  /** The consent purposes the account still has to answer. Empty when there are none. */
  readonly pendingConsents: readonly ConsentPurpose[];
  /** The holder reached the consent age and must reaffirm what a guardian consented to. */
  readonly requiresMajorityReaffirmation: boolean;
  readonly setupComplete: boolean;
}

/**
 * Any other status. The guard chain decides each of them by `accountStatus` alone (rows 2–5 of
 * `gate.ts`), and no screen it leads to shows a date or a consent list, so the four members below
 * are read when the server sends them and are null — "not reported", never a default — when it
 * does not.
 *
 * - `setupComplete`: the route's own description says the readiness flag "come[s] back empty" for
 *   a holder whose learning data may not be processed (FE-4).
 * - `timeZone`, `pendingConsents`, `requiresMajorityReaffirmation`: insurance (FE-4.1). Observed
 *   for SUSPENDED on `sinapse-platform@46b5b3c`: all four present (`setupComplete: false`). NOT
 *   observable for ANONYMIZED, PENDING_VERIFICATION or PENDING_GUARDIAN_CONSENT, because no
 *   session can be opened for them (`docs/ai/STATE.md`, FE-4.1); allowed empty so that, should one
 *   ever reach this client without them, the person sees their status screen and not an error.
 */
export interface OtherAccountState extends Identifiers {
  readonly accountStatus: Exclude<AccountStatus, 'ACTIVE'>;
  readonly timeZone: string | null;
  readonly pendingConsents: readonly ConsentPurpose[] | null;
  readonly requiresMajorityReaffirmation: boolean | null;
  readonly setupComplete: boolean | null;
}

/** The bootstrap state of `GET /api/v1/me/state`, as this client relies on it. */
export type AccountState = ActiveAccountState | OtherAccountState;

/** The member of the body that made it unreadable, or `body` when it is not an object at all. */
export type UnreadableMember = keyof StudentStateView | 'body';

/** The outcome of reading a bootstrap body. */
export type AccountStateReading =
  | { readonly ok: true; readonly state: AccountState }
  | { readonly ok: false; readonly member: UnreadableMember };

/**
 * Reads the body of `GET /api/v1/me/state` (decision D1 of FE-4, `docs/ai/STATE.md`).
 *
 * The generated `StudentStateView` marks every member optional, because the backend declares no
 * `required` on any response schema (K-A). That is a gap in how the contract is published, not a
 * statement that the server omits them, and this route decides where a person may go: so a missing
 * member is a FAILURE here, never a default. Defaulting `setupComplete` sends a configured student
 * back to setup or an unconfigured one to an empty screen; defaulting `accountStatus` admits or
 * suspends an account; defaulting `timeZone` to UTC moves a night session in `America/Sao_Paulo`
 * to the next day and corrupts adherence and the timing of the recall ratings.
 *
 * Required always: `accountStatus`. Required for an ACTIVE account: `timeZone`, `pendingConsents`,
 * `requiresMajorityReaffirmation`, `setupComplete`; for any other status they may be empty (absent
 * or null), see `OtherAccountState`. A value that IS present must be in the contract for every
 * status — an unknown status, an unknown consent purpose, a wrong type is unreadable: guessing what
 * a new value means is the same error as defaulting.
 *
 * Optional: `activePlanId`, `activeGenerationJobId` and `openSessionId`. Absent and `null` are both
 * accepted and both mean "none". Observed on `sinapse-platform@46b5b3c` (FE-4.1): the server OMITS
 * them when there is none; `null` stays accepted, at no cost.
 *
 * Nothing here logs: the caller learns only which member failed, never a value.
 */
export function readAccountState(body: unknown): AccountStateReading {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return unreadable('body');
  }
  const view = body as Record<keyof StudentStateView, unknown>;

  const accountStatus = view.accountStatus;
  if (!isOneOf(accountStatus, ACCOUNT_STATUSES)) {
    return unreadable('accountStatus');
  }
  const active = accountStatus === 'ACTIVE';

  const requiresMajorityReaffirmation = member(
    view.requiresMajorityReaffirmation,
    isBoolean,
    active,
  );
  if (requiresMajorityReaffirmation === INVALID) return unreadable('requiresMajorityReaffirmation');
  const timeZone = member(view.timeZone, isZoneName, active);
  if (timeZone === INVALID) return unreadable('timeZone');
  const pendingConsents = member(view.pendingConsents, isConsentList, active);
  if (pendingConsents === INVALID) return unreadable('pendingConsents');
  const setupComplete = member(view.setupComplete, isBoolean, active);
  if (setupComplete === INVALID) return unreadable('setupComplete');

  const activePlanId = optionalId(view.activePlanId);
  if (activePlanId === INVALID) return unreadable('activePlanId');
  const activeGenerationJobId = optionalId(view.activeGenerationJobId);
  if (activeGenerationJobId === INVALID) return unreadable('activeGenerationJobId');
  const openSessionId = optionalId(view.openSessionId);
  if (openSessionId === INVALID) return unreadable('openSessionId');

  const ids: Identifiers = { activePlanId, activeGenerationJobId, openSessionId };
  const consents = pendingConsents === null ? null : [...pendingConsents];
  if (active) {
    // `member(…, true)` never returns null: each of these was checked present above.
    return {
      ok: true,
      state: {
        ...ids,
        accountStatus,
        timeZone: timeZone as string,
        pendingConsents: consents as ConsentPurpose[],
        requiresMajorityReaffirmation: requiresMajorityReaffirmation as boolean,
        setupComplete: setupComplete as boolean,
      },
    };
  }
  return {
    ok: true,
    state: {
      ...ids,
      accountStatus,
      timeZone,
      pendingConsents: consents,
      requiresMajorityReaffirmation,
      setupComplete,
    },
  };
}

const INVALID = Symbol('invalid');

/**
 * A member that must be present when `required`, and may otherwise be empty (absent or null →
 * null). Present, it must pass `valid` either way.
 */
function member<T>(
  value: unknown,
  valid: (value: unknown) => value is T,
  required: boolean,
): T | null | typeof INVALID {
  if (value === undefined || value === null) {
    return required ? INVALID : null;
  }
  return valid(value) ? value : INVALID;
}

/** An identifier that may name nothing: absent and null both mean "none". */
function optionalId(value: unknown): string | null | typeof INVALID {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === 'string' && value !== '' ? value : INVALID;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isZoneName(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isConsentList(value: unknown): value is ConsentPurpose[] {
  return Array.isArray(value) && value.every((item) => isOneOf(item, CONSENT_PURPOSES));
}

function unreadable(member: UnreadableMember): AccountStateReading {
  return { ok: false, member };
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
