import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import {
  type CatalogueMap,
  type PlannedSession,
  adherenceOf,
  coverageOf,
  currentPlanStateOf,
  formatMinutes,
  nextSessionOf,
  planFrom,
  planOf,
  plansFrom,
  sessionsBeforeCreation,
  sessionsFrom,
  successorOf,
  summaryFrom,
  topicNameOf,
} from './plan';

const ROUTE = '/route';
const FITNESS = { engine: 'greedy-baseline', build: '2d182c83', partial: true };

/** The body observed for `GET /study-plans/current` on `44f3d1f`, verbatim but for the ids. */
const OBSERVED_PLAN = {
  id: 'f5ef374c',
  generationRequestId: '9c68a6cc',
  horizonStart: '2026-11-12',
  horizonEnd: '2026-12-10',
  status: 'ACTIVE',
  fitness: FITNESS,
  createdAt: '2026-11-12T20:41:50.396524Z',
};

function problem(type: ProblemType, retryAfterSeconds: number | null = null): ApiProblemFailure {
  return new ApiProblemFailure(
    { type, title: 't', status: 400, detail: 'd', instance: '/r' },
    { method: 'GET', route: ROUTE, correlationId: null },
    retryAfterSeconds,
  );
}

function session(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: 's',
    topicId: 't1',
    kind: 'STUDY',
    scheduledStart: '2026-11-16T22:00:00Z',
    durationMinutes: 90,
    sequenceIndex: 0,
    ...overrides,
  };
}

describe('the plan model', () => {
  describe('fitness never enters it', () => {
    it('drops fitness from a plan, from a summary and from every plan of the history', () => {
      const plan = planFrom(OBSERVED_PLAN, ROUTE);
      expect(Object.keys(plan)).not.toContain('fitness');
      expect(JSON.stringify(plan)).not.toContain('greedy-baseline');

      const summary = summaryFrom(
        {
          planId: 'p',
          status: 'ACTIVE',
          horizonStart: '2026-11-12',
          horizonEnd: '2026-12-10',
          totalPlannedMinutes: 820,
          bySubject: [],
          adherence: { plannedElapsed: 0, executed: 0 },
          fitness: FITNESS,
        },
        ROUTE,
      );
      expect(JSON.stringify(summary)).not.toContain('greedy-baseline');
      expect(JSON.stringify(summary)).not.toContain('2d182c83');

      const history = plansFrom([OBSERVED_PLAN, { ...OBSERVED_PLAN, id: 'x' }], ROUTE);
      expect(JSON.stringify(history)).not.toContain('fitness');
    });

    it('negative control: the same check finds fitness when it is kept', () => {
      expect(JSON.stringify(OBSERVED_PLAN)).toContain('greedy-baseline');
    });
  });

  it('reads the observed plan, and refuses one out of contract as unreadable', () => {
    expect(planFrom(OBSERVED_PLAN, ROUTE)).toEqual({
      id: 'f5ef374c',
      status: 'ACTIVE',
      horizonStart: '2026-11-12',
      horizonEnd: '2026-12-10',
      createdAt: '2026-11-12T20:41:50.396524Z',
      supersededAt: null,
      supersededByPlanId: null,
    });
    for (const broken of [
      { ...OBSERVED_PLAN, status: 'ARCHIVED' },
      { ...OBSERVED_PLAN, horizonEnd: '10/12/2026' },
      { ...OBSERVED_PLAN, createdAt: 'yesterday' },
      { ...OBSERVED_PLAN, id: undefined },
      null,
    ]) {
      expect(planOf(broken as never)).toBeNull();
    }
    expect(() => planFrom({}, ROUTE)).toThrow(TransportFailure);
    expect(() => plansFrom({}, ROUTE)).toThrow(TransportFailure);
  });

  describe('adherence', () => {
    it('absent ratio is "nothing fell due", never zero — whatever the counts', () => {
      expect(adherenceOf(undefined)).toEqual({ kind: 'nothing-due' });
      expect(adherenceOf({ plannedElapsed: 0, executed: 0 })).toEqual({ kind: 'nothing-due' });
      expect(adherenceOf({ plannedElapsed: 0, executed: 0, ratio: null })).toEqual({
        kind: 'nothing-due',
      });
    });

    it('a present ratio is measured, with both counts — 0 of 2 included (observed right after generating)', () => {
      expect(adherenceOf({ plannedElapsed: 2, executed: 0, ratio: 0.0 })).toEqual({
        kind: 'measured',
        executed: 0,
        plannedElapsed: 2,
        ratio: 0,
      });
      expect(adherenceOf({ plannedElapsed: 9, executed: 6, ratio: 0.6667 })).toMatchObject({
        kind: 'measured',
        executed: 6,
      });
    });

    it('a ratio without its counts, or negative, is unreadable', () => {
      expect(adherenceOf({ ratio: 0.5 })).toBeNull();
      expect(adherenceOf({ plannedElapsed: 2, executed: 1, ratio: -1 })).toBeNull();
      expect(adherenceOf('0.5')).toBeNull();
    });
  });

  it('reads the summary strictly, by subject, and refuses a share out of contract', () => {
    const body = {
      planId: 'p',
      status: 'ACTIVE',
      horizonStart: '2026-11-12',
      horizonEnd: '2026-12-10',
      totalPlannedMinutes: 820,
      bySubject: [
        { subjectId: 'a', subjectName: 'Anatomia Humana', plannedMinutes: 820, sessionCount: 15 },
      ],
      adherence: { plannedElapsed: 2, executed: 0, ratio: 0.0 },
    };
    expect(summaryFrom(body, ROUTE)).toMatchObject({
      totalPlannedMinutes: 820,
      bySubject: [{ subjectName: 'Anatomia Humana', sessionCount: 15 }],
      adherence: { kind: 'measured', plannedElapsed: 2 },
    });
    expect(() =>
      summaryFrom({ ...body, bySubject: [{ subjectId: 'a', plannedMinutes: 1 }] }, ROUTE),
    ).toThrow(TransportFailure);
    expect(() => summaryFrom({ ...body, adherence: { ratio: 1 } }, ROUTE)).toThrow(
      TransportFailure,
    );
  });

  it('reads sessions in sequence order, whatever order they come in', () => {
    const sessions = sessionsFrom(
      [
        { ...session({ id: 'b', sequenceIndex: 1 }), planId: 'p' },
        { ...session({ id: 'a', sequenceIndex: 0 }), planId: 'p' },
      ],
      ROUTE,
    );
    expect(sessions.map((s) => s.id)).toEqual(['a', 'b']);
    expect(() => sessionsFrom([{ id: 'x', kind: 'NAP' }], ROUTE)).toThrow(TransportFailure);
  });

  describe('current plan: a 404 is a state, not an error', () => {
    it('resource-not-found is `none`', () => {
      expect(
        currentPlanStateOf(undefined, problem('urn:sinapse:problem:resource-not-found')),
      ).toEqual({
        kind: 'none',
      });
    });

    it('a 429 is rate-limited with its wait, anything else a failure, nothing yet is loading', () => {
      expect(
        currentPlanStateOf(undefined, problem('urn:sinapse:problem:rate-limit-exceeded', 30)),
      ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 30 });
      expect(
        currentPlanStateOf(undefined, problem('urn:sinapse:problem:internal-error')).kind,
      ).toBe('failed');
      expect(currentPlanStateOf(undefined, new Error('?')).kind).toBe('failed');
      expect(currentPlanStateOf(undefined, undefined)).toEqual({ kind: 'loading' });
    });

    it('a 404 wrapped by httpResource (as `cause`) is still `none`', () => {
      const wrapped = new Error('wrapped', {
        cause: problem('urn:sinapse:problem:resource-not-found'),
      });
      expect(currentPlanStateOf(undefined, wrapped).kind).toBe('none');
    });
  });

  it('names a topic from the catalogue, and never by its identifier', () => {
    const catalogue: CatalogueMap = new Map([
      ['t1', { name: 'Osteologia do crânio', subjectId: 'a' }],
    ]);
    expect(topicNameOf('t1', catalogue)).toBe('Osteologia do crânio');
    const missing = topicNameOf('3922fcb1-cf4f-4932-baac-9727f778f4b4', catalogue);
    expect(missing).not.toContain('3922fcb1');
    expect(missing).toBe('Tópico que não está mais no catálogo');
  });

  it('counts how many of a subject’s topics the plan holds (15 of 35 observed)', () => {
    const catalogue: CatalogueMap = new Map(
      Array.from({ length: 35 }, (_, i) => [`t${i}`, { name: `T${i}`, subjectId: 'a' }] as const),
    );
    const sessions = Array.from({ length: 15 }, (_, i) => session({ topicId: `t${i}` }));
    sessions.push(session({ topicId: 't0' }));
    expect(coverageOf('a', sessions, catalogue)).toEqual({ scheduled: 15, total: 35 });
    expect(coverageOf('b', sessions, catalogue)).toEqual({ scheduled: 0, total: 0 });
  });

  it('counts sessions scheduled before the plan was created (observed: 2)', () => {
    const sessions = [
      session({ scheduledStart: '2026-11-12T10:00:00Z' }),
      session({ scheduledStart: '2026-11-12T10:25:00Z' }),
      session({ scheduledStart: '2026-11-16T22:00:00Z' }),
    ];
    expect(sessionsBeforeCreation(sessions, '2026-11-12T20:41:50.396524Z')).toBe(2);
    expect(sessionsBeforeCreation(sessions, '2026-11-01T00:00:00Z')).toBe(0);
  });

  it('starts from the first session whose time has not come, or none', () => {
    const sessions = [
      session({ id: 'past', scheduledStart: '2026-11-12T10:00:00Z' }),
      session({ id: 'next', scheduledStart: '2026-11-16T22:00:00Z' }),
      session({ id: 'later', scheduledStart: '2026-11-19T10:00:00Z' }),
    ];
    expect(nextSessionOf(sessions, Date.parse('2026-11-12T20:41:00Z'))?.id).toBe('next');
    expect(nextSessionOf(sessions, Date.parse('2026-12-01T00:00:00Z'))).toBeNull();
  });

  it('writes minutes as read aloud, in hours from 120', () => {
    expect(formatMinutes(25)).toBe('25 min');
    expect(formatMinutes(119)).toBe('119 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(820)).toBe('13 h 40 min');
  });

  it('finds the plan that replaced another in the history', () => {
    const plans = plansFrom(
      [
        { ...OBSERVED_PLAN, id: 'new' },
        {
          ...OBSERVED_PLAN,
          id: 'old',
          status: 'SUPERSEDED',
          supersededAt: '2026-11-12T20:55:00Z',
          supersededByPlanId: 'new',
        },
      ],
      ApiRoutes.planning.studyPlans,
    );
    expect(successorOf(plans[1], plans)?.id).toBe('new');
    expect(successorOf(plans[0], plans)).toBeNull();
  });
});
