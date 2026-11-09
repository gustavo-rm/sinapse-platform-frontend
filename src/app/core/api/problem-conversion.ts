import { HttpErrorResponse, type HttpRequest } from '@angular/common/http';

import {
  type ApiFailure,
  type ApiProblem,
  ApiProblemFailure,
  type FailureOrigin,
  TransportFailure,
  isApiFailure,
  isProblemType,
} from './api-problem';
import { routeTemplateOf } from './api-routes';

/** The header that joins a request to its lines in the backend's structured log, in and out. */
export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

const PROBLEM_MEDIA_TYPE = 'application/problem+json';

/**
 * What a failed exchange becomes on its way out of `core/api`: an `ApiProblemFailure` when the
 * server answered with a problem of the catalogue, a `TransportFailure` otherwise. An error that
 * is already one of those is returned as is; anything that is not an `HttpErrorResponse` is not an
 * API failure (it is a defect in this client) and is returned untouched.
 */
export function toApiFailure(error: unknown, request: HttpRequest<unknown>): unknown {
  if (isApiFailure(error) || !(error instanceof HttpErrorResponse)) {
    return error;
  }
  return fromHttpError(error, request);
}

function fromHttpError(error: HttpErrorResponse, request: HttpRequest<unknown>): ApiFailure {
  const origin: FailureOrigin = {
    method: request.method,
    route: routeTemplateOf(request.url),
    correlationId:
      error.headers?.get(CORRELATION_ID_HEADER) ?? request.headers.get(CORRELATION_ID_HEADER),
  };

  if (isTimeout(error.error)) {
    return new TransportFailure('timeout', origin);
  }
  if (error.status === 0) {
    return new TransportFailure('network', origin);
  }
  // A 2xx can only fail here because its body could not be parsed.
  if (error.status < 400) {
    return new TransportFailure('unreadable', origin, error.status);
  }

  const mediaType = error.headers?.get('Content-Type') ?? '';
  const problem = mediaType.toLowerCase().startsWith(PROBLEM_MEDIA_TYPE)
    ? readProblem(error.error)
    : null;
  if (problem === null) {
    return new TransportFailure('unreadable', origin, error.status);
  }
  return new ApiProblemFailure(
    problem,
    origin,
    retryAfterSeconds(error.headers?.get('Retry-After')),
  );
}

/** Angular reports its own timeout as a `TimeoutError` DOMException, under either backend. */
function isTimeout(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { name?: unknown }).name === 'TimeoutError'
  );
}

/**
 * The body as an `ApiProblem`, or null when it is not one: not an object, a required member
 * missing or mistyped, an `errors` entry that is not `{ field, message }`, or a `type` outside the
 * catalogue. A body that cannot be read in the contract is not dressed up as a problem with empty
 * fields.
 */
export function readProblem(body: unknown): ApiProblem | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const candidate = body as Record<string, unknown>;
  const { type, title, status, detail, instance, errors } = candidate;
  if (
    !isProblemType(type) ||
    typeof title !== 'string' ||
    typeof status !== 'number' ||
    typeof detail !== 'string' ||
    typeof instance !== 'string'
  ) {
    return null;
  }
  if (errors === undefined) {
    return { type, title, status, detail, instance };
  }
  if (!Array.isArray(errors) || !errors.every(isValidationError)) {
    return null;
  }
  return {
    type,
    title,
    status,
    detail,
    instance,
    errors: errors.map(({ field, message }) => ({ field, message })),
  };
}

function isValidationError(value: unknown): value is { field: string; message: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { field, message } = value as Record<string, unknown>;
  return typeof field === 'string' && typeof message === 'string';
}

/**
 * `Retry-After` in seconds: the delta-seconds form the backend sends, or an HTTP-date, which a
 * proxy may send. Null when absent or unreadable; never negative.
 */
export function retryAfterSeconds(
  header: string | null | undefined,
  now = Date.now(),
): number | null {
  if (header === null || header === undefined) {
    return null;
  }
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
}
