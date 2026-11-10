import { ACCOUNT_STATUSES, type AccountStatus } from '../api/contract/enums';
import type { AccountState } from './account-state';
import { GATES, type Gate, type GuardTarget, accessTo, gateOf, pathOf } from './gate';

/**
 * The chain written out again, independently, as the table of the FE-4 prompt reads: the first
 * row whose condition holds wins. The implementation is compared with this over every combination.
 */
function expectedGate(
  status: AccountStatus,
  reaffirm: boolean,
  consents: boolean,
  setup: boolean | null,
): Gate | null {
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
  hasPendingConsents: boolean,
  setupComplete: boolean | null,
  timeZone: string,
): AccountState {
  return {
    accountStatus,
    requiresMajorityReaffirmation,
    pendingConsents: hasPendingConsents ? ['INSTITUTION_SHARING'] : [],
    setupComplete,
    timeZone,
    activePlanId: null,
    activeGenerationJobId: null,
    openSessionId: null,
  } as AccountState;
}

const ZONES = ['America/Sao_Paulo', 'Not/A_Zone'];
const BOOLEANS = [false, true];

/**
 * Every combination of the five required members: 5 statuses × reaffirmation × consents ×
 * setupComplete (true, false, and null where the status allows it) × two zones, one of them
 * unusable. 5 × 2 × 2 × 2 × 2 = 80 with booleans, plus 4 × 2 × 2 × 2 = 32 with setupComplete null.
 */
const COMBINATIONS = ACCOUNT_STATUSES.flatMap((status) =>
  BOOLEANS.flatMap((reaffirm) =>
    BOOLEANS.flatMap((consents) =>
      [true, false, ...(status === 'ACTIVE' ? [] : [null])].flatMap((setup) =>
        ZONES.map((zone) => [status, reaffirm, consents, setup, zone] as const),
      ),
    ),
  ),
);

describe('the guard chain', () => {
  it('covers every combination', () => {
    expect(COMBINATIONS).toHaveLength(80 + 32);
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
    const state = { ...stateOf('ACTIVE', false, false, true, 'UTC'), activeGenerationJobId: 'job' };
    expect(gateOf({ kind: 'state', state })).toBeNull();
  });

  it('never gates on an open study session or the absence of a plan', () => {
    const state = {
      ...stateOf('ACTIVE', false, false, true, 'UTC'),
      openSessionId: 's',
      activePlanId: null,
    };
    expect(gateOf({ kind: 'state', state })).toBeNull();
  });

  it('checks each adjacent pair of rows in its order (the first one wins)', () => {
    // The inversions a reordering would produce, spelled out so a failure names the pair.
    const cases: [AccountState, Gate][] = [
      [stateOf('ANONYMIZED', true, true, false, 'UTC'), 'anonymized'],
      [stateOf('SUSPENDED', true, true, false, 'UTC'), 'suspended'],
      [stateOf('PENDING_VERIFICATION', true, true, false, 'UTC'), 'verify-email'],
      [stateOf('PENDING_GUARDIAN_CONSENT', true, true, false, 'UTC'), 'guardian-consent'],
      [stateOf('ACTIVE', true, true, false, 'UTC'), 'reaffirmation'],
      [stateOf('ACTIVE', false, true, false, 'UTC'), 'consent'],
      [stateOf('ACTIVE', false, false, false, 'UTC'), 'setup'],
    ];
    for (const [state, gate] of cases) {
      expect(gateOf({ kind: 'state', state })).toBe(gate);
    }
  });
});

describe('accessTo', () => {
  const free: AccountState = stateOf('ACTIVE', false, false, true, 'UTC');
  const setup: AccountState = stateOf('ACTIVE', false, false, false, 'UTC');

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
      ...GATES.filter((g): g is Exclude<Gate, 'sign-in'> => g !== 'sign-in'),
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
