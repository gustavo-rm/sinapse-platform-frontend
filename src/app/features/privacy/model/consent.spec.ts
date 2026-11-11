import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import type { ConsentSummary } from '../../../core/api/contract/models';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import {
  consentsInForce,
  grantFailureOf,
  grantableHere,
  inContractOrder,
  reaffirmationFailureOf,
  withdrawalEffectOf,
  withdrawalFailureOf,
} from './consent';

const ORIGIN = { method: 'POST', route: null, correlationId: null };

function problem(type: ProblemType, retryAfterSeconds: number | null = null) {
  return new ApiProblemFailure(
    { type, title: 't', status: 409, detail: 'd', instance: '/' },
    ORIGIN,
    retryAfterSeconds,
  );
}

describe('consentsInForce', () => {
  it('reads a record without revokedAt as in force, and a withdrawn one as not', () => {
    const history: ConsentSummary[] = [
      {
        purpose: 'LEARNING_DATA_PROCESSING',
        grantedAt: '2026-11-10T21:12:43Z',
        termsVersion: 'dev-0',
      },
      {
        purpose: 'LEARNING_DATA_PROCESSING',
        grantedAt: '2026-11-10T21:12:36Z',
        revokedAt: '2026-11-10T21:12:42Z',
      },
      {
        purpose: 'ACADEMIC_RESEARCH',
        grantedAt: '2026-11-10T21:12:36Z',
        revokedAt: '2026-11-10T21:12:42Z',
      },
    ];
    const inForce = consentsInForce(history);
    expect([...inForce.keys()]).toEqual(['LEARNING_DATA_PROCESSING']);
    expect(inForce.get('LEARNING_DATA_PROCESSING')?.grantedAt).toBe('2026-11-10T21:12:43Z');
  });
});

describe('the withdrawal of each purpose', () => {
  it('suspends for the essential one, ends teacher access for sharing, and nothing for research', () => {
    expect(withdrawalEffectOf('LEARNING_DATA_PROCESSING')).toBe('suspends-account');
    expect(withdrawalEffectOf('INSTITUTION_SHARING')).toBe('ends-teacher-access');
    expect(withdrawalEffectOf('ACADEMIC_RESEARCH')).toBe('none');
  });

  it('never grants sharing from a consent screen: only an invite does (F1)', () => {
    expect(grantableHere('INSTITUTION_SHARING')).toBe(false);
    expect(grantableHere('ACADEMIC_RESEARCH')).toBe(true);
    expect(grantableHere('LEARNING_DATA_PROCESSING')).toBe(true);
  });

  it('orders purposes as the contract does', () => {
    expect(inContractOrder(['ACADEMIC_RESEARCH', 'LEARNING_DATA_PROCESSING'])).toEqual([
      'LEARNING_DATA_PROCESSING',
      'ACADEMIC_RESEARCH',
    ]);
  });
});

describe('outcomes, by problem type', () => {
  it('reads a 409 conflict on a grant as "the state changed", not an error', () => {
    expect(grantFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({ kind: 'changed' });
  });

  it('reads a 404 on a withdrawal as "not in force"', () => {
    expect(withdrawalFailureOf(problem('urn:sinapse:problem:resource-not-found'))).toEqual({
      kind: 'not-in-force',
    });
  });

  it('reads a 409 on a reaffirmation as refused', () => {
    expect(reaffirmationFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({
      kind: 'refused',
    });
  });

  it('keeps the wait of a 429, and passes anything else on as a failure', () => {
    expect(grantFailureOf(problem('urn:sinapse:problem:rate-limit-exceeded', 30))).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 30,
    });
    const network = new TransportFailure('network', ORIGIN);
    expect(withdrawalFailureOf(network)).toEqual({ kind: 'failed', failure: network });
  });
});
