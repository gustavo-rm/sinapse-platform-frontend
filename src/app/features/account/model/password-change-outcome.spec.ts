import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import { passwordChangeFailureOf } from './password-change-outcome';

const ORIGIN = { method: 'POST', route: ApiRoutes.identity.passwordChanges, correlationId: null };

function problem(type: ProblemType, extra: object = {}, retryAfter: number | null = null) {
  return new ApiProblemFailure(
    { type, title: 't', status: 400, detail: 'English', instance: '/', ...extra },
    ORIGIN,
    retryAfter,
  );
}

describe('passwordChangeFailureOf', () => {
  it('reads the fields a validation failure names', () => {
    expect(
      passwordChangeFailureOf(
        problem('urn:sinapse:problem:validation-failed', {
          errors: [
            { field: 'currentPassword', message: 'a' },
            { field: 'newPassword', message: 'b' },
          ],
        }),
      ),
    ).toEqual({
      kind: 'invalid',
      fields: new Set(['currentPassword', 'newPassword']),
      formLevel: false,
    });
  });

  it('makes a "request" error form-level', () => {
    expect(
      passwordChangeFailureOf(
        problem('urn:sinapse:problem:validation-failed', {
          errors: [{ field: 'request', message: 'm' }],
        }),
      ),
    ).toEqual(expect.objectContaining({ formLevel: true }));
  });

  it('keeps the wait of a rate-limit refusal', () => {
    expect(
      passwordChangeFailureOf(problem('urn:sinapse:problem:rate-limit-exceeded', {}, 9)),
    ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 9 });
  });

  it('hands anything else to the error state', () => {
    const timeout = new TransportFailure('timeout', ORIGIN);
    expect(passwordChangeFailureOf(timeout)).toEqual({ kind: 'failed', failure: timeout });
  });
});
