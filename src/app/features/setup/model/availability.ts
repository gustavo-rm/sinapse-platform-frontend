import {
  type ApiFailure,
  TransportFailure,
  isAccessDenied,
  isConflict,
  isRateLimitExceeded,
  isResourceNotFound,
  isValidationFailed,
} from '../../../core/api/api-problem';
import { DAYS_OF_WEEK, type DayOfWeek } from '../../../core/api/contract/enums';
import type { AvailabilityResponse } from '../../../core/api/contract/models';
import { isAfterLocalTime, isLocalTime, localTimeFromWire } from '../../../core/time/local-time';

/**
 * A weekly availability window as this client holds it: times as `HH:mm` whatever the server
 * echoed (F19, `core/time/local-time.ts`), and an open-ended window with `effectiveUntil` null.
 *
 * A window is never edited. Changing a routine is closing the window that stopped applying and
 * declaring another (backend `AvailabilityService`): a past plan was generated against the window
 * as it was, and the closed window keeps saying what it said for the period it covered.
 */
export interface AvailabilityWindow {
  readonly id: string;
  readonly dayOfWeek: DayOfWeek;
  readonly startTime: string;
  readonly endTime: string;
  /** First day it applies, inclusive, `yyyy-MM-dd`. */
  readonly effectiveFrom: string;
  /** Last day it applies, inclusive, or null while open-ended. */
  readonly effectiveUntil: string | null;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads `GET /api/v1/availability` strictly. The schema declares nothing required (K-A), but a
 * window with no day, no times or no start date cannot be shown honestly: the whole read is then
 * `unreadable`, never a list with a hole in it. Order: the server's (weekday, then start time).
 */
export function windowsFrom(body: unknown, route: string): AvailabilityWindow[] {
  const unreadable = () =>
    new TransportFailure('unreadable', { method: 'GET', route, correlationId: null });
  if (!Array.isArray(body)) {
    throw unreadable();
  }
  return (body as AvailabilityResponse[]).map((item) => {
    const window = windowFrom(item);
    if (window === null) {
      throw unreadable();
    }
    return window;
  });
}

export function windowFrom(
  item: AvailabilityResponse | null | undefined,
): AvailabilityWindow | null {
  if (
    item === null ||
    typeof item !== 'object' ||
    typeof item.id !== 'string' ||
    !(DAYS_OF_WEEK as readonly string[]).includes(item.dayOfWeek ?? '') ||
    typeof item.startTime !== 'string' ||
    typeof item.endTime !== 'string' ||
    !isLocalTime(item.startTime) ||
    !isLocalTime(item.endTime) ||
    typeof item.effectiveFrom !== 'string' ||
    !LOCAL_DATE.test(item.effectiveFrom) ||
    (item.effectiveUntil != null && !LOCAL_DATE.test(item.effectiveUntil))
  ) {
    return null;
  }
  return {
    id: item.id,
    dayOfWeek: item.dayOfWeek as DayOfWeek,
    startTime: localTimeFromWire(item.startTime),
    endTime: localTimeFromWire(item.endTime),
    effectiveFrom: item.effectiveFrom,
    effectiveUntil: item.effectiveUntil ?? null,
  };
}

/** The windows of one weekday, in start order. */
export interface WindowsOfDay {
  readonly dayOfWeek: DayOfWeek;
  readonly windows: readonly AvailabilityWindow[];
}

/** Windows grouped by weekday, Monday first, leaving out the days with none. */
export function byWeekday(windows: readonly AvailabilityWindow[]): WindowsOfDay[] {
  return DAYS_OF_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    windows: windows
      .filter((window) => window.dayOfWeek === dayOfWeek)
      .sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) || a.effectiveFrom.localeCompare(b.effectiveFrom),
      ),
  })).filter((day) => day.windows.length > 0);
}

/**
 * The routine and its record, from the two reads of `GET /api/v1/availability`:
 *
 * - `inForce`: the server's answer for `?on=<today in the account's zone>` — the server decides
 *   which windows apply on that day; this client never compares dates to decide it;
 * - `others`: every window ever declared (the read without `on`) that the server did NOT list for
 *   today — closed ones, and ones that start later. A set difference by id, not a date filter.
 */
export function splitRoutine(
  inForce: readonly AvailabilityWindow[],
  everyWindow: readonly AvailabilityWindow[],
): { readonly inForce: AvailabilityWindow[]; readonly others: AvailabilityWindow[] } {
  const today = new Set(inForce.map((window) => window.id));
  return {
    inForce: [...inForce],
    others: everyWindow.filter((window) => !today.has(window.id)),
  };
}

/** What the declaration form holds. Empty strings for what was not filled. */
export interface AvailabilityDraft {
  readonly dayOfWeek: DayOfWeek | '';
  readonly startTime: string;
  readonly endTime: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
}

export type AvailabilityField = keyof AvailabilityDraft;

/**
 * Why a field cannot be sent. `end-not-after-start` and `until-before-from` are the server's own
 * two 400s ("The window closes before it opens, or stops applying before it applied"), refused
 * here before the request; the server's answer is still handled (`declareFailureOf`).
 */
export type DraftProblem = 'required' | 'invalid' | 'end-not-after-start' | 'until-before-from';

export type DraftProblems = Partial<Readonly<Record<AvailabilityField, DraftProblem>>>;

/** The form's own refusals. Empty when the draft can be sent. */
export function draftProblems(draft: AvailabilityDraft): DraftProblems {
  const problems: Partial<Record<AvailabilityField, DraftProblem>> = {};
  if (draft.dayOfWeek === '') {
    problems.dayOfWeek = 'required';
  }
  for (const field of ['startTime', 'endTime'] as const) {
    if (draft[field].trim() === '') {
      problems[field] = 'required';
    } else if (!isLocalTime(draft[field])) {
      problems[field] = 'invalid';
    }
  }
  if (problems.startTime === undefined && problems.endTime === undefined) {
    if (!isAfterLocalTime(draft.endTime, draft.startTime)) {
      problems.endTime = 'end-not-after-start';
    }
  }
  if (draft.effectiveFrom === '') {
    problems.effectiveFrom = 'required';
  } else if (!LOCAL_DATE.test(draft.effectiveFrom)) {
    problems.effectiveFrom = 'invalid';
  }
  if (draft.effectiveUntil !== '') {
    if (!LOCAL_DATE.test(draft.effectiveUntil)) {
      problems.effectiveUntil = 'invalid';
    } else if (problems.effectiveFrom === undefined && draft.effectiveUntil < draft.effectiveFrom) {
      problems.effectiveUntil = 'until-before-from';
    }
  }
  return problems;
}

/**
 * Whether a closing date can be sent: on or after the day the window started applying. The server
 * refuses an earlier one — with a 500 `internal-error` today, not a 400 (observed on `46b5b3c`:
 * `AvailabilityWindow.close` throws an `IllegalArgumentException` the handler does not map) — so
 * this client never sends it. A date in the past is allowed: "a student saying their Tuesday
 * evening stopped last month is stating what happened" (backend `AvailabilityService.close`).
 */
export function closingProblem(
  window: AvailabilityWindow,
  until: string,
): 'required' | 'invalid' | 'until-before-from' | null {
  if (until === '') {
    return 'required';
  }
  if (!LOCAL_DATE.test(until)) {
    return 'invalid';
  }
  return until < window.effectiveFrom ? 'until-before-from' : null;
}

/**
 * The closing date offered first: today in the account's zone, or the window's first day when it
 * has not started yet (an earlier date would be refused).
 */
export function suggestedClosing(window: AvailabilityWindow, today: string): string {
  return today < window.effectiveFrom ? window.effectiveFrom : today;
}

/** The server's validation fields for a declaration, mapped onto the form. */
const SERVER_FIELDS: Readonly<Partial<Record<string, AvailabilityField>>> = {
  dayOfWeek: 'dayOfWeek',
  startTime: 'startTime',
  endTime: 'endTime',
  effectiveFrom: 'effectiveFrom',
  effectiveUntil: 'effectiveUntil',
  // The two cross-field rules of `AvailabilityRequest`, named after their `@AssertTrue` getters.
  timeRangeOrdered: 'endTime',
  validityRangeOrdered: 'effectiveUntil',
};

/** What a declaration came to. Decided by the problem `type`, never the status. */
export type DeclareOutcome =
  | { readonly kind: 'declared'; readonly window: AvailabilityWindow | null }
  /** 400: by field where the server named one this form has; `formLevel` for the rest. */
  | {
      readonly kind: 'invalid';
      readonly fields: DraftProblems;
      readonly formLevel: boolean;
    }
  /** 409 `conflict`: it would overlap a window of the same weekday whose validity meets. */
  | { readonly kind: 'overlaps' }
  /** 403 `access-denied`: this account's learning data may not be processed. */
  | { readonly kind: 'not-processable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function declareFailureOf(failure: ApiFailure): DeclareOutcome {
  if (isValidationFailed(failure)) {
    const fields: Partial<Record<AvailabilityField, DraftProblem>> = {};
    let formLevel = false;
    for (const error of failure.problem.errors ?? []) {
      const field = error.field === undefined ? undefined : SERVER_FIELDS[error.field];
      if (field === undefined) {
        formLevel = true;
        continue;
      }
      fields[field] =
        error.field === 'timeRangeOrdered'
          ? 'end-not-after-start'
          : error.field === 'validityRangeOrdered'
            ? 'until-before-from'
            : 'invalid';
    }
    if (Object.keys(fields).length === 0) {
      formLevel = true;
    }
    return { kind: 'invalid', fields, formLevel };
  }
  if (isConflict(failure)) {
    return { kind: 'overlaps' };
  }
  return commonFailureOf(failure);
}

/** What closing a window came to. */
export type CloseOutcome =
  | { readonly kind: 'closed' }
  /** 409 `conflict`: it was already closed — moving the date would rewrite when the routine changed. */
  | { readonly kind: 'already-closed' }
  /** 404: no such window for this account. */
  | { readonly kind: 'gone' }
  | { readonly kind: 'not-processable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

export function closeFailureOf(failure: ApiFailure): CloseOutcome {
  if (isConflict(failure)) {
    return { kind: 'already-closed' };
  }
  if (isResourceNotFound(failure)) {
    return { kind: 'gone' };
  }
  return commonFailureOf(failure);
}

/** The failures every write of this feature shares: 403, 429, and the rest. */
export function commonFailureOf(
  failure: ApiFailure,
):
  | { readonly kind: 'not-processable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number | null }
  | { readonly kind: 'failed'; readonly failure: ApiFailure } {
  if (isAccessDenied(failure)) {
    return { kind: 'not-processable' };
  }
  if (isRateLimitExceeded(failure)) {
    return { kind: 'rate-limited', retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { kind: 'failed', failure };
}
