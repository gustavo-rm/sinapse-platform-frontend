import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  CONSENT_PURPOSES,
  type ConsentPurpose,
} from '../api/contract/enums';
import type { StudentStateView } from '../api/contract/models';

/** What every account state carries, whatever its status. */
interface AccountStateBase {
  /** The account's IANA zone, as the server reports it. Validated before use by `AccountTimeService`. */
  readonly timeZone: string;
  /** The consent purposes the account still has to answer. Empty when there are none. */
  readonly pendingConsents: readonly ConsentPurpose[];
  /** The holder reached the consent age and must reaffirm what a guardian consented to. */
  readonly requiresMajorityReaffirmation: boolean;
  /** The plan in force, or null when there is none. */
  readonly activePlanId: string | null;
  /** The plan generation under way, or null. Never a gate: the plan screen shows it. */
  readonly activeGenerationJobId: string | null;
  /** The study session running now, or null. */
  readonly openSessionId: string | null;
}

/**
 * The bootstrap state of `GET /api/v1/me/state`, as this client relies on it.
 *
 * For an ACTIVE account every member the guard chain reads is present. For any other status,
 * `setupComplete` may be null: the snapshot's own description of the route says that for "a holder
 * whose learning data may not be processed … the readiness flag come[s] back empty", and every
 * status but ACTIVE is decided by the guard chain before `setupComplete` is read. Null there is
 * "not reported", never a default.
 */
export type AccountState =
  | (AccountStateBase & { readonly accountStatus: 'ACTIVE'; readonly setupComplete: boolean })
  | (AccountStateBase & {
      readonly accountStatus: Exclude<AccountStatus, 'ACTIVE'>;
      readonly setupComplete: boolean | null;
    });

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
 * Required: `accountStatus`, `requiresMajorityReaffirmation`, `timeZone`, `pendingConsents`, and
 * `setupComplete` when the account is ACTIVE (see `AccountState` for why not otherwise). A value
 * outside the contract — an unknown status, an unknown consent purpose, a wrong type — is
 * unreadable too: guessing what a new value means is the same error as defaulting.
 *
 * Optional: `activePlanId`, `activeGenerationJobId` and `openSessionId` each name something that
 * may not exist. Absent and `null` are both accepted and both mean "none": whether the server
 * omits the member or sends `null` has not been verified against the backend (the snapshot cannot
 * say, and the route's description only says they "come back empty"), so both are read the same.
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
  if (typeof view.requiresMajorityReaffirmation !== 'boolean') {
    return unreadable('requiresMajorityReaffirmation');
  }
  if (typeof view.timeZone !== 'string' || view.timeZone === '') {
    return unreadable('timeZone');
  }
  const pendingConsents = view.pendingConsents;
  if (
    !Array.isArray(pendingConsents) ||
    !pendingConsents.every((p) => isOneOf(p, CONSENT_PURPOSES))
  ) {
    return unreadable('pendingConsents');
  }

  const setupComplete = view.setupComplete;
  const setupReported = typeof setupComplete === 'boolean';
  const setupEmpty = setupComplete === undefined || setupComplete === null;
  if (!setupReported && !(setupEmpty && accountStatus !== 'ACTIVE')) {
    return unreadable('setupComplete');
  }

  const activePlanId = optionalId(view.activePlanId);
  const activeGenerationJobId = optionalId(view.activeGenerationJobId);
  const openSessionId = optionalId(view.openSessionId);
  if (activePlanId === INVALID) return unreadable('activePlanId');
  if (activeGenerationJobId === INVALID) return unreadable('activeGenerationJobId');
  if (openSessionId === INVALID) return unreadable('openSessionId');

  const base: AccountStateBase = {
    timeZone: view.timeZone,
    pendingConsents: [...pendingConsents],
    requiresMajorityReaffirmation: view.requiresMajorityReaffirmation,
    activePlanId,
    activeGenerationJobId,
    openSessionId,
  };
  const state: AccountState =
    accountStatus === 'ACTIVE'
      ? { ...base, accountStatus, setupComplete: setupComplete as boolean }
      : {
          ...base,
          accountStatus,
          setupComplete: setupReported ? (setupComplete as boolean) : null,
        };
  return { ok: true, state };
}

const INVALID = Symbol('invalid');

/** An identifier that may name nothing: absent and null both mean "none". */
function optionalId(value: unknown): string | null | typeof INVALID {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === 'string' && value !== '' ? value : INVALID;
}

function unreadable(member: UnreadableMember): AccountStateReading {
  return { ok: false, member };
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
