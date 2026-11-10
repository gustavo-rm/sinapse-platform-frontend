import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import { signInRefusalOf } from './sign-in-outcome';

const ORIGIN = { method: 'POST', route: ApiRoutes.identity.sessions, correlationId: null };

function problem(type: ProblemType, extra: object = {}, retryAfter: number | null = null) {
  return new ApiProblemFailure(
    { type, title: 't', status: 400, detail: 'English', instance: '/', ...extra },
    ORIGIN,
    retryAfter,
  );
}

describe('signInRefusalOf', () => {
  it('reads every 401 as one refusal', () => {
    expect(signInRefusalOf(problem('urn:sinapse:problem:unauthenticated'))).toEqual({
      kind: 'refused',
    });
  });

  it('reads the fields of a validation failure, and nothing of its messages', () => {
    const refusal = signInRefusalOf(
      problem('urn:sinapse:problem:validation-failed', {
        errors: [
          { field: 'email', message: 'x' },
          { field: 'password', message: 'y' },
        ],
      }),
    );
    expect(refusal).toEqual({
      kind: 'invalid',
      fields: new Set(['email', 'password']),
      formLevel: false,
    });
  });

  it.each([
    [[{ field: 'request', message: 'm' }]],
    [[{ field: 'somethingElse', message: 'm' }]],
    [[]],
    [undefined],
  ])('makes a validation failure with no form field (%j) a form-level error', (errors) => {
    const refusal = signInRefusalOf(problem('urn:sinapse:problem:validation-failed', { errors }));
    expect(refusal).toEqual(expect.objectContaining({ kind: 'invalid', formLevel: true }));
  });

  it('keeps the wait of a rate-limit refusal', () => {
    expect(signInRefusalOf(problem('urn:sinapse:problem:rate-limit-exceeded', {}, 45))).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 45,
    });
  });

  it('hands anything else to the error state as it is', () => {
    const network = new TransportFailure('network', ORIGIN);
    expect(signInRefusalOf(network)).toEqual({ kind: 'failed', failure: network });
    const internal = problem('urn:sinapse:problem:internal-error');
    expect(signInRefusalOf(internal)).toEqual({ kind: 'failed', failure: internal });
  });
});
