import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import {
  type AvailabilityDraft,
  type AvailabilityWindow,
  byWeekday,
  closeFailureOf,
  closingProblem,
  declareFailureOf,
  draftProblems,
  splitRoutine,
  suggestedClosing,
  windowsFrom,
} from './availability';

const ORIGIN = { method: 'POST', route: ApiRoutes.planning.availability, correlationId: null };

function problem(
  type: ProblemType,
  extra: Record<string, unknown> = {},
  retry: number | null = null,
) {
  return new ApiProblemFailure(
    { type, title: 't', status: 400, detail: 'English detail', instance: '/', ...extra },
    ORIGIN,
    retry,
  );
}

function draft(overrides: Partial<AvailabilityDraft> = {}): AvailabilityDraft {
  return {
    dayOfWeek: 'TUESDAY',
    startTime: '19:00',
    endTime: '21:00',
    effectiveFrom: '2026-11-11',
    effectiveUntil: '',
    ...overrides,
  };
}

function window(overrides: Partial<AvailabilityWindow> = {}): AvailabilityWindow {
  return {
    id: 'w',
    dayOfWeek: 'TUESDAY',
    startTime: '19:00',
    endTime: '21:00',
    effectiveFrom: '2026-11-01',
    effectiveUntil: null,
    ...overrides,
  };
}

describe('availability model', () => {
  describe('windowsFrom', () => {
    it('reads the server echo (HH:mm:ss, F19) as HH:mm, and an absent end date as open-ended', () => {
      expect(
        windowsFrom(
          [
            {
              id: 'a',
              dayOfWeek: 'TUESDAY',
              startTime: '19:00:00',
              endTime: '21:00:00',
              effectiveFrom: '2026-11-01',
            },
          ],
          ApiRoutes.planning.availability,
        ),
      ).toEqual([window({ id: 'a' })]);
    });

    it('reads the contract form (HH:mm) and a closed window', () => {
      const [read] = windowsFrom(
        [
          {
            id: 'a',
            dayOfWeek: 'MONDAY',
            startTime: '07:00',
            endTime: '08:30',
            effectiveFrom: '2026-11-01',
            effectiveUntil: '2026-11-10',
          },
        ],
        ApiRoutes.planning.availability,
      );
      expect(read).toMatchObject({
        startTime: '07:00',
        endTime: '08:30',
        effectiveUntil: '2026-11-10',
      });
    });

    it('makes the whole read unreadable when one window cannot be shown honestly', () => {
      for (const broken of [
        { id: 'a', dayOfWeek: 'TUESDAY', startTime: '19:00', effectiveFrom: '2026-11-01' },
        {
          id: 'a',
          dayOfWeek: 'TERÇA',
          startTime: '19:00',
          endTime: '21:00',
          effectiveFrom: '2026-11-01',
        },
        {
          id: 'a',
          dayOfWeek: 'TUESDAY',
          startTime: '7pm',
          endTime: '21:00',
          effectiveFrom: '2026-11-01',
        },
      ]) {
        expect(() => windowsFrom([broken], ApiRoutes.planning.availability)).toThrow(
          TransportFailure,
        );
      }
      expect(() => windowsFrom({}, ApiRoutes.planning.availability)).toThrow(TransportFailure);
    });
  });

  describe("the form's own refusals", () => {
    it('accepts a complete window', () => {
      expect(draftProblems(draft())).toEqual({});
      expect(draftProblems(draft({ effectiveUntil: '2026-11-11' }))).toEqual({});
    });

    it('refuses an end before the start, and an end equal to it, before any request', () => {
      expect(draftProblems(draft({ startTime: '21:00', endTime: '19:00' }))).toEqual({
        endTime: 'end-not-after-start',
      });
      expect(draftProblems(draft({ startTime: '19:00', endTime: '19:00' }))).toEqual({
        endTime: 'end-not-after-start',
      });
    });

    it('refuses a window across midnight: 23:00 to 00:00 closes before it opens', () => {
      expect(draftProblems(draft({ startTime: '23:00', endTime: '00:00' })).endTime).toBe(
        'end-not-after-start',
      );
    });

    it('refuses a last day before the first, and accepts the same day', () => {
      expect(draftProblems(draft({ effectiveUntil: '2026-11-10' }))).toEqual({
        effectiveUntil: 'until-before-from',
      });
      expect(draftProblems(draft({ effectiveUntil: '2026-11-11' }))).toEqual({});
    });

    it('asks for what is missing', () => {
      expect(
        draftProblems(draft({ dayOfWeek: '', startTime: '', endTime: '', effectiveFrom: '' })),
      ).toEqual({
        dayOfWeek: 'required',
        startTime: 'required',
        endTime: 'required',
        effectiveFrom: 'required',
      });
    });
  });

  describe('closing', () => {
    it('refuses a last day before the window began — the server answers it with a 500', () => {
      expect(closingProblem(window(), '2026-10-31')).toBe('until-before-from');
      expect(closingProblem(window(), '2026-11-01')).toBeNull();
      expect(closingProblem(window(), '')).toBe('required');
    });

    it('accepts a day in the past: stating when the routine changed', () => {
      expect(closingProblem(window({ effectiveFrom: '2026-01-01' }), '2026-03-01')).toBeNull();
    });

    it('offers today, or the first day of a window that has not begun', () => {
      expect(suggestedClosing(window(), '2026-11-11')).toBe('2026-11-11');
      expect(suggestedClosing(window({ effectiveFrom: '2026-12-01' }), '2026-11-11')).toBe(
        '2026-12-01',
      );
    });
  });

  describe('the routine and its record', () => {
    it("splits by the server's answer for today, by id — never by comparing dates", () => {
      // A window whose dates "look" in force but that the server did not list stays apart: the
      // client takes the server's word.
      const a = window({ id: 'a' });
      const b = window({ id: 'b', effectiveUntil: '2026-11-05' });
      const c = window({ id: 'c', effectiveFrom: '2026-01-01' });
      expect(splitRoutine([a], [a, b, c])).toEqual({ inForce: [a], others: [b, c] });
    });

    it('groups by weekday, Monday first, in start order', () => {
      const days = byWeekday([
        window({ id: 'late', dayOfWeek: 'TUESDAY', startTime: '21:00' }),
        window({ id: 'sun', dayOfWeek: 'SUNDAY' }),
        window({ id: 'early', dayOfWeek: 'TUESDAY', startTime: '07:00' }),
        window({ id: 'mon', dayOfWeek: 'MONDAY' }),
      ]);
      expect(days.map((day) => [day.dayOfWeek, day.windows.map((w) => w.id)])).toEqual([
        ['MONDAY', ['mon']],
        ['TUESDAY', ['early', 'late']],
        ['SUNDAY', ['sun']],
      ]);
    });
  });

  describe("the server's answers, by problem type", () => {
    it('409 conflict on a declaration is an overlap', () => {
      expect(declareFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({
        kind: 'overlaps',
      });
    });

    it("maps the server's two cross-field 400s onto the form, never showing its message", () => {
      const outcome = declareFailureOf(
        problem('urn:sinapse:problem:validation-failed', {
          errors: [
            { field: 'timeRangeOrdered', message: 'endTime must be after startTime' },
            {
              field: 'validityRangeOrdered',
              message: 'effectiveUntil must not precede effectiveFrom',
            },
          ],
        }),
      );
      expect(outcome).toEqual({
        kind: 'invalid',
        fields: { endTime: 'end-not-after-start', effectiveUntil: 'until-before-from' },
        formLevel: false,
      });
    });

    it('a 400 naming no field of the form is a form-level refusal', () => {
      expect(
        declareFailureOf(
          problem('urn:sinapse:problem:validation-failed', { errors: [{ field: 'request' }] }),
        ),
      ).toEqual({ kind: 'invalid', fields: {}, formLevel: true });
    });

    it('403 access-denied: the learning data may not be processed', () => {
      expect(declareFailureOf(problem('urn:sinapse:problem:access-denied'))).toEqual({
        kind: 'not-processable',
      });
      expect(closeFailureOf(problem('urn:sinapse:problem:access-denied'))).toEqual({
        kind: 'not-processable',
      });
    });

    it('closing: 409 is already closed, 404 is gone, 429 carries the wait', () => {
      expect(closeFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({
        kind: 'already-closed',
      });
      expect(closeFailureOf(problem('urn:sinapse:problem:resource-not-found'))).toEqual({
        kind: 'gone',
      });
      expect(closeFailureOf(problem('urn:sinapse:problem:rate-limit-exceeded', {}, 30))).toEqual({
        kind: 'rate-limited',
        retryAfterSeconds: 30,
      });
    });
  });
});
