import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import {
  DEFAULT_PRIORITY,
  type Goal,
  LEAST_PRESSING,
  MOST_PRESSING,
  activeGoals,
  closedGoals,
  goalActFailureOf,
  goalRequestOf,
  goalsFrom,
  revisionDraftOf,
  revisionRequestOf,
  setGoalFailureOf,
  subjectsFrom,
  subjectsOpenForGoal,
} from './goals';

const ORIGIN = { method: 'POST', route: ApiRoutes.planning.goals, correlationId: null };
const problem = (type: ProblemType) =>
  new ApiProblemFailure({ type, title: 't', status: 409, detail: 'x', instance: '/' }, ORIGIN);

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    subjectId: 's1',
    targetDate: null,
    priority: 3,
    status: 'ACTIVE',
    createdAt: '2026-11-11T17:00:00Z',
    closedAt: null,
    ...overrides,
  };
}

describe('goals model', () => {
  it('runs the priority scale upward: 5 is the most pressing (backend and Core, not the contract)', () => {
    expect(MOST_PRESSING).toBe(5);
    expect(LEAST_PRESSING).toBe(1);
    expect(DEFAULT_PRIORITY).toBe(3);
  });

  it('reads goals strictly, keeping an absent date as null', () => {
    expect(
      goalsFrom(
        [
          {
            id: 'g',
            subjectId: 's1',
            priority: 4,
            status: 'ABANDONED',
            createdAt: 'c',
            closedAt: 'd',
          },
        ],
        ApiRoutes.planning.goals,
      ),
    ).toEqual([
      {
        id: 'g',
        subjectId: 's1',
        targetDate: null,
        priority: 4,
        status: 'ABANDONED',
        createdAt: 'c',
        closedAt: 'd',
      },
    ]);
    expect(() =>
      goalsFrom(
        [{ id: 'g', subjectId: 's1', priority: 9, status: 'ACTIVE' }],
        ApiRoutes.planning.goals,
      ),
    ).toThrow(TransportFailure);
  });

  it('does not keep a subject position: it is a code-order rank, not a ranking', () => {
    expect(
      subjectsFrom(
        [{ id: 's', name: 'Anatomia Humana', position: 1 }],
        ApiRoutes.curriculum.subjects,
      ),
    ).toEqual([{ id: 's', name: 'Anatomia Humana' }]);
  });

  it('offers for a new goal only the subjects with no ACTIVE goal; a closed goal frees its subject', () => {
    const subjects = [
      { id: 's1', name: 'A' },
      { id: 's2', name: 'B' },
      { id: 's3', name: 'C' },
    ];
    const goals = [
      goal({ id: '1', subjectId: 's1' }),
      goal({ id: '2', subjectId: 's2', status: 'ABANDONED' }),
      goal({ id: '3', subjectId: 's3', status: 'ACHIEVED' }),
    ];
    expect(subjectsOpenForGoal(subjects, goals).map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('separates active and closed goals, the most recently closed first', () => {
    const goals = [
      goal({ id: 'a' }),
      goal({ id: 'old', status: 'ACHIEVED', closedAt: '2026-01-01T00:00:00Z' }),
      goal({ id: 'new', status: 'ABANDONED', closedAt: '2026-11-01T00:00:00Z' }),
    ];
    expect(activeGoals(goals).map((g) => g.id)).toEqual(['a']);
    expect(closedGoals(goals).map((g) => g.id)).toEqual(['new', 'old']);
  });

  it('sends the priority shown when setting a goal, and omits an empty date', () => {
    expect(goalRequestOf({ subjectId: 's', targetDate: '', priority: 3 })).toEqual({
      subjectId: 's',
      priority: 3,
    });
    expect(goalRequestOf({ subjectId: 's', targetDate: '2027-06-30', priority: 5 })).toEqual({
      subjectId: 's',
      priority: 5,
      targetDate: '2027-06-30',
    });
  });

  describe('revision (PATCH replaces: an omitted date CLEARS it)', () => {
    it('starts from the values READ for the goal', () => {
      expect(revisionDraftOf(goal({ priority: 4, targetDate: '2027-06-30' }))).toEqual({
        priority: 4,
        targetDate: '2027-06-30',
      });
      expect(revisionDraftOf(goal({ priority: 2 }))).toEqual({ priority: 2, targetDate: '' });
    });

    it('revising only the priority sends back the date read, so it is not cleared', () => {
      const read = goal({ priority: 3, targetDate: '2027-06-30' });
      const draft = { ...revisionDraftOf(read), priority: 5 as const };
      expect(revisionRequestOf(draft)).toEqual({ priority: 5, targetDate: '2027-06-30' });
    });

    it('revising only the date sends back the priority read', () => {
      const read = goal({ priority: 4, targetDate: null });
      expect(revisionRequestOf({ ...revisionDraftOf(read), targetDate: '2027-01-15' })).toEqual({
        priority: 4,
        targetDate: '2027-01-15',
      });
    });

    it('an emptied date is omitted — which is how the date is removed', () => {
      expect(revisionRequestOf({ priority: 3, targetDate: '' })).toEqual({ priority: 3 });
    });
  });

  describe("the server's answers, by problem type", () => {
    it('409 on setting is a duplicate goal for the subject; 404 an unknown subject', () => {
      expect(setGoalFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({
        kind: 'duplicate',
      });
      expect(setGoalFailureOf(problem('urn:sinapse:problem:resource-not-found'))).toEqual({
        kind: 'unknown-subject',
      });
      expect(setGoalFailureOf(problem('urn:sinapse:problem:access-denied'))).toEqual({
        kind: 'not-processable',
      });
    });

    it('409 on revising, abandoning or achieving is a goal already closed', () => {
      expect(goalActFailureOf(problem('urn:sinapse:problem:conflict'))).toEqual({ kind: 'closed' });
      expect(goalActFailureOf(problem('urn:sinapse:problem:resource-not-found'))).toEqual({
        kind: 'gone',
      });
    });
  });
});
