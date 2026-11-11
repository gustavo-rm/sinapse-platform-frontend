/**
 * A small stateful stand-in for the planning and curriculum routes of FE-7 (availability, goals,
 * subjects, topics), for the setup and account-area screens. The bodies have the shapes observed
 * against `sinapse-platform@46b5b3c` under `local`: times echoed as `HH:mm:ss` (F19), `effectiveUntil`
 * and `targetDate` absent rather than null when there is none.
 *
 * Which windows are "in force" on the `on` date is the test's to say (`inForceOn`): the client
 * must take the server's answer, never compute it.
 */
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { ApiRoutes } from '../app/core/api/api-routes';
import { mswPath } from './msw/handlers/handlers-from-snapshot';
import { type RecordedRequest, bodyOf } from './privacy';

export const ANATOMY = { id: '325584ba-e78f-4558-ad38-5d82eda06349', name: 'Anatomia Humana' };
export const PHYSIOLOGY = { id: '7a1e9a4c-0c39-4d5a-9a43-5f0b0b9a1f01', name: 'Fisiologia' };

/** The real catalogue's 35 topic names of MED-ANAT, in curricular order (first three shown). */
export function topicsOf(count: number, prefix = 'Tópico'): JsonBodyType {
  return Array.from({ length: count }, (_, index) => ({
    id: `topic-${index + 1}`,
    name: `${prefix} ${index + 1}`,
    position: index + 1,
  }));
}

export interface WindowBody {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface GoalBody {
  id: string;
  subjectId: string;
  targetDate?: string;
  priority: number;
  status: 'ACTIVE' | 'ACHIEVED' | 'ABANDONED';
  createdAt: string;
  closedAt?: string;
}

export function windowBody(overrides: Partial<WindowBody> = {}): WindowBody {
  return {
    id: 'w-1',
    dayOfWeek: 'TUESDAY',
    startTime: '19:00:00',
    endTime: '21:00:00',
    effectiveFrom: '2026-11-01',
    ...overrides,
  };
}

export function goalBody(overrides: Partial<GoalBody> = {}): GoalBody {
  return {
    id: 'g-1',
    subjectId: ANATOMY.id,
    priority: 3,
    status: 'ACTIVE',
    createdAt: '2026-11-11T17:22:04.247017Z',
    ...overrides,
  };
}

export interface SetupServerOptions {
  windows?: WindowBody[];
  goals?: GoalBody[];
  subjects?: JsonBodyType[];
  topics?: JsonBodyType;
  /** Which windows the server lists for `?on=`. Default: every open one and every closed one whose last day is on or after `on`. */
  inForceOn?: (window: WindowBody, on: string) => boolean;
}

/** A mutable server for the FE-7 routes; records every write and every `on` asked for. */
export function setupServer(options: SetupServerOptions = {}) {
  let windows = [...(options.windows ?? [])];
  let goals = [...(options.goals ?? [])];
  const subjects = options.subjects ?? [ANATOMY];
  const topics = options.topics ?? topicsOf(3);
  const inForceOn =
    options.inForceOn ??
    ((window: WindowBody, on: string) =>
      window.effectiveFrom <= on &&
      (window.effectiveUntil === undefined || window.effectiveUntil >= on));
  const writes: RecordedRequest[] = [];
  const onDates: (string | null)[] = [];
  let nextWindow = 100;
  let nextGoal = 100;

  const handlers = [
    http.get(ApiRoutes.planning.availability, ({ request }) => {
      const on = new URL(request.url).searchParams.get('on');
      onDates.push(on);
      return HttpResponse.json(on === null ? windows : windows.filter((w) => inForceOn(w, on)));
    }),
    http.post(ApiRoutes.planning.availability, async ({ request }) => {
      const body = (await bodyOf(request)) as Omit<WindowBody, 'id'>;
      writes.push({ method: 'POST', path: ApiRoutes.planning.availability, body });
      const created: WindowBody = {
        id: `w-${nextWindow++}`,
        ...body,
        startTime: `${body.startTime}:00`,
        endTime: `${body.endTime}:00`,
      };
      windows = [...windows, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.post(
      mswPath(ApiRoutes.planning.availabilityClosure.template),
      async ({ params, request }) => {
        const body = (await bodyOf(request)) as { effectiveUntil: string };
        const id = params['windowId'] as string;
        writes.push({
          method: 'POST',
          path: ApiRoutes.planning.availabilityClosure({ windowId: id }),
          body,
        });
        windows = windows.map((w) =>
          w.id === id ? { ...w, effectiveUntil: body.effectiveUntil } : w,
        );
        return HttpResponse.json(windows.find((w) => w.id === id));
      },
    ),
    http.get(ApiRoutes.planning.goals, () => HttpResponse.json(goals)),
    http.post(ApiRoutes.planning.goals, async ({ request }) => {
      const body = (await bodyOf(request)) as {
        subjectId: string;
        priority?: number;
        targetDate?: string;
      };
      writes.push({ method: 'POST', path: ApiRoutes.planning.goals, body });
      const created: GoalBody = goalBody({
        id: `g-${nextGoal++}`,
        subjectId: body.subjectId,
        priority: body.priority ?? 3,
        ...(body.targetDate === undefined ? {} : { targetDate: body.targetDate }),
      });
      goals = [created, ...goals];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(mswPath(ApiRoutes.planning.goal.template), async ({ params, request }) => {
      const body = (await bodyOf(request)) as { priority: number; targetDate?: string };
      const id = params['goalId'] as string;
      writes.push({ method: 'PATCH', path: ApiRoutes.planning.goal({ goalId: id }), body });
      // The server's own semantics: an omitted targetDate CLEARS the date.
      goals = goals.map((g) => {
        if (g.id !== id) return g;
        const rest: GoalBody = { ...g };
        delete rest.targetDate;
        return {
          ...rest,
          priority: body.priority,
          ...(body.targetDate === undefined ? {} : { targetDate: body.targetDate }),
        };
      });
      return HttpResponse.json(goals.find((g) => g.id === id));
    }),
    ...(['goalAbandonment', 'goalAchievement'] as const).map((route) =>
      http.post(mswPath(ApiRoutes.planning[route].template), ({ params }) => {
        const id = params['goalId'] as string;
        writes.push({
          method: 'POST',
          path: ApiRoutes.planning[route]({ goalId: id }),
          body: undefined,
        });
        goals = goals.map((g) =>
          g.id === id
            ? {
                ...g,
                status: route === 'goalAbandonment' ? 'ABANDONED' : 'ACHIEVED',
                closedAt: '2026-11-11T18:00:00Z',
              }
            : g,
        );
        return HttpResponse.json(goals.find((g) => g.id === id));
      }),
    ),
    http.get(ApiRoutes.curriculum.subjects, () => HttpResponse.json(subjects)),
    http.get(mswPath(ApiRoutes.curriculum.subjectTopics.template), () => HttpResponse.json(topics)),
  ];

  return {
    handlers,
    writes,
    onDates,
    windows: () => windows,
    goals: () => goals,
    setGoals: (next: GoalBody[]) => (goals = next),
  };
}

/** A 400 `validation-failed` with the server's own field names. */
export function validationFailed(fields: string[]): HttpResponse<JsonBodyType> {
  return HttpResponse.json(
    {
      type: 'urn:sinapse:problem:validation-failed',
      title: 'Validation failed',
      status: 400,
      detail: 'One or more fields of the request are invalid. See the errors array.',
      instance: ApiRoutes.planning.availability,
      errors: fields.map((field) => ({ field, message: 'English text that must never be shown' })),
    },
    { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
