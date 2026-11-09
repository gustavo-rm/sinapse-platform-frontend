import type { ApiFailure } from '../api/api-problem';

/** The only fields of a failure that may reach a log. */
export interface ApiFailureLogEntry {
  readonly method: string;
  /** The route template, never the concrete path: an invite code travels in a path. */
  readonly route: string | null;
  /** The problem `type`, or `transport:<reason>`. */
  readonly failure: string;
  readonly status: number | null;
  readonly correlationId: string | null;
}

/**
 * The log line of a failed API request. Built field by field from what is safe, never from a body,
 * a header other than the correlation id, a query string or a concrete path: no e-mail, date of
 * birth, study content or invite code reaches the browser console, where anyone at the screen can
 * read it. The correlation id is what joins this line to the backend's structured log.
 */
export function apiFailureLogEntry(failure: ApiFailure): ApiFailureLogEntry {
  return {
    method: failure.method,
    route: failure.route,
    failure: failure.kind === 'problem' ? failure.problem.type : `transport:${failure.reason}`,
    status: failure.kind === 'problem' ? failure.problem.status : failure.status,
    correlationId: failure.correlationId,
  };
}

/** Writes the entry to the console as one line. */
export function logApiFailure(failure: ApiFailure): void {
  const entry = apiFailureLogEntry(failure);
  console.warn(
    `[api] ${entry.method} ${entry.route ?? '(unlisted route)'} failed: ${entry.failure}` +
      `${entry.status === null ? '' : ` (${entry.status})`}` +
      ` correlation-id=${entry.correlationId ?? 'none'}`,
  );
}
