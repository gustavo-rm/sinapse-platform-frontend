import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpResponse, delay, http } from 'msw';
import { firstValueFrom } from 'rxjs';

import { problemAt } from '../../../testing/msw/scenarios';
import { useMswServer } from '../../../testing/msw/server';
import { appConfig } from '../../app.config';
import {
  ACCEPT,
  ApiClient,
  DATA_EXPORT_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  timeoutFor,
} from './api-client';
import { TransportFailure, apiFailureOf, isConflict } from './api-problem';
import { ApiRoutes, routeTemplateOf } from './api-routes';
import { instant, localDate } from './wire';

describe('ApiClient — the shape of every request', () => {
  let api: ApiClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiClient);
    backend = TestBed.inject(HttpTestingController);
  });
  afterEach(() => backend.verify());

  it.each([
    ['GET', () => api.get(ApiRoutes.planning.goals)],
    ['POST', () => api.post(ApiRoutes.planning.goals, {})],
    ['PATCH', () => api.patch(ApiRoutes.planning.goal({ goalId: 'g1' }), {})],
    ['DELETE', () => api.delete(ApiRoutes.identity.currentSession)],
  ])('%s: relative path, credentials, Accept and the 30 s timeout', (method, call) => {
    call().subscribe();
    const request = backend.expectOne(() => true).request;
    expect(request.method).toBe(method);
    expect(routeTemplateOf(request.url)).not.toBeNull();
    expect(request.url).toMatch(/^\/[a-z]/);
    expect(request.withCredentials).toBe(true);
    expect(request.headers.get('Accept')).toBe(ACCEPT);
    expect(request.timeout).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('gives the data export a longer timeout, and only it', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(DATA_EXPORT_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    expect(timeoutFor(ApiRoutes.dataRights.dataExport)).toBe(DATA_EXPORT_TIMEOUT_MS);
    expect(timeoutFor(ApiRoutes.dataRights.accessDisclosure)).toBe(DEFAULT_TIMEOUT_MS);

    api.get(ApiRoutes.dataRights.dataExport).subscribe();
    expect(backend.expectOne(ApiRoutes.dataRights.dataExport).request.timeout).toBe(
      DATA_EXPORT_TIMEOUT_MS,
    );
  });

  it('serialises an instant with its offset and leaves a local date untouched', () => {
    api
      .get(ApiRoutes.readModel.myAgenda, {
        params: {
          from: new Date(Date.UTC(2026, 10, 9, 3, 0)),
          to: instant('2026-11-10T00:00:00-03:00'),
        },
      })
      .subscribe();
    const agenda = backend.expectOne((r) => r.url === ApiRoutes.readModel.myAgenda).request;
    expect(agenda.params.get('from')).toBe('2026-11-09T03:00:00.000Z');
    expect(agenda.params.get('to')).toBe('2026-11-10T00:00:00-03:00');

    api
      .get(ApiRoutes.planning.availability, { params: { on: localDate('2026-11-09') } })
      .subscribe();
    const availability = backend.expectOne(
      (r) => r.url === ApiRoutes.planning.availability,
    ).request;
    expect(availability.params.get('on')).toBe('2026-11-09');
    expect(availability.urlWithParams).toBe(`${ApiRoutes.planning.availability}?on=2026-11-09`);
  });

  it('sends a body with each Date as an instant and local values as written', () => {
    api
      .post(ApiRoutes.learningRecord.retroactiveEntries, {
        startedAt: new Date(Date.UTC(2026, 10, 8, 22, 15)),
        kind: 'STUDY',
      })
      .subscribe();
    api
      .post(ApiRoutes.planning.availability, {
        dayOfWeek: 'TUESDAY',
        startTime: '19:00',
        endTime: '21:00',
        effectiveFrom: '2026-11-10',
      })
      .subscribe();
    expect(backend.expectOne(ApiRoutes.learningRecord.retroactiveEntries).request.body).toEqual({
      startedAt: '2026-11-08T22:15:00.000Z',
      kind: 'STUDY',
    });
    expect(backend.expectOne(ApiRoutes.planning.availability).request.body).toEqual({
      dayOfWeek: 'TUESDAY',
      startTime: '19:00',
      endTime: '21:00',
      effectiveFrom: '2026-11-10',
    });
  });

  it('builds reads on httpResource with the same options', async () => {
    const resource = TestBed.runInInjectionContext(() =>
      api.read<unknown>(() => ({ url: ApiRoutes.readModel.myState })),
    );
    TestBed.tick();
    const request = backend.expectOne(ApiRoutes.readModel.myState).request;
    expect(request.withCredentials).toBe(true);
    expect(request.headers.get('Accept')).toBe(ACCEPT);
    expect(request.timeout).toBe(DEFAULT_TIMEOUT_MS);
    resource.destroy();
  });

  it('keeps a read idle while its request is undefined', () => {
    const resource = TestBed.runInInjectionContext(() => api.read<unknown>(() => undefined));
    TestBed.tick();
    backend.expectNone(() => true);
    expect(resource.status()).toBe('idle');
  });
});

describe('ApiClient — through the interceptor chain', () => {
  const server = useMswServer();

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('exposes a read error as an ApiFailure', async () => {
    server.use(
      problemAt('get', ApiRoutes.planning.currentStudyPlan, 'urn:sinapse:problem:conflict'),
    );
    const api = TestBed.inject(ApiClient);
    const resource = TestBed.runInInjectionContext(() =>
      api.read<unknown>(() => ({ url: ApiRoutes.planning.currentStudyPlan })),
    );
    await vi.waitFor(async () => {
      await TestBed.inject(ApplicationRef).whenStable();
      expect(resource.status()).toBe('error');
    });
    expect(isConflict(apiFailureOf(resource.error()))).toBe(true);
  });

  it('exposes a read value parsed from the generated body', async () => {
    const api = TestBed.inject(ApiClient);
    const resource = TestBed.runInInjectionContext(() =>
      api.read<{ setupComplete?: boolean }>(() => ({ url: ApiRoutes.readModel.myState })),
    );
    await vi.waitFor(async () => {
      await TestBed.inject(ApplicationRef).whenStable();
      expect(resource.hasValue()).toBe(true);
    });
    expect(resource.value()?.setupComplete).toBe(false);
  });

  it('turns the client timeout into TransportFailure("timeout"), never retried', async () => {
    let calls = 0;
    server.use(
      http.get(ApiRoutes.planning.goals, async () => {
        calls++;
        await delay(500);
        return HttpResponse.json([]);
      }),
    );
    const client = TestBed.inject(HttpClient);
    const failure = await firstValueFrom(
      client.get(ApiRoutes.planning.goals, { timeout: 20 }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TransportFailure);
    expect((failure as TransportFailure).reason).toBe('timeout');
    expect(calls).toBe(1);
  });
});
