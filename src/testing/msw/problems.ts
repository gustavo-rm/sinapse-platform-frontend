/**
 * RFC 7807 answers, as the backend writes them: generated from the snapshot's `ProblemDetails`
 * schema, with the `type` and status of the case under test.
 */
import { HttpResponse } from 'msw';

import type { ProblemDetails } from '../../app/core/api/contract/models';
import type { ProblemType } from '../../app/core/api/contract/problem-type';
import { fixture } from './fixtures';

const PREFIX = 'urn:sinapse:problem:';

/**
 * The status the backend answers each problem type with. Not in the snapshot: read from
 * `shared/web/problem/ApiErrorType.java` at `sinapse-platform@46b5b3c`, keyed by the code after
 * the `urn:sinapse:problem:` prefix.
 */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  'validation-failed': 400,
  'malformed-request': 400,
  'time-window-invalid': 400,
  unauthenticated: 401,
  'access-denied': 403,
  'resource-not-found': 404,
  'method-not-allowed': 405,
  'not-acceptable': 406,
  'minor-registration-not-supported': 422,
  'prerequisite-cycle': 409,
  'setup-incomplete': 409,
  conflict: 409,
  'payload-too-large': 413,
  'unsupported-media-type': 415,
  'rate-limit-exceeded': 429,
  'internal-error': 500,
  'service-unavailable': 503,
};

/** The HTTP status of a problem type, as the backend sends it. */
export function statusOf(type: ProblemType): number {
  const status = STATUS_BY_CODE[type.slice(PREFIX.length)];
  if (status === undefined) {
    throw new Error(`No status recorded for ${type}`);
  }
  return status;
}

export interface ProblemOptions {
  /** The request path the problem is about, as `instance`. */
  readonly instance?: string;
  /** `Retry-After`, in seconds. */
  readonly retryAfterSeconds?: number;
  /** The `X-Correlation-Id` the server echoes. */
  readonly correlationId?: string;
}

/** A problem body of `type`, generated from the schema. `errors` only on `validation-failed`. */
export function problemBody(type: ProblemType, instance = '/'): ProblemDetails {
  const { errors, ...generated } = fixture('ProblemDetails');
  return {
    ...generated,
    type,
    status: statusOf(type),
    instance,
    ...(type === `${PREFIX}validation-failed` ? { errors } : {}),
  };
}

/** The response the backend sends for a problem of `type`. */
export function problemResponse(
  type: ProblemType,
  options: ProblemOptions = {},
): HttpResponse<ProblemDetails> {
  const headers: Record<string, string> = { 'Content-Type': 'application/problem+json' };
  if (options.retryAfterSeconds !== undefined) {
    headers['Retry-After'] = String(options.retryAfterSeconds);
  }
  if (options.correlationId !== undefined) {
    headers['X-Correlation-Id'] = options.correlationId;
  }
  return HttpResponse.json(problemBody(type, options.instance), {
    status: statusOf(type),
    headers,
  });
}
