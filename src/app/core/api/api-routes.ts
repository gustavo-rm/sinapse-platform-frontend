/**
 * Every route of the API, and the only file in this repository that holds the literal `/api/`
 * (`CLAUDE.md` R2; `eslint.boundaries.js` exempts this file and no other).
 *
 * Structured by backend module, mirroring its `*Routes` classes (`IdentityRoutes`,
 * `PlanningRoutes`, `LearningRecordRoutes`, `ReadModelRoutes`, `EducationalRoutes`,
 * `DataRightsRoutes`, `CurriculumRoutes`); where a path lives in a module is where its controller
 * lives. Derived mechanically from the `paths` of the vendored snapshot (`contract/openapi.json`,
 * 51 paths, 59 operations), then named by hand. `api-routes.spec.ts` proves the set of paths here
 * equals the set in the snapshot, in both directions.
 *
 * Relative paths only: same origin is an architectural premise. A path with parameters is a
 * function of a named-parameter object; each value is percent-encoded as one path segment.
 * The development-only `/api/v1/probe/**` routes are not here: the snapshot is taken with no
 * profile, and they do not exist in a deployment.
 */

/** The `{name}` parameters of a path template, as a union of names. */
type ParamNames<T extends string> = T extends `${string}{${infer Name}}${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

/** The argument a parameterised route takes: one string per `{name}` of its template. */
// A mapped type, not `Record<…, string>`: that shape is reserved to the label catalogues (R5).
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export type PathParams<T extends string> = { readonly [K in ParamNames<T>]: string };

/** A route with path parameters: call it with them; read `template` for the unexpanded form. */
export interface ParameterisedRoute<T extends string> {
  (params: PathParams<T>): string;
  /** The path as the OpenAPI snapshot writes it, `{name}` placeholders included. */
  readonly template: T;
}

/** A route: a fixed path, or a function of its path parameters. */
export type ApiRoute = string | ParameterisedRoute<string>;

const PLACEHOLDER = /\{([^}]+)\}/g;

function parameterised<const T extends string>(template: T): ParameterisedRoute<T> {
  const expand = (params: PathParams<T>): string =>
    template.replace(PLACEHOLDER, (_, name: string) => {
      const value = (params as Record<string, string | undefined>)[name];
      if (value === undefined || value === '') {
        throw new RangeError(`Missing path parameter "${name}" for ${template}.`);
      }
      return encodeURIComponent(value);
    });
  return Object.assign(expand, { template });
}

export const ApiRoutes = {
  /** `identity` — accounts, login sessions, passwords, consent and terms. */
  identity: {
    accounts: '/api/v1/accounts',
    emailVerifications: '/api/v1/email-verifications',
    passwordChanges: '/api/v1/password-changes',
    passwordResets: '/api/v1/password-resets',
    passwordResetConfirmation: '/api/v1/password-resets/confirmation',
    sessions: '/api/v1/sessions',
    currentSession: '/api/v1/sessions/current',
    session: parameterised('/api/v1/sessions/{sessionId}'),
    consents: '/api/v1/consents',
    consentReaffirmation: '/api/v1/consents/reaffirmation',
    consent: parameterised('/api/v1/consents/{purpose}'),
    terms: '/api/v1/terms',
  },
  /** `planning` — availability, goals, plans, planned sessions and plan generation. */
  planning: {
    availability: '/api/v1/availability',
    availabilityClosure: parameterised('/api/v1/availability/{windowId}/closure'),
    goals: '/api/v1/goals',
    goal: parameterised('/api/v1/goals/{goalId}'),
    goalAbandonment: parameterised('/api/v1/goals/{goalId}/abandonment'),
    goalAchievement: parameterised('/api/v1/goals/{goalId}/achievement'),
    plannedSessions: '/api/v1/planned-sessions',
    studyPlans: '/api/v1/study-plans',
    currentStudyPlan: '/api/v1/study-plans/current',
    studyPlan: parameterised('/api/v1/study-plans/{planId}'),
    studyPlanSessions: parameterised('/api/v1/study-plans/{planId}/sessions'),
    generationRequests: '/api/v1/study-plans/generation-requests',
    generationRequest: parameterised('/api/v1/study-plans/generation-requests/{requestId}'),
  },
  /** `learningrecord` — study sessions, live and retroactive. */
  learningRecord: {
    studySessions: '/api/v1/study-sessions',
    currentStudySession: '/api/v1/study-sessions/current',
    retroactiveEntries: '/api/v1/study-sessions/retroactive-entries',
    studySessionAbandonment: parameterised('/api/v1/study-sessions/{sessionId}/abandonment'),
    studySessionCompletion: parameterised('/api/v1/study-sessions/{sessionId}/completion'),
  },
  /** `readmodel` — the screen-shaped reads. */
  readModel: {
    myState: '/api/v1/me/state',
    myAgenda: '/api/v1/me/agenda',
    planSummary: parameterised('/api/v1/study-plans/{planId}/summary'),
    classroomStudents: parameterised('/api/v1/classrooms/{classroomId}/students'),
    studentPanel: parameterised('/api/v1/classrooms/{classroomId}/students/{accountId}/panel'),
  },
  /** `educational` — classrooms, invites and enrollments. */
  educational: {
    classrooms: '/api/v1/classrooms',
    classroomArchival: parameterised('/api/v1/classrooms/{classroomId}/archival'),
    classroomEnrollments: parameterised('/api/v1/classrooms/{classroomId}/enrollments'),
    classroomInvites: parameterised('/api/v1/classrooms/{classroomId}/invites'),
    classroomStudent: parameterised('/api/v1/classrooms/{classroomId}/students/{accountId}'),
    enrollments: '/api/v1/enrollments',
    enrollment: parameterised('/api/v1/enrollments/{enrollmentId}'),
    invite: parameterised('/api/v1/invites/{inviteId}'),
    invitePreview: parameterised('/api/v1/invites/{code}/preview'),
    inviteRedemptions: parameterised('/api/v1/invites/{code}/redemptions'),
  },
  /** `datarights` — the data subject's rights under the LGPD. */
  dataRights: {
    accessDisclosure: '/api/v1/me/access-disclosure',
    dataExport: '/api/v1/me/data-export',
    erasureRequests: '/api/v1/me/erasure-requests',
    erasureRequestCancellation: parameterised(
      '/api/v1/me/erasure-requests/{requestId}/cancellation',
    ),
  },
  /** `curriculum` — the read-only catalogue. */
  curriculum: {
    subjects: '/api/v1/subjects',
    subjectTopics: parameterised('/api/v1/subjects/{subjectId}/topics'),
  },
} as const;

/**
 * DEVELOPMENT ONLY. The diagnostic routes of the backend's `ProbeController`, which exists under
 * the `local` and `test` profiles and nowhere else (a deployment answers 404). They are not in
 * the snapshot, which is taken with no profile, and so not in `ApiRoutes`; `api-routes.spec.ts`
 * holds them out of it. Used only by the opt-in check against a running local backend
 * (`live-backend.spec.ts`). No feature may call them.
 */
export const DevProbeRoutes = {
  ping: '/api/v1/probe/ping',
  failure: '/api/v1/probe/failure',
  validation: '/api/v1/probe/validation',
  rateLimited: '/api/v1/probe/rate-limited',
} as const;

/** Every route of `ApiRoutes`, unexpanded, as the snapshot writes it. */
export const ROUTE_TEMPLATES: readonly string[] = Object.values(ApiRoutes).flatMap((group) =>
  Object.values(group as Record<string, ApiRoute>).map((route) =>
    typeof route === 'string' ? route : route.template,
  ),
);

const TEMPLATE_MATCHERS = ROUTE_TEMPLATES.map((template) => ({
  template,
  pattern: new RegExp(
    `^${template
      .split(PLACEHOLDER)
      .map((part, index) =>
        index % 2 === 1 ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('')}$`,
  ),
}));

/**
 * The template a concrete request path was expanded from, without its query string — what a log
 * line may carry. A path parameter can be personal (an invite `code` is a credential), so a log
 * names `/api/v1/invites/{code}/preview`, never the path that was called. A fixed path wins over a
 * template that would also match it (`/sessions/current` over `/sessions/{sessionId}`).
 * Returns null for a path that is not an API route.
 */
export function routeTemplateOf(url: string): string | null {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if (ROUTE_TEMPLATES.includes(path)) {
    return path;
  }
  return TEMPLATE_MATCHERS.find(({ pattern }) => pattern.test(path))?.template ?? null;
}
