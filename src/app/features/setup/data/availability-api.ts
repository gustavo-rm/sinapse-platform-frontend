import type { HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { isApiFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type {
  AvailabilityClosureRequest,
  AvailabilityRequest,
  AvailabilityResponse,
} from '../../../core/api/contract/models';
import { localTimeToWire } from '../../../core/time/local-time';
import {
  type AvailabilityDraft,
  type AvailabilityWindow,
  type CloseOutcome,
  type DeclareOutcome,
  closeFailureOf,
  declareFailureOf,
  windowFrom,
  windowsFrom,
} from '../model/availability';

/**
 * The availability routes, as this feature uses them. Reads are resources (call them from a field
 * initialiser); writes are imperative and return an outcome decided by the problem `type`.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityApi {
  private readonly api = inject(ApiClient);

  /**
   * `GET /api/v1/availability?on=<date>`: the windows in force on that day. The date is the
   * CALLER's — "these are local times in the account's own zone and the server does not decide
   * what day it is for somebody else" — so `on` must return today in the account's zone
   * (`AccountTimeService.today`), never the browser's. While it returns undefined, nothing is read.
   */
  windowsOn(on: () => string | undefined): HttpResourceRef<AvailabilityWindow[] | undefined> {
    const route = ApiRoutes.planning.availability;
    return this.api.read<AvailabilityWindow[]>(
      () => {
        const date = on();
        return date === undefined ? undefined : { url: route, params: { on: date } };
      },
      { parse: (body) => windowsFrom(body, route) },
    );
  }

  /**
   * `GET /api/v1/availability` without a date: every window ever declared, closed ones included —
   * "which is what lets a client show the routine and its history". Never filtered here by date:
   * which windows apply today is the server's answer to `windowsOn`.
   */
  everyWindow(): HttpResourceRef<AvailabilityWindow[] | undefined> {
    const route = ApiRoutes.planning.availability;
    return this.api.read<AvailabilityWindow[]>(() => ({ url: route }), {
      parse: (body) => windowsFrom(body, route),
    });
  }

  /** `POST /api/v1/availability`. Times go out as `HH:mm` (F19); an empty end date is omitted. */
  async declare(draft: AvailabilityDraft): Promise<DeclareOutcome> {
    if (draft.dayOfWeek === '') {
      throw new RangeError('A window needs a weekday.');
    }
    const body: AvailabilityRequest = {
      dayOfWeek: draft.dayOfWeek,
      startTime: localTimeToWire(draft.startTime),
      endTime: localTimeToWire(draft.endTime),
      effectiveFrom: draft.effectiveFrom,
      ...(draft.effectiveUntil === '' ? {} : { effectiveUntil: draft.effectiveUntil }),
    };
    try {
      const echoed = await firstValueFrom(
        this.api.post<AvailabilityResponse>(ApiRoutes.planning.availability, body),
      );
      return { kind: 'declared', window: windowFrom(echoed) };
    } catch (error) {
      if (isApiFailure(error)) {
        return declareFailureOf(error);
      }
      throw error;
    }
  }

  /**
   * `POST /api/v1/availability/{windowId}/closure`: the last day the window applies, inclusive.
   * Not a deletion — the window stays on record, "keeping saying what it said for the period it
   * covered. That is what a past plan was generated against."
   */
  async close(windowId: string, effectiveUntil: string): Promise<CloseOutcome> {
    const body: AvailabilityClosureRequest = { effectiveUntil };
    try {
      await firstValueFrom(
        this.api.post<AvailabilityResponse>(
          ApiRoutes.planning.availabilityClosure({ windowId }),
          body,
        ),
      );
      return { kind: 'closed' };
    } catch (error) {
      if (isApiFailure(error)) {
        return closeFailureOf(error);
      }
      throw error;
    }
  }
}
