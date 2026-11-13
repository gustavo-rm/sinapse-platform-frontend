import type { HttpResourceRef } from '@angular/common/http';
import { Injectable, type ResourceRef, inject, resource } from '@angular/core';
import { firstValueFrom, forkJoin, of } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import {
  type GenerationJob,
  type RequestOutcome,
  jobFrom,
  requestFailureOf,
} from '../model/generation';
import {
  type CatalogueMap,
  type Plan,
  type PlanSummary,
  type PlannedSession,
  planFrom,
  plansFrom,
  sessionsFrom,
  summaryFrom,
  topicEntriesFrom,
} from '../model/plan';

/** The plan routes, as this feature uses them. Every read drops `fitness` at the parse. */
@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly api = inject(ApiClient);

  /**
   * `GET /api/v1/study-plans/current`. A 404 is not a failure of this read: "A student with no plan
   * yet has not run the generation job, or its last run has not finished" — `currentPlanOf` reads it
   * as `none`.
   */
  current(): HttpResourceRef<Plan | undefined> {
    const route = ApiRoutes.planning.currentStudyPlan;
    return this.api.read<Plan>(() => ({ url: route }), {
      parse: (body) => planFrom(body, route),
    });
  }

  /** `GET /api/v1/study-plans/{planId}/summary`, for the plan `planId` returns; idle on null. */
  summary(planId: () => string | null): HttpResourceRef<PlanSummary | undefined> {
    return this.api.read<PlanSummary>(
      () => {
        const id = planId();
        return id === null ? undefined : { url: ApiRoutes.readModel.planSummary({ planId: id }) };
      },
      { parse: (body) => summaryFrom(body, ApiRoutes.readModel.planSummary.template) },
    );
  }

  /** `GET /api/v1/study-plans/{planId}/sessions`, in sequence; idle on null. */
  sessions(planId: () => string | null): HttpResourceRef<PlannedSession[] | undefined> {
    return this.api.read<PlannedSession[]>(
      () => {
        const id = planId();
        return id === null
          ? undefined
          : { url: ApiRoutes.planning.studyPlanSessions({ planId: id }) };
      },
      { parse: (body) => sessionsFrom(body, ApiRoutes.planning.studyPlanSessions.template) },
    );
  }

  /** `GET /api/v1/study-plans`: every plan, newest first, superseded ones included. */
  history(): HttpResourceRef<Plan[] | undefined> {
    const route = ApiRoutes.planning.studyPlans;
    return this.api.read<Plan[]>(() => ({ url: route }), {
      parse: (body) => plansFrom(body, route),
    });
  }

  /**
   * The catalogue map — `topicId` → name and subject — for the subjects `subjectIds` returns, built
   * once from `GET /api/v1/subjects/{subjectId}/topics` (the route the contract names for resolving a
   * topic's name, F2) and reused by every list on the screen. The subjects are the plan's own,
   * from its summary: no other subject can name a session of it. Idle on null.
   */
  catalogue(subjectIds: () => readonly string[] | null): ResourceRef<CatalogueMap | undefined> {
    return resource({
      params: () => {
        const ids = subjectIds();
        return ids === null ? undefined : { ids: [...ids] };
      },
      loader: async ({ params }) => {
        const requests = params.ids.map((subjectId) =>
          this.api.get<unknown>(ApiRoutes.curriculum.subjectTopics({ subjectId })),
        );
        const bodies = await firstValueFrom(requests.length === 0 ? of([]) : forkJoin(requests));
        return new Map(
          bodies.flatMap((body, index) =>
            topicEntriesFrom(body, params.ids[index], ApiRoutes.curriculum.subjectTopics.template),
          ),
        );
      },
    });
  }

  /** `POST /api/v1/study-plans/generation-requests`, no body. */
  async requestGeneration(): Promise<RequestOutcome> {
    const route = ApiRoutes.planning.generationRequests;
    try {
      const body = await firstValueFrom(this.api.post<unknown>(route));
      return { kind: 'queued', job: jobFrom(body, route, 'POST') };
    } catch (error) {
      if (isApiFailure(error)) {
        return requestFailureOf(error);
      }
      throw error;
    }
  }

  /** `GET /api/v1/study-plans/generation-requests/{requestId}`: one check of a job. Rejects with an `ApiFailure`. */
  async generationRequest(requestId: string): Promise<GenerationJob> {
    const body = await firstValueFrom(
      this.api.get<unknown>(ApiRoutes.planning.generationRequest({ requestId })),
    );
    return jobFrom(body, ApiRoutes.planning.generationRequest.template, 'GET');
  }
}
