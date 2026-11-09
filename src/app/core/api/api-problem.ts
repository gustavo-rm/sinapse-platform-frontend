import type { ProblemDetails } from './contract/models';
import { PROBLEM_TYPES, type ProblemType } from './contract/problem-type';

/**
 * An RFC 7807 body the server answered with, `type` narrowed to the closed catalogue.
 *
 * Shaped from the generated `ProblemDetails`: `type`, `title`, `status`, `detail` and `instance`
 * are required there, `errors` appears only on `validation-failed`. `detail` is English text for a
 * developer and is never shown (`CLAUDE.md` R6); `instance` is the request path and may carry a
 * personal path parameter, so neither is ever logged.
 */
export type ApiProblem = Omit<ProblemDetails, 'type'> & { readonly type: ProblemType };

/** Where a failure happened, in terms that are safe to log and to show. */
export interface FailureOrigin {
  /** The HTTP method of the request. */
  readonly method: string;
  /**
   * The route template the request was expanded from (`/api/v1/invites/{code}/preview`), never
   * the concrete path: a path parameter can be personal. Null for a path outside `ApiRoutes`.
   */
  readonly route: string | null;
  /** The `X-Correlation-Id` the server echoed, or the one this client sent. */
  readonly correlationId: string | null;
}

/**
 * The server answered, with a problem of the catalogue. Never retried automatically: the server
 * decided, and asking again gets the same answer or spends a rate limit.
 */
export class ApiProblemFailure<T extends ProblemType = ProblemType>
  extends Error
  implements FailureOrigin
{
  readonly kind = 'problem' as const;
  readonly method: string;
  readonly route: string | null;
  readonly correlationId: string | null;

  constructor(
    readonly problem: ApiProblem & { readonly type: T },
    origin: FailureOrigin,
    /**
     * The response's `Retry-After`, in seconds, when it carried one: on every 429
     * (`rate-limit-exceeded`), from the backend's `RateLimitFilter`.
     */
    readonly retryAfterSeconds: number | null = null,
  ) {
    // The message is the type, never `detail`: an uncaught failure reaches the console.
    super(problem.type);
    this.name = 'ApiProblemFailure';
    this.method = origin.method;
    this.route = origin.route;
    this.correlationId = origin.correlationId;
  }

  /** The problem `type`, the only thing a caller decides by. */
  get type(): T {
    return this.problem.type;
  }
}

/**
 * Why no usable answer came back.
 *
 * - `network`: no response at all — offline, connection refused or reset, DNS.
 * - `timeout`: the client's own timeout fired before the response arrived.
 * - `unreadable`: a response came, but not one this client can read as the contract: a body that
 *   is not JSON, an error that is not `application/problem+json` (a proxy's HTML page), or a
 *   problem whose `type` is not in the catalogue. The server may well have acted.
 */
export type TransportFailureReason = 'network' | 'timeout' | 'unreadable';

/**
 * The server did not answer in the contract. A different situation from an `ApiProblemFailure`,
 * and the only kind that may be retried — automatically only for `network`, on a GET (see
 * `networkRetryInterceptor`).
 */
export class TransportFailure extends Error implements FailureOrigin {
  readonly kind = 'transport' as const;
  readonly method: string;
  readonly route: string | null;
  readonly correlationId: string | null;

  constructor(
    readonly reason: TransportFailureReason,
    origin: FailureOrigin,
    /** The HTTP status when a response did arrive (`unreadable`), otherwise null. */
    readonly status: number | null = null,
  ) {
    super(`transport: ${reason}`);
    this.name = 'TransportFailure';
    this.method = origin.method;
    this.route = origin.route;
    this.correlationId = origin.correlationId;
  }
}

/** Everything a request through `ApiClient` can fail with. No raw `HttpErrorResponse` escapes. */
export type ApiFailure = ApiProblemFailure | TransportFailure;

export function isApiProblem(value: unknown): value is ApiProblemFailure {
  return value instanceof ApiProblemFailure;
}

export function isTransportFailure(value: unknown): value is TransportFailure {
  return value instanceof TransportFailure;
}

export function isApiFailure(value: unknown): value is ApiFailure {
  return isApiProblem(value) || isTransportFailure(value);
}

/**
 * The `ApiFailure` behind a resource's `error()`, or null. `httpResource` hands an `Error`
 * through as is; anything else it wraps, with the original as `cause`.
 */
export function apiFailureOf(error: unknown): ApiFailure | null {
  if (isApiFailure(error)) {
    return error;
  }
  const cause = error instanceof Error ? error.cause : undefined;
  return isApiFailure(cause) ? cause : null;
}

/** True when `value` is one of the 17 `urn:sinapse:problem:*` types of the catalogue. */
export function isProblemType(value: unknown): value is ProblemType {
  return typeof value === 'string' && (PROBLEM_TYPES as readonly string[]).includes(value);
}

function problemGuard<T extends ProblemType>(type: T) {
  return (value: unknown): value is ApiProblemFailure<T> =>
    value instanceof ApiProblemFailure && value.problem.type === type;
}

// One guard per problem type, so a caller writes `if (isSetupIncomplete(error))` and never
// compares a type string inline, let alone a status: three of these share 409.
export const isValidationFailed = problemGuard('urn:sinapse:problem:validation-failed');
export const isMalformedRequest = problemGuard('urn:sinapse:problem:malformed-request');
export const isTimeWindowInvalid = problemGuard('urn:sinapse:problem:time-window-invalid');
export const isUnauthenticated = problemGuard('urn:sinapse:problem:unauthenticated');
export const isAccessDenied = problemGuard('urn:sinapse:problem:access-denied');
export const isResourceNotFound = problemGuard('urn:sinapse:problem:resource-not-found');
export const isMethodNotAllowed = problemGuard('urn:sinapse:problem:method-not-allowed');
export const isNotAcceptable = problemGuard('urn:sinapse:problem:not-acceptable');
export const isMinorRegistrationNotSupported = problemGuard(
  'urn:sinapse:problem:minor-registration-not-supported',
);
export const isPrerequisiteCycle = problemGuard('urn:sinapse:problem:prerequisite-cycle');
export const isSetupIncomplete = problemGuard('urn:sinapse:problem:setup-incomplete');
export const isConflict = problemGuard('urn:sinapse:problem:conflict');
export const isPayloadTooLarge = problemGuard('urn:sinapse:problem:payload-too-large');
export const isUnsupportedMediaType = problemGuard('urn:sinapse:problem:unsupported-media-type');
export const isRateLimitExceeded = problemGuard('urn:sinapse:problem:rate-limit-exceeded');
export const isInternalError = problemGuard('urn:sinapse:problem:internal-error');
export const isServiceUnavailable = problemGuard('urn:sinapse:problem:service-unavailable');

/**
 * Who handles a problem type.
 *
 * - `session-expiry`: `sessionExpiryInterceptor`, for every request, before any caller sees it.
 * - `rate-limit`: `rateLimitInterceptor` publishes the wait; the screen shows `RateLimitNotice`
 *   and offers no retry.
 * - `field-errors`: the form that sent the request, from `errors[]`, field by field.
 * - `caller`: the screen that made the request, by `type` — a specific remedy where the type
 *   names one (`setup-incomplete`, `conflict`, `time-window-invalid`…), else `ErrorState`.
 */
export type ProblemHandling = 'session-expiry' | 'rate-limit' | 'field-errors' | 'caller';

/** The handling path of every problem type. Exhaustive: a type added to the list fails here. */
export function problemHandling(type: ProblemType): ProblemHandling {
  switch (type) {
    case 'urn:sinapse:problem:unauthenticated':
      return 'session-expiry';
    case 'urn:sinapse:problem:rate-limit-exceeded':
      return 'rate-limit';
    case 'urn:sinapse:problem:validation-failed':
      return 'field-errors';
    case 'urn:sinapse:problem:malformed-request':
    case 'urn:sinapse:problem:time-window-invalid':
    case 'urn:sinapse:problem:access-denied':
    case 'urn:sinapse:problem:resource-not-found':
    case 'urn:sinapse:problem:method-not-allowed':
    case 'urn:sinapse:problem:not-acceptable':
    case 'urn:sinapse:problem:minor-registration-not-supported':
    case 'urn:sinapse:problem:prerequisite-cycle':
    case 'urn:sinapse:problem:setup-incomplete':
    case 'urn:sinapse:problem:conflict':
    case 'urn:sinapse:problem:payload-too-large':
    case 'urn:sinapse:problem:unsupported-media-type':
    case 'urn:sinapse:problem:internal-error':
    case 'urn:sinapse:problem:service-unavailable':
      return 'caller';
    default:
      return unreachable(type);
  }
}

function unreachable(value: never): never {
  throw new RangeError(`Unhandled problem type: ${String(value)}`);
}
