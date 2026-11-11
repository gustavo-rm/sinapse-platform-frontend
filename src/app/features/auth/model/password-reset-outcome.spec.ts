import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import { resetConfirmationFailureOf, resetRequestFailureOf } from './password-reset-outcome';

const ORIGIN = { method: 'POST', route: ApiRoutes.identity.passwordResets, correlationId: null };

function problem(
  type: ProblemType,
  errors?: { field: string; message: string }[],
  retryAfterSeconds: number | null = null,
) {
  return new ApiProblemFailure(
    { type, title: 't', status: 400, detail: 'd', instance: '/', ...(errors ? { errors } : {}) },
    ORIGIN,
    retryAfterSeconds,
  );
}

describe('the reset request, by problem type', () => {
  it('reads a 400 as a problem with what was typed — never with whether an account exists', () => {
    expect(resetRequestFailureOf(problem('urn:sinapse:problem:validation-failed'))).toEqual({
      kind: 'invalid',
    });
  });

  it('keeps the wait of a 429 (5 per hour)', () => {
    expect(
      resetRequestFailureOf(problem('urn:sinapse:problem:rate-limit-exceeded', undefined, 3600)),
    ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 3600 });
  });

  it('passes anything else on as a failure', () => {
    const network = new TransportFailure('network', ORIGIN);
    expect(resetRequestFailureOf(network)).toEqual({ kind: 'failed', failure: network });
  });
});

describe('the reset confirmation, by problem type', () => {
  it('reads 404 as one answer for unknown, expired and already used', () => {
    expect(resetConfirmationFailureOf(problem('urn:sinapse:problem:resource-not-found'))).toEqual({
      kind: 'not-accepted',
    });
  });

  it('reads the fields a 400 names', () => {
    expect(
      resetConfirmationFailureOf(
        problem('urn:sinapse:problem:validation-failed', [
          { field: 'newPassword', message: 'size must be between 12 and 256' },
        ]),
      ),
    ).toEqual({ kind: 'invalid', fields: new Set(['newPassword']), formLevel: false });
    expect(
      resetConfirmationFailureOf(
        problem('urn:sinapse:problem:validation-failed', [{ field: 'request', message: 'x' }]),
      ),
    ).toEqual({ kind: 'invalid', fields: new Set(), formLevel: true });
  });

  it('keeps the wait of a 429 (10 per 5 minutes)', () => {
    expect(
      resetConfirmationFailureOf(
        problem('urn:sinapse:problem:rate-limit-exceeded', undefined, 300),
      ),
    ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 300 });
  });
});
