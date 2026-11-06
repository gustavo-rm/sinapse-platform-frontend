/**
 * The closed catalogue of `urn:sinapse:problem:*` types (RFC 7807 `type` member).
 *
 * Source: `shared.web.problem.ApiErrorType` of `sinapse-platform@c3abbff`, 17 constants. The
 * OpenAPI snapshot does not enumerate them: `ProblemDetails.type` is a `uri` string whose example
 * is `urn:sinapse:problem:resource-not-found`. A client tells errors apart by this member, never by
 * the HTTP status — three of these share 409 (`CLAUDE.md` R6).
 */
export const PROBLEM_TYPES = [
  'urn:sinapse:problem:validation-failed',
  'urn:sinapse:problem:malformed-request',
  'urn:sinapse:problem:time-window-invalid',
  'urn:sinapse:problem:unauthenticated',
  'urn:sinapse:problem:access-denied',
  'urn:sinapse:problem:resource-not-found',
  'urn:sinapse:problem:method-not-allowed',
  'urn:sinapse:problem:not-acceptable',
  'urn:sinapse:problem:minor-registration-not-supported',
  'urn:sinapse:problem:prerequisite-cycle',
  'urn:sinapse:problem:setup-incomplete',
  'urn:sinapse:problem:conflict',
  'urn:sinapse:problem:payload-too-large',
  'urn:sinapse:problem:unsupported-media-type',
  'urn:sinapse:problem:rate-limit-exceeded',
  'urn:sinapse:problem:internal-error',
  'urn:sinapse:problem:service-unavailable',
] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];
