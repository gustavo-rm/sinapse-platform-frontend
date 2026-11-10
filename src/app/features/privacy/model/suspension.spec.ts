import { ApiProblemFailure } from '../../../core/api/api-problem';
import type { ConsentSummary, ErasureRequestView } from '../../../core/api/contract/models';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import { cancellationFailureOf, exportFileName, suspensionCauseOf } from './suspension';

const LDP_IN_FORCE: ConsentSummary = {
  purpose: 'LEARNING_DATA_PROCESSING',
  grantedAt: '2026-11-10T00:00:00Z',
};
const LDP_WITHDRAWN: ConsentSummary = {
  purpose: 'LEARNING_DATA_PROCESSING',
  grantedAt: '2026-11-10T00:00:00Z',
  revokedAt: '2026-11-10T01:00:00Z',
};
const OPEN: ErasureRequestView = {
  id: 'r1',
  status: 'REQUESTED',
  requestedAt: '2026-11-10T21:12:55.197417Z',
  effectiveAt: '2026-11-17T21:12:55.197417Z',
};

function problem(type: ProblemType) {
  return new ApiProblemFailure(
    { type, title: 't', status: 409, detail: 'd', instance: '/' },
    { method: 'POST', route: null, correlationId: null },
  );
}

describe('suspensionCauseOf — the bootstrap cannot tell the causes apart, these two reads can', () => {
  it('an open erasure request: the window from the request itself, in days', () => {
    expect(suspensionCauseOf([OPEN], [LDP_IN_FORCE])).toEqual({
      kind: 'erasure',
      request: {
        id: 'r1',
        requestedAt: OPEN.requestedAt,
        effectiveAt: OPEN.effectiveAt,
        windowDays: 7,
      },
    });
  });

  it('a withdrawn essential consent, with no open request', () => {
    expect(suspensionCauseOf([], [LDP_WITHDRAWN])).toEqual({ kind: 'consent-withdrawn' });
  });

  it('a withdrawn essential consent granted again: still that cause, since the grant does not reactivate (observed, FE-5)', () => {
    expect(suspensionCauseOf([], [LDP_IN_FORCE, LDP_WITHDRAWN])).toEqual({
      kind: 'consent-withdrawn',
    });
  });

  it('ignores requests that are no longer open', () => {
    const closed: ErasureRequestView[] = [
      { ...OPEN, status: 'CANCELLED', cancelledAt: '2026-11-11T00:00:00Z' },
      { ...OPEN, id: 'r2', status: 'FAILED' },
    ];
    expect(suspensionCauseOf(closed, [LDP_WITHDRAWN])).toEqual({ kind: 'consent-withdrawn' });
  });

  it('an open request wins over a missing consent: it is what the person can act on', () => {
    expect(suspensionCauseOf([OPEN], [LDP_WITHDRAWN]).kind).toBe('erasure');
  });

  it('neither: unknown, and nothing is assumed', () => {
    expect(suspensionCauseOf([], [LDP_IN_FORCE])).toEqual({ kind: 'unknown' });
  });

  it('gives no window when an instant is missing', () => {
    const cause = suspensionCauseOf([{ id: 'r', status: 'REQUESTED' }], []);
    expect(cause.kind === 'erasure' && cause.request.windowDays).toBeNull();
  });
});

describe('the cancellation outcome', () => {
  it('reads 409 as refused and 404 as gone', () => {
    expect(cancellationFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({
      kind: 'refused',
    });
    expect(cancellationFailureOf(problem('urn:sinapse:problem:resource-not-found'))).toEqual({
      kind: 'gone',
    });
  });
});

it('names the export after the account-local date', () => {
  expect(exportFileName('2026-11-10')).toBe('sinapse-meus-dados-2026-11-10.json');
});
