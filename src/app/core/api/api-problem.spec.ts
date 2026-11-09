import {
  type ApiProblem,
  ApiProblemFailure,
  TransportFailure,
  apiFailureOf,
  isAccessDenied,
  isConflict,
  isInternalError,
  isMalformedRequest,
  isMethodNotAllowed,
  isMinorRegistrationNotSupported,
  isNotAcceptable,
  isPayloadTooLarge,
  isPrerequisiteCycle,
  isProblemType,
  isRateLimitExceeded,
  isResourceNotFound,
  isServiceUnavailable,
  isSetupIncomplete,
  isTimeWindowInvalid,
  isUnauthenticated,
  isUnsupportedMediaType,
  isValidationFailed,
  problemHandling,
} from './api-problem';
import { ApiRoutes } from './api-routes';
import { PROBLEM_TYPES, type ProblemType } from './contract/problem-type';

const ORIGIN = { method: 'GET', route: ApiRoutes.readModel.myState, correlationId: 'c-1' };

function failure(type: ProblemType, status = 409): ApiProblemFailure {
  const problem: ApiProblem = {
    type,
    title: 'Title',
    status,
    detail: 'Developer-facing detail',
    instance: '/x',
  };
  return new ApiProblemFailure(problem, ORIGIN);
}

/** One guard per type, in the order of PROBLEM_TYPES. */
const GUARDS: readonly [ProblemType, (value: unknown) => boolean][] = [
  ['urn:sinapse:problem:validation-failed', isValidationFailed],
  ['urn:sinapse:problem:malformed-request', isMalformedRequest],
  ['urn:sinapse:problem:time-window-invalid', isTimeWindowInvalid],
  ['urn:sinapse:problem:unauthenticated', isUnauthenticated],
  ['urn:sinapse:problem:access-denied', isAccessDenied],
  ['urn:sinapse:problem:resource-not-found', isResourceNotFound],
  ['urn:sinapse:problem:method-not-allowed', isMethodNotAllowed],
  ['urn:sinapse:problem:not-acceptable', isNotAcceptable],
  ['urn:sinapse:problem:minor-registration-not-supported', isMinorRegistrationNotSupported],
  ['urn:sinapse:problem:prerequisite-cycle', isPrerequisiteCycle],
  ['urn:sinapse:problem:setup-incomplete', isSetupIncomplete],
  ['urn:sinapse:problem:conflict', isConflict],
  ['urn:sinapse:problem:payload-too-large', isPayloadTooLarge],
  ['urn:sinapse:problem:unsupported-media-type', isUnsupportedMediaType],
  ['urn:sinapse:problem:rate-limit-exceeded', isRateLimitExceeded],
  ['urn:sinapse:problem:internal-error', isInternalError],
  ['urn:sinapse:problem:service-unavailable', isServiceUnavailable],
];

describe('ApiProblem', () => {
  it('has one guard per problem type of the catalogue, and each accepts only its own type', () => {
    expect(GUARDS.map(([type]) => type)).toEqual([...PROBLEM_TYPES]);
    for (const [type, guard] of GUARDS) {
      for (const other of PROBLEM_TYPES) {
        expect(guard(failure(other))).toBe(other === type);
      }
      expect(guard(new TransportFailure('network', ORIGIN))).toBe(false);
      expect(guard({ problem: { type } })).toBe(false);
    }
  });

  it('maps every problem type to a handling path, proven over the list', () => {
    const handling = Object.fromEntries(PROBLEM_TYPES.map((type) => [type, problemHandling(type)]));
    expect(Object.keys(handling)).toHaveLength(17);
    for (const value of Object.values(handling)) {
      expect(['session-expiry', 'rate-limit', 'field-errors', 'caller']).toContain(value);
    }
    expect(PROBLEM_TYPES.filter((t) => problemHandling(t) === 'session-expiry')).toEqual([
      'urn:sinapse:problem:unauthenticated',
    ]);
    expect(PROBLEM_TYPES.filter((t) => problemHandling(t) === 'rate-limit')).toEqual([
      'urn:sinapse:problem:rate-limit-exceeded',
    ]);
    expect(PROBLEM_TYPES.filter((t) => problemHandling(t) === 'field-errors')).toEqual([
      'urn:sinapse:problem:validation-failed',
    ]);
  });

  it('tells the three 409 types apart by type, all three with the same status', () => {
    const cycle = failure('urn:sinapse:problem:prerequisite-cycle', 409);
    const setup = failure('urn:sinapse:problem:setup-incomplete', 409);
    const conflict = failure('urn:sinapse:problem:conflict', 409);
    expect([cycle, setup, conflict].map((f) => f.problem.status)).toEqual([409, 409, 409]);
    expect([isPrerequisiteCycle(cycle), isSetupIncomplete(cycle), isConflict(cycle)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([isPrerequisiteCycle(setup), isSetupIncomplete(setup), isConflict(setup)]).toEqual([
      false,
      true,
      false,
    ]);
    expect([
      isPrerequisiteCycle(conflict),
      isSetupIncomplete(conflict),
      isConflict(conflict),
    ]).toEqual([false, false, true]);
  });

  it('never carries detail as the error message, which reaches the console when uncaught', () => {
    const f = failure('urn:sinapse:problem:conflict');
    expect(f.message).toBe('urn:sinapse:problem:conflict');
    expect(String(f)).not.toContain('Developer-facing detail');
  });

  it('recognises only catalogue types', () => {
    expect(isProblemType('urn:sinapse:problem:conflict')).toBe(true);
    expect(isProblemType('urn:sinapse:problem:something-new')).toBe(false);
    expect(isProblemType(409)).toBe(false);
  });

  it('reads the failure behind a resource error, wrapped or not', () => {
    const f = failure('urn:sinapse:problem:conflict');
    expect(apiFailureOf(f)).toBe(f);
    expect(apiFailureOf(new Error('wrapper', { cause: f }))).toBe(f);
    expect(apiFailureOf(new Error('other'))).toBeNull();
  });
});
