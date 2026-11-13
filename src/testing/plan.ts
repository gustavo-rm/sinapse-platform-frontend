/**
 * A small stateful stand-in for the plan routes of FE-8 — the generation job, the plan in force,
 * its summary and sessions, the history, the catalogue topics of its subject, and `/me/state` —
 * with the shapes observed against `sinapse-platform@44f3d1f` under `local` (`docs/ai/STATE.md`,
 * *FE-8 walk-through*): identifiers omitted rather than null, `progress` absent, `fitness` the
 * Core's open map carrying `engine` and `build`.
 */
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { ApiRoutes } from '../app/core/api/api-routes';
import type { ProblemType } from '../app/core/api/contract/problem-type';
import { POLL_SCHEDULE, type PollSchedule } from '../app/features/plan/model/generation';
import { problemResponse } from './msw/problems';
import { mswPath } from './msw/handlers/handlers-from-snapshot';
import { ANATOMY, topicsOf } from './setup';

/** A fast ladder for specs: same shape as the real one, in milliseconds. */
export const FAST_SCHEDULE: PollSchedule = {
  fastMs: 5,
  fastUntilMs: 400,
  slowMs: 10,
  ceilingMs: 60_000,
};

/** The providers that put `FAST_SCHEDULE` in force, for specs outside the plan feature. */
export const FAST_POLLING = [{ provide: POLL_SCHEDULE, useValue: FAST_SCHEDULE }];

/**
 * What the Core reported, as the server passes it on. The two values a student must never see
 * are distinctive, so a leak check can search for them anywhere.
 */
export const FITNESS = {
  engine: 'motor-do-braco-experimental-que-nao-pode-vazar',
  build: 'build-0f1e2d3c4b5a69788796a5b4c3d2e1f0aabbccdd',
  strategy: 'estrategia-que-nao-pode-vazar',
  partial: true,
  'topics-total': 35,
  'topics-unscheduled-ids': ['id-de-topico-nao-agendado-que-nao-pode-vazar'],
  'availability-utilisation': 0.7593,
} as const;

export interface PlanBody {
  id: string;
  generationRequestId: string;
  horizonStart: string;
  horizonEnd: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  fitness?: unknown;
  createdAt: string;
  supersededAt?: string;
  supersededByPlanId?: string;
}

export function planBody(overrides: Partial<PlanBody> = {}): PlanBody {
  return {
    id: 'plan-1',
    generationRequestId: 'job-0',
    horizonStart: '2026-11-12',
    horizonEnd: '2026-12-10',
    status: 'ACTIVE',
    fitness: FITNESS,
    createdAt: '2026-11-12T20:41:50.396524Z',
    ...overrides,
  };
}

export interface SessionBody {
  id: string;
  planId: string;
  topicId: string;
  kind: 'STUDY' | 'REVISION';
  scheduledStart: string;
  durationMinutes: number;
  sequenceIndex: number;
}

/** Sessions on the observed pattern: Thursday 07:00 and Monday 19:00, São Paulo (10:00Z, 22:00Z). */
export function sessionsOf(planId: string, count = 4, topicPrefix = 'topic-'): SessionBody[] {
  const starts = [
    '2026-11-12T10:00:00Z',
    '2026-11-12T10:25:00Z',
    '2026-11-16T22:00:00Z',
    '2026-11-19T10:00:00Z',
    '2026-11-23T22:00:00Z',
    '2026-11-26T10:00:00Z',
  ];
  return Array.from({ length: count }, (_, index) => ({
    id: `${planId}-s${index}`,
    planId,
    topicId: `${topicPrefix}${index + 1}`,
    kind: index === 3 ? 'REVISION' : 'STUDY',
    scheduledStart: starts[index % starts.length],
    durationMinutes: [25, 50, 90, 60, 90, 60][index % 6],
    sequenceIndex: index,
  }));
}

export function summaryBody(
  plan: PlanBody,
  sessions: readonly SessionBody[],
  adherence: JsonBodyType = { plannedElapsed: 0, executed: 0 },
): JsonBodyType {
  const minutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  return {
    planId: plan.id,
    status: plan.status,
    horizonStart: plan.horizonStart,
    horizonEnd: plan.horizonEnd,
    createdAt: plan.createdAt,
    totalPlannedMinutes: minutes,
    bySubject: [
      {
        subjectId: ANATOMY.id,
        subjectName: ANATOMY.name,
        plannedMinutes: minutes,
        sessionCount: sessions.length,
      },
    ],
    adherence,
    fitness: plan.fitness,
    ...(plan.supersededByPlanId ? { supersededByPlanId: plan.supersededByPlanId } : {}),
  };
}

export interface JobBody {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'READY' | 'FAILED' | 'CANCELLED';
  horizonStart: string;
  horizonEnd: string;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  attemptCount: number;
  failureReason?: 'CORE_UNAVAILABLE' | 'CORE_REJECTED' | 'NOTHING_TO_PLAN' | 'INTERNAL';
  planId?: string;
  progress?: number;
}

export function jobBody(overrides: Partial<JobBody> = {}): JobBody {
  return {
    id: 'job-1',
    status: 'PENDING',
    horizonStart: '2026-11-12',
    horizonEnd: '2026-12-10',
    requestedAt: new Date().toISOString(),
    attemptCount: 0,
    ...overrides,
  };
}

/** A step of a job's life, as the next GET returns it; the last one repeats. */
export type JobStep = Partial<JobBody> | { problem: ProblemType; retryAfterSeconds?: number };

export interface PlanServerOptions {
  /** Every plan, newest first; the ACTIVE one is "current". Empty: no plan (404). */
  plans?: PlanBody[];
  /** The sessions of a plan. Default: four, on the observed pattern. */
  sessionsFor?: (planId: string) => SessionBody[];
  /** The adherence of a plan's summary. Default: nothing fallen due (no ratio). */
  adherenceFor?: (planId: string) => JsonBodyType;
  /** Topics of the plan's subject. Default: topic-1 … topic-35. */
  topics?: JsonBodyType;
  /** What `POST …/generation-requests` answers, in turn; the last repeats. Default: 201 PENDING. */
  posts?: (JobStep & { id?: string })[];
  /** What successive GETs of the job return; the last repeats. Default: PENDING, then READY. */
  steps?: JobStep[];
  /** `/me/state` beyond the plan and job identifiers, which the server keeps itself. */
  state?: Record<string, unknown>;
  /** A job already running when the screen opens. */
  runningJob?: string;
  /** Answer `GET current` (and the history) with this problem instead. */
  currentProblem?: { type: ProblemType; retryAfterSeconds?: number };
}

/** A recorded request: method and path. */
export interface Hit {
  readonly method: string;
  readonly path: string;
}

/** The plan backend. Records every request it answers. */
export function planServer(options: PlanServerOptions = {}) {
  let plans = [...(options.plans ?? [])];
  const hits: Hit[] = [];
  const sessionsFor = options.sessionsFor ?? ((planId: string) => sessionsOf(planId));
  const adherenceFor = options.adherenceFor ?? (() => ({ plannedElapsed: 0, executed: 0 }));
  const topics = options.topics ?? topicsOf(35);
  const posts = options.posts ?? [{}];
  const steps = options.steps ?? [{ status: 'PENDING' }, { status: 'READY' }];
  let runningJob: string | null = options.runningJob ?? null;
  let jobRequestedAt = new Date().toISOString();
  let postCount = 0;
  let stepIndex = 0;
  let nextPlan = 2;
  let extraState: Record<string, unknown> = { ...(options.state ?? {}) };
  let currentProblem = options.currentProblem ?? null;

  const active = () => plans.find((plan) => plan.status === 'ACTIVE') ?? null;
  const record = (request: Request) =>
    hits.push({ method: request.method, path: new URL(request.url).pathname });

  const stateBody = (): JsonBodyType => ({
    accountStatus: 'ACTIVE',
    timeZone: 'America/Sao_Paulo',
    pendingConsents: [],
    requiresMajorityReaffirmation: false,
    setupComplete: true,
    ...(active() ? { activePlanId: active()?.id } : {}),
    ...(runningJob ? { activeGenerationJobId: runningJob } : {}),
    ...extraState,
  });

  const finish = (job: JobBody) => {
    if (job.status === 'READY') {
      const id = job.planId ?? `plan-${nextPlan++}`;
      job.planId = id;
      const now = new Date().toISOString();
      if (!plans.some((plan) => plan.id === id)) {
        plans = [
          planBody({ id, generationRequestId: job.id, createdAt: now }),
          ...plans.map((plan) =>
            plan.status === 'ACTIVE'
              ? {
                  ...plan,
                  status: 'SUPERSEDED' as const,
                  supersededAt: now,
                  supersededByPlanId: id,
                }
              : plan,
          ),
        ];
      }
    }
    if (job.status === 'READY' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      runningJob = null;
    }
  };

  const handlers = [
    http.get(ApiRoutes.readModel.myState, ({ request }) => {
      record(request);
      return HttpResponse.json(stateBody());
    }),
    http.post(ApiRoutes.planning.generationRequests, ({ request }) => {
      record(request);
      const step = posts[Math.min(postCount++, posts.length - 1)];
      if ('problem' in step) {
        return problemResponse(step.problem, { retryAfterSeconds: step.retryAfterSeconds });
      }
      jobRequestedAt = new Date().toISOString();
      const job = jobBody({ id: step.id ?? 'job-1', requestedAt: jobRequestedAt, ...step });
      runningJob = job.id;
      stepIndex = 0;
      return HttpResponse.json(job, { status: 201 });
    }),
    http.get(mswPath(ApiRoutes.planning.generationRequest.template), ({ params, request }) => {
      record(request);
      const step = steps[Math.min(stepIndex++, steps.length - 1)];
      if ('problem' in step) {
        return problemResponse(step.problem, { retryAfterSeconds: step.retryAfterSeconds });
      }
      // As the server counts: 0 until a worker claims the job, then one per attempt.
      const job = jobBody({
        id: params['requestId'] as string,
        requestedAt: jobRequestedAt,
        attemptCount: step.status === 'PENDING' || step.status === undefined ? 0 : 1,
        ...step,
      });
      if (job.status === 'FAILED' && job.failureReason === undefined) {
        job.failureReason = 'INTERNAL';
      }
      finish(job);
      return HttpResponse.json(job);
    }),
    http.get(ApiRoutes.planning.currentStudyPlan, ({ request }) => {
      record(request);
      if (currentProblem) {
        return problemResponse(currentProblem.type, {
          retryAfterSeconds: currentProblem.retryAfterSeconds,
        });
      }
      const plan = active();
      return plan === null
        ? problemResponse('urn:sinapse:problem:resource-not-found')
        : HttpResponse.json(plan as unknown as JsonBodyType);
    }),
    http.get(ApiRoutes.planning.studyPlans, ({ request }) => {
      record(request);
      if (currentProblem) {
        return problemResponse(currentProblem.type, {
          retryAfterSeconds: currentProblem.retryAfterSeconds,
        });
      }
      return HttpResponse.json(plans as unknown as JsonBodyType);
    }),
    http.get(mswPath(ApiRoutes.planning.studyPlan.template), ({ params, request }) => {
      record(request);
      const plan = plans.find((candidate) => candidate.id === params['planId']);
      return plan
        ? HttpResponse.json(plan as unknown as JsonBodyType)
        : problemResponse('urn:sinapse:problem:resource-not-found');
    }),
    http.get(mswPath(ApiRoutes.readModel.planSummary.template), ({ params, request }) => {
      record(request);
      const plan = plans.find((candidate) => candidate.id === params['planId']);
      return plan
        ? HttpResponse.json(summaryBody(plan, sessionsFor(plan.id), adherenceFor(plan.id)))
        : problemResponse('urn:sinapse:problem:resource-not-found');
    }),
    http.get(mswPath(ApiRoutes.planning.studyPlanSessions.template), ({ params, request }) => {
      record(request);
      return HttpResponse.json(sessionsFor(params['planId'] as string) as unknown as JsonBodyType);
    }),
    http.get(mswPath(ApiRoutes.curriculum.subjectTopics.template), ({ request }) => {
      record(request);
      return HttpResponse.json(topics);
    }),
  ];

  return {
    handlers,
    hits,
    plans: () => plans,
    count: (method: string, pathPart: string) =>
      hits.filter((hit) => hit.method === method && hit.path.includes(pathPart)).length,
    setState: (next: Record<string, unknown>) => (extraState = { ...next }),
    setCurrentProblem: (problem: { type: ProblemType; retryAfterSeconds?: number } | null) =>
      (currentProblem = problem),
    startRunning: (id: string) => {
      runningJob = id;
      jobRequestedAt = new Date().toISOString();
      stepIndex = 0;
    },
  };
}
