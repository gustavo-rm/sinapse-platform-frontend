import { ACCOUNT_STATUSES, type AccountStatus, type ConsentPurpose } from '../api/contract/enums';
import { type AccountState, readAccountState } from './account-state';
import {
  GATES,
  type Gate,
  type GuardTarget,
  accessTo,
  gateOf,
  holdsOnConsentScreen,
  pathOf,
} from './gate';

/**
 * The chain written out again, independently, as the table of the FE-4 prompt reads, with row 7
 * as FE-5 corrected it (K-H): it holds only on a purpose the student cannot decline without
 * consequence, which ADR 0004 makes `LEARNING_DATA_PROCESSING` alone. The first row whose condition
 * holds wins. The implementation is compared with this over every combination.
 */
function expectedGate(
  status: AccountStatus,
  reaffirm: boolean,
  pending: readonly ConsentPurpose[],
  setup: boolean | null,
): Gate | null {
  const consents = pending.includes('LEARNING_DATA_PROCESSING');
  const rows: [boolean, Gate | null][] = [
    [status === 'ANONYMIZED', 'anonymized'],
    [status === 'SUSPENDED', 'suspended'],
    [status === 'PENDING_VERIFICATION', 'verify-email'],
    [status === 'PENDING_GUARDIAN_CONSENT', 'guardian-consent'],
    [reaffirm, 'reaffirmation'],
    [consents, 'consent'],
    [setup === false, 'setup'],
  ];
  return rows.find(([holds]) => holds)?.[1] ?? null;
}

function stateOf(
  accountStatus: AccountStatus,
  requiresMajorityReaffirmation: boolean,
  pendingConsents: readonly ConsentPurpose[],
  setupComplete: boolean | null,
  timeZone: string,
): AccountState {
  return {
    accountStatus,
    requiresMajorityReaffirmation,
    pendingConsents,
    setupComplete,
    timeZone,
    activePlanId: null,
    activeGenerationJobId: null,
    openSessionId: null,
  } as AccountState;
}

const ZONES = ['America/Sao_Paulo', 'Not/A_Zone'];
const BOOLEANS = [false, true];
const ESSENTIAL: ConsentPurpose[] = ['LEARNING_DATA_PROCESSING'];
/**
 * The pending lists that matter: none; research alone — the account that declined it at
 * registration, observed in FE-4.1 (K-H); sharing alone, which the server never lists but a gate
 * must not hold on either; the essential purpose alone; and the essential with research.
 */
const PENDING: ConsentPurpose[][] = [
  [],
  ['ACADEMIC_RESEARCH'],
  ['INSTITUTION_SHARING'],
  ESSENTIAL,
  ['ACADEMIC_RESEARCH', 'LEARNING_DATA_PROCESSING'],
];

/**
 * Every combination of the five required members: 5 statuses × reaffirmation × 5 pending lists ×
 * setupComplete (true, false, and null where the status allows it) × two zones, one of them
 * unusable. 5 × 2 × 5 × 2 × 2 = 200 with booleans, plus 4 × 2 × 5 × 2 = 80 with setupComplete null.
 */
const COMBINATIONS = ACCOUNT_STATUSES.flatMap((status) =>
  BOOLEANS.flatMap((reaffirm) =>
    PENDING.flatMap((consents) =>
      [true, false, ...(status === 'ACTIVE' ? [] : [null])].flatMap((setup) =>
        ZONES.map((zone) => [status, reaffirm, consents, setup, zone] as const),
      ),
    ),
  ),
);

describe('the guard chain', () => {
  it('covers every combination', () => {
    expect(COMBINATIONS).toHaveLength(200 + 80);
  });

  it('lets an ACTIVE account that declined research into the application (K-H)', () => {
    // The body FE-4.1 observed for that account once set up, verbatim but for setupComplete.
    const reading = readAccountState({
      accountStatus: 'ACTIVE',
      timeZone: 'America/Sao_Paulo',
      pendingConsents: ['ACADEMIC_RESEARCH'],
      requiresMajorityReaffirmation: false,
      setupComplete: true,
    });
    expect(reading.ok).toBe(true);
    if (reading.ok) {
      expect(gateOf({ kind: 'state', state: reading.state })).toBeNull();
    }
  });

  it('sends that account to setup, not to the consent screen, before it is set up (K-H)', () => {
    // FE-4.1's first observed body, verbatim.
    const reading = readAccountState({
      accountStatus: 'ACTIVE',
      timeZone: 'America/Sao_Paulo',
      pendingConsents: ['ACADEMIC_RESEARCH'],
      requiresMajorityReaffirmation: false,
      setupComplete: false,
    });
    expect(reading.ok && gateOf({ kind: 'state', state: reading.state })).toBe('setup');
  });

  it('holds on the consent screen only for a purpose that cannot be declined freely', () => {
    expect(holdsOnConsentScreen('LEARNING_DATA_PROCESSING')).toBe(true);
    expect(holdsOnConsentScreen('ACADEMIC_RESEARCH')).toBe(false);
    expect(holdsOnConsentScreen('INSTITUTION_SHARING')).toBe(false);
  });

  it.each(COMBINATIONS)(
    'status %s, reaffirm %s, pending consents %s, setup %s, zone %s',
    (status, reaffirm, consents, setup, zone) => {
      const gate = gateOf({
        kind: 'state',
        state: stateOf(status, reaffirm, consents, setup, zone),
      });
      expect(gate).toBe(expectedGate(status, reaffirm, consents, setup));
    },
  );

  it('sends a 401 to sign in, before anything else', () => {
    expect(gateOf({ kind: 'unauthenticated' })).toBe('sign-in');
  });

  it('never gates on a plan generation under way', () => {
    const state = { ...stateOf('ACTIVE', false, [], true, 'UTC'), activeGenerationJobId: 'job' };
    expect(gateOf({ kind: 'state', state })).toBeNull();
  });

  it('never gates on an open study session or the absence of a plan', () => {
    const state = {
      ...stateOf('ACTIVE', false, [], true, 'UTC'),
      openSessionId: 's',
      activePlanId: null,
    };
    expect(gateOf({ kind: 'state', state })).toBeNull();
  });

  it('checks each adjacent pair of rows in its order (the first one wins)', () => {
    // The inversions a reordering would produce, spelled out so a failure names the pair.
    const cases: [AccountState, Gate][] = [
      [stateOf('ANONYMIZED', true, ESSENTIAL, false, 'UTC'), 'anonymized'],
      [stateOf('SUSPENDED', true, ESSENTIAL, false, 'UTC'), 'suspended'],
      [stateOf('PENDING_VERIFICATION', true, ESSENTIAL, false, 'UTC'), 'verify-email'],
      [stateOf('PENDING_GUARDIAN_CONSENT', true, ESSENTIAL, false, 'UTC'), 'guardian-consent'],
      [stateOf('ACTIVE', true, ESSENTIAL, false, 'UTC'), 'reaffirmation'],
      [stateOf('ACTIVE', false, ESSENTIAL, false, 'UTC'), 'consent'],
      [stateOf('ACTIVE', false, [], false, 'UTC'), 'setup'],
    ];
    for (const [state, gate] of cases) {
      expect(gateOf({ kind: 'state', state })).toBe(gate);
    }
  });
});

describe('the reaffirmation asks and does not hold (ADR 0004)', () => {
  const owed = stateOf('ACTIVE', true, [], true, 'UTC');

  it('sends a person who owes it to the reaffirmation screen', () => {
    expect(gateOf({ kind: 'state', state: owed })).toBe('reaffirmation');
  });

  it('lets them into the application once they deferred it, for this session', () => {
    expect(gateOf({ kind: 'state', state: owed }, { reaffirmationDeferred: true })).toBeNull();
    expect(accessTo({ kind: 'state', state: owed }, 'app', { reaffirmationDeferred: true })).toBe(
      true,
    );
  });

  it('still lets them back to its screen while it is owed, and no one else', () => {
    const deferred = { reaffirmationDeferred: true };
    expect(accessTo({ kind: 'state', state: owed }, 'reaffirmation', deferred)).toBe(true);
    const free = stateOf('ACTIVE', false, [], true, 'UTC');
    expect(accessTo({ kind: 'state', state: free }, 'reaffirmation', deferred)).toBe('app');
  });

  it('does not let a deferral skip the rows after it', () => {
    const state = stateOf('ACTIVE', true, ESSENTIAL, false, 'UTC');
    expect(gateOf({ kind: 'state', state }, { reaffirmationDeferred: true })).toBe('consent');
  });

  it('never lets a deferral open the application to a suspended account', () => {
    const state = stateOf('SUSPENDED', true, [], null, 'UTC');
    expect(gateOf({ kind: 'state', state }, { reaffirmationDeferred: true })).toBe('suspended');
  });
});

describe('accessTo', () => {
  const free: AccountState = stateOf('ACTIVE', false, [], true, 'UTC');
  const setup: AccountState = stateOf('ACTIVE', false, [], false, 'UTC');

  it('lets a person with nothing in the way into the application', () => {
    expect(accessTo({ kind: 'state', state: free }, 'app')).toBe(true);
  });

  it('sends them out of a gate screen that is not theirs, into the application', () => {
    expect(accessTo({ kind: 'state', state: free }, 'setup')).toBe('app');
  });

  it('opens a gate screen to the person the chain sends there, and no one else', () => {
    expect(accessTo({ kind: 'state', state: setup }, 'setup')).toBe(true);
    expect(accessTo({ kind: 'state', state: setup }, 'app')).toBe('setup');
    expect(accessTo({ kind: 'state', state: setup }, 'consent')).toBe('setup');
  });

  it('sends a signed-out person to sign in from anywhere', () => {
    const targets: GuardTarget[] = [
      'app',
      ...GATES.filter(
        (g): g is Exclude<Gate, 'sign-in' | 'verify-email'> =>
          g !== 'sign-in' && g !== 'verify-email',
      ),
    ];
    for (const target of targets) {
      expect(accessTo({ kind: 'unauthenticated' }, target)).toBe('sign-in');
    }
  });
});

describe('pathOf', () => {
  it('gives each gate its own in-app path, none under /api', () => {
    const paths = GATES.map(pathOf);
    expect(new Set(paths).size).toBe(GATES.length);
    for (const path of paths) {
      expect(path).toMatch(/^\/[a-z-]+$/);
    }
    expect(pathOf('sign-in')).toBe('/entrar');
  });
});
