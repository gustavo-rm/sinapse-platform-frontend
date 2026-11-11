import type { HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { GoalResponse } from '../../../core/api/contract/models';
import {
  type Goal,
  type GoalActOutcome,
  type GoalDraft,
  type RevisionDraft,
  type SetGoalOutcome,
  type Subject,
  type Topic,
  goalActFailureOf,
  goalFrom,
  goalRequestOf,
  goalsFrom,
  revisionRequestOf,
  setGoalFailureOf,
  subjectsFrom,
  topicsFrom,
} from '../model/goals';

/** The goal and catalogue routes, as this feature uses them. */
@Injectable({ providedIn: 'root' })
export class GoalsApi {
  private readonly api = inject(ApiClient);

  /** `GET /api/v1/goals`: every goal set, closed ones included. */
  goals(): HttpResourceRef<Goal[] | undefined> {
    const route = ApiRoutes.planning.goals;
    return this.api.read<Goal[]>(() => ({ url: route }), {
      parse: (body) => goalsFrom(body, route),
    });
  }

  /** `GET /api/v1/subjects`: the catalogue's subjects. */
  subjects(): HttpResourceRef<Subject[] | undefined> {
    const route = ApiRoutes.curriculum.subjects;
    return this.api.read<Subject[]>(() => ({ url: route }), {
      parse: (body) => subjectsFrom(body, route),
    });
  }

  /** `GET /api/v1/subjects/{subjectId}/topics`, for the subject `subjectId` returns; idle on null. */
  topics(subjectId: () => string | null): HttpResourceRef<Topic[] | undefined> {
    return this.api.read<Topic[]>(
      () => {
        const id = subjectId();
        return id === null
          ? undefined
          : { url: ApiRoutes.curriculum.subjectTopics({ subjectId: id }) };
      },
      { parse: (body) => topicsFrom(body, ApiRoutes.curriculum.subjectTopics.template) },
    );
  }

  /** `POST /api/v1/goals`. */
  async set(draft: GoalDraft): Promise<SetGoalOutcome> {
    try {
      const body = await firstValueFrom(
        this.api.post<GoalResponse>(ApiRoutes.planning.goals, goalRequestOf(draft)),
      );
      return { kind: 'set', goal: goalFrom(body) };
    } catch (error) {
      if (isApiFailure(error)) {
        return setGoalFailureOf(error);
      }
      throw error;
    }
  }

  /** `PATCH /api/v1/goals/{goalId}`, with BOTH values the form holds (see `revisionDraftOf`). */
  revise(goalId: string, draft: RevisionDraft): Promise<GoalActOutcome> {
    return this.act(
      this.api.patch<GoalResponse>(ApiRoutes.planning.goal({ goalId }), revisionRequestOf(draft)),
    );
  }

  /** `POST /api/v1/goals/{goalId}/abandonment`. Not a deletion: the goal stays, closed. */
  abandon(goalId: string): Promise<GoalActOutcome> {
    return this.act(this.api.post<GoalResponse>(ApiRoutes.planning.goalAbandonment({ goalId })));
  }

  /** `POST /api/v1/goals/{goalId}/achievement`. */
  achieve(goalId: string): Promise<GoalActOutcome> {
    return this.act(this.api.post<GoalResponse>(ApiRoutes.planning.goalAchievement({ goalId })));
  }

  private async act(request: Observable<GoalResponse>): Promise<GoalActOutcome> {
    try {
      return { kind: 'done', goal: goalFrom(await firstValueFrom(request)) };
    } catch (error) {
      if (isApiFailure(error)) {
        return goalActFailureOf(error);
      }
      throw error;
    }
  }
}
