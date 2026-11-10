import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import type { ConsentSummary, TermsVersionSummary } from '../../../core/api/contract/models';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import {
  consentsInForce,
  currentWordings,
  grantFailureOf,
  grantableHere,
  inContractOrder,
  isDevelopmentPlaceholder,
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

describe('currentWordings', () => {
  it('keeps, per purpose, the most recently published wording — the one the server accepts', () => {
    const terms: TermsVersionSummary[] = [
      {
        id: 'old',
        purpose: 'ACADEMIC_RESEARCH',
        version: '1',
        body: 'a',
        publishedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'new',
        purpose: 'ACADEMIC_RESEARCH',
        version: '2',
        body: 'b',
        publishedAt: '2026-06-01T00:00:00Z',
      },
      {
        id: 'ldp',
        purpose: 'LEARNING_DATA_PROCESSING',
        version: '1',
        body: 'c',
        publishedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const current = currentWordings(terms);
    expect(current.get('ACADEMIC_RESEARCH')?.id).toBe('new');
    expect(current.get('LEARNING_DATA_PROCESSING')?.id).toBe('ldp');
    expect(current.has('INSTITUTION_SHARING')).toBe(false);
  });

  it('does not depend on the order of the list', () => {
    const terms: TermsVersionSummary[] = [
      {
        id: 'new',
        purpose: 'ACADEMIC_RESEARCH',
        version: '2',
        body: 'b',
        publishedAt: '2026-06-01T00:00:00Z',
      },
      {
        id: 'old',
        purpose: 'ACADEMIC_RESEARCH',
        version: '1',
        body: 'a',
        publishedAt: '2026-01-01T00:00:00Z',
      },
    ];
    expect(currentWordings(terms).get('ACADEMIC_RESEARCH')?.id).toBe('new');
  });

  it('skips a wording that cannot be shown in full or accepted', () => {
    const terms: TermsVersionSummary[] = [
      { purpose: 'ACADEMIC_RESEARCH', version: '1', body: 'no id' },
      { id: 'x', purpose: 'ACADEMIC_RESEARCH', version: '1', body: '   ' },
      { id: 'y', purpose: 'ACADEMIC_RESEARCH', body: 'no version' },
    ];
    expect(currentWordings(terms).size).toBe(0);
  });
});

describe('isDevelopmentPlaceholder', () => {
  it('recognises the dev-0 wordings of the local profile (F5)', () => {
    expect(
      isDevelopmentPlaceholder({
        id: 'a',
        purpose: 'ACADEMIC_RESEARCH',
        version: 'dev-0',
        body: 'Development placeholder. Not a consent term.',
        publishedAt: null,
      }),
    ).toBe(true);
  });

  it('does not mark a real wording', () => {
    expect(
      isDevelopmentPlaceholder({
        id: 'a',
        purpose: 'ACADEMIC_RESEARCH',
        version: '2026.1',
        body: 'Texto real.',
        publishedAt: null,
      }),
    ).toBe(false);
  });
});

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
