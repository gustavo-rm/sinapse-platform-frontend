import { fixture } from '../../../testing/msw/fixtures';
import { ACCOUNT_STATUSES } from '../api/contract/enums';
import type { StudentStateView } from '../api/contract/models';
import { readAccountState } from './account-state';

/** A complete bootstrap body: the snapshot-generated one, with every member filled. */
function complete(overrides: Partial<Record<keyof StudentStateView, unknown>> = {}): unknown {
  return {
    ...fixture('StudentStateView'),
    accountStatus: 'ACTIVE',
    setupComplete: true,
    requiresMajorityReaffirmation: false,
    timeZone: 'America/Sao_Paulo',
    pendingConsents: [],
    ...overrides,
  };
}

function without(member: keyof StudentStateView, body = complete()): unknown {
  const copy = { ...(body as Record<string, unknown>) };
  delete copy[member];
  return copy;
}

const REQUIRED = [
  'accountStatus',
  'setupComplete',
  'requiresMajorityReaffirmation',
  'timeZone',
  'pendingConsents',
] as const;

const IDENTIFIERS = ['activePlanId', 'activeGenerationJobId', 'openSessionId'] as const;

describe('readAccountState', () => {
  it('reads a complete payload, member for member', () => {
    const body = complete({ pendingConsents: ['ACADEMIC_RESEARCH'] }) as StudentStateView;
    const reading = readAccountState(body);

    expect(reading).toEqual({
      ok: true,
      state: {
        accountStatus: 'ACTIVE',
        setupComplete: true,
        requiresMajorityReaffirmation: false,
        timeZone: 'America/Sao_Paulo',
        pendingConsents: ['ACADEMIC_RESEARCH'],
        activePlanId: body.activePlanId,
        activeGenerationJobId: body.activeGenerationJobId,
        openSessionId: body.openSessionId,
      },
    });
  });

  it('reads the body MSW generates from the snapshot', () => {
    // Every member filled from the schema: the generated body is the contract's own example.
    expect(readAccountState(fixture('StudentStateView')).ok).toBe(true);
  });

  describe('fails, never defaults, when a required member is absent', () => {
    it.each(REQUIRED)('%s absent → unreadable', (member) => {
      expect(readAccountState(without(member))).toEqual({ ok: false, member });
    });

    it.each(REQUIRED)('%s null → unreadable', (member) => {
      expect(readAccountState(complete({ [member]: null }))).toEqual({ ok: false, member });
    });
  });

  describe('fails on a value outside the contract', () => {
    it.each([
      ['accountStatus', 'BANNED'],
      ['accountStatus', 'active'],
      ['setupComplete', 'true'],
      ['requiresMajorityReaffirmation', 0],
      ['timeZone', ''],
      ['timeZone', 42],
      ['pendingConsents', 'LEARNING_DATA_PROCESSING'],
      ['pendingConsents', ['MARKETING']],
      ['activePlanId', 7],
      ['activePlanId', ''],
      ['openSessionId', {}],
    ] as const)('%s = %j → unreadable', (member, value) => {
      expect(readAccountState(complete({ [member]: value }))).toEqual({ ok: false, member });
    });

    it.each([null, undefined, 'state', 3, []])(
      'a body that is not an object (%j) → unreadable',
      (body) => {
        expect(readAccountState(body)).toEqual({ ok: false, member: 'body' });
      },
    );
  });

  describe('accepts absent and null for the three identifiers, both meaning none', () => {
    it.each(IDENTIFIERS)('%s null → null', (member) => {
      const reading = readAccountState(complete({ [member]: null }));
      expect(reading.ok && reading.state[member]).toBeNull();
    });

    it.each(IDENTIFIERS)('%s absent → null', (member) => {
      const reading = readAccountState(without(member));
      expect(reading.ok && reading.state[member]).toBeNull();
    });

    it('all three absent at once', () => {
      const body = IDENTIFIERS.reduce<unknown>(
        (current, member) => without(member, current),
        complete(),
      );
      const reading = readAccountState(body);
      expect(reading.ok).toBe(true);
      expect(
        reading.ok && [
          reading.state.activePlanId,
          reading.state.activeGenerationJobId,
          reading.state.openSessionId,
        ],
      ).toEqual([null, null, null]);
    });
  });

  describe('setupComplete outside ACTIVE (the route says the readiness flag may come back empty)', () => {
    const others = ACCOUNT_STATUSES.filter((status) => status !== 'ACTIVE');

    it.each(others)('%s with setupComplete absent → read, setupComplete null', (accountStatus) => {
      const reading = readAccountState(without('setupComplete', complete({ accountStatus })));
      expect(reading).toEqual(expect.objectContaining({ ok: true }));
      expect(reading.ok && reading.state.setupComplete).toBeNull();
    });

    it.each(others)('%s with setupComplete null → read, setupComplete null', (accountStatus) => {
      const reading = readAccountState(complete({ accountStatus, setupComplete: null }));
      expect(reading.ok && reading.state.setupComplete).toBeNull();
    });

    it.each(others)('%s with setupComplete reported → kept as reported', (accountStatus) => {
      const reading = readAccountState(complete({ accountStatus, setupComplete: false }));
      expect(reading.ok && reading.state.setupComplete).toBe(false);
    });

    it.each(others)(
      '%s may come without timeZone, pendingConsents or the reaffirmation flag',
      (accountStatus) => {
        const reading = readAccountState({ accountStatus });
        expect(reading).toEqual({
          ok: true,
          state: {
            accountStatus,
            timeZone: null,
            pendingConsents: null,
            requiresMajorityReaffirmation: null,
            setupComplete: null,
            activePlanId: null,
            activeGenerationJobId: null,
            openSessionId: null,
          },
        });
      },
    );

    it.each(others)(
      '%s still fails on a member that is present but out of contract',
      (accountStatus) => {
        for (const [member, value] of [
          ['timeZone', 7],
          ['pendingConsents', ['MARKETING']],
          ['requiresMajorityReaffirmation', 'no'],
          ['setupComplete', 0],
        ] as const) {
          expect(readAccountState({ accountStatus, [member]: value })).toEqual({
            ok: false,
            member,
          });
        }
      },
    );
  });

  describe('the bodies observed on sinapse-platform@46b5b3c (FE-4.1), verbatim', () => {
    it('reads an ACTIVE body, which omits the three identifiers when there is none', () => {
      const reading = readAccountState({
        accountStatus: 'ACTIVE',
        timeZone: 'America/Sao_Paulo',
        pendingConsents: ['ACADEMIC_RESEARCH'],
        requiresMajorityReaffirmation: false,
        setupComplete: false,
      });
      expect(reading.ok && reading.state).toEqual(
        expect.objectContaining({ activePlanId: null, pendingConsents: ['ACADEMIC_RESEARCH'] }),
      );
    });

    it('reads a SUSPENDED body: every member present, the readiness flag false', () => {
      const reading = readAccountState({
        accountStatus: 'SUSPENDED',
        timeZone: 'America/Sao_Paulo',
        pendingConsents: [],
        requiresMajorityReaffirmation: false,
        setupComplete: false,
      });
      expect(reading.ok && reading.state).toEqual(
        expect.objectContaining({
          accountStatus: 'SUSPENDED',
          timeZone: 'America/Sao_Paulo',
          setupComplete: false,
        }),
      );
    });
  });

  it('copies the consent list rather than keeping the body alive', () => {
    const consents = ['INSTITUTION_SHARING'];
    const reading = readAccountState(complete({ pendingConsents: consents }));
    consents.push('ACADEMIC_RESEARCH');
    expect(reading.ok && reading.state.pendingConsents).toEqual(['INSTITUTION_SHARING']);
  });
});
