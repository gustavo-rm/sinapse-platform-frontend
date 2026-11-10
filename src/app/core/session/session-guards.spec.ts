import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { fixture } from '../../../testing/msw/fixtures';
import { networkFailureAt, problemAt } from '../../../testing/msw/scenarios';
import { useMswServer } from '../../../testing/msw/server';
import { appConfig } from '../../app.config';
import { ApiRoutes } from '../api/api-routes';
import { NETWORK_RETRY_DELAYS_MS } from '../api/interceptors/network-retry.interceptor';
import { type Gate, pathOf } from './gate';
import { SessionStore } from './session-store';

const server = useMswServer();

function stateBody(overrides: Record<string, unknown> = {}): JsonBodyType {
  return {
    ...fixture('StudentStateView'),
    accountStatus: 'ACTIVE',
    setupComplete: true,
    requiresMajorityReaffirmation: false,
    pendingConsents: [],
    timeZone: 'America/Sao_Paulo',
    ...overrides,
  } as JsonBodyType;
}

/** Answers `/me/state`, counting the requests; `hold` keeps each answer until released. */
function stateAt(body: () => JsonBodyType, hold = false) {
  let calls = 0;
  let release: () => void = () => undefined;
  const gate = hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
  const handler = http.get(ApiRoutes.readModel.myState, async () => {
    calls++;
    await gate;
    return HttpResponse.json(body());
  });
  return Object.assign(handler, { calls: () => calls, release: () => release() });
}

async function setUp() {
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] }],
  });
  const harness = await RouterTestingHarness.create();
  return {
    harness,
    router: TestBed.inject(Router),
    store: TestBed.inject(SessionStore),
    heading: () =>
      (harness.fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent?.trim(),
    root: () => harness.fixture.nativeElement as HTMLElement,
  };
}

describe('the guarded routes', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('makes exactly one bootstrap request for a cold navigation across three guarded routes', async () => {
    const handler = stateAt(() => stateBody());
    server.use(handler);
    const { harness, router, heading } = await setUp();

    await harness.navigateByUrl('/hoje');
    expect(heading()).toBe('Hoje');
    await harness.navigateByUrl('/agenda');
    expect(heading()).toBe('Agenda');
    await harness.navigateByUrl('/plano');
    expect(heading()).toBe('Plano');

    expect(handler.calls()).toBe(1);
    expect(router.url).toBe('/plano');
  });

  it('renders nothing of the student area before the bootstrap has resolved', async () => {
    const handler = stateAt(() => stateBody(), true);
    server.use(handler);
    const { harness, root } = await setUp();

    const navigation = harness.navigateByUrl('/hoje');
    await vi.waitFor(() => expect(handler.calls()).toBe(1));
    // A macrotask lets anything that could render do so. (whenStable would wait for the
    // navigation itself, which the router holds as a pending task until the guard settles.)
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(root().querySelector('sn-student-layout')).toBeNull();
    expect(root().querySelector('h1')).toBeNull();

    handler.release();
    await navigation;
    expect(root().querySelector('sn-student-layout nav')).not.toBeNull();
    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Hoje');
  });

  it('shows no setup screen to a configured student while the bootstrap runs', async () => {
    const handler = stateAt(() => stateBody({ setupComplete: true }), true);
    server.use(handler);
    const { harness, root, router } = await setUp();

    const navigation = harness.navigateByUrl('/configurar');
    await vi.waitFor(() => expect(handler.calls()).toBe(1));
    expect(root().textContent).not.toContain('Configure seus estudos');
    handler.release();
    await navigation;
    expect(router.url).toBe('/hoje');
  });

  it('sends a 401 to /entrar, remembering where the person was going', async () => {
    server.use(
      problemAt('get', ApiRoutes.readModel.myState, 'urn:sinapse:problem:unauthenticated'),
    );
    const { harness, router, store, root } = await setUp();

    await harness.navigateByUrl('/agenda');
    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    await harness.fixture.whenStable();

    expect(store.attemptedRoute()).toBe('/agenda');
    expect(root().querySelector('sn-student-layout')).toBeNull();
  });

  it.each<[Record<string, unknown>, Gate, string]>([
    [{ accountStatus: 'ANONYMIZED' }, 'anonymized', 'Conta encerrada'],
    [{ accountStatus: 'SUSPENDED', setupComplete: null }, 'suspended', 'Conta suspensa'],
    [{ accountStatus: 'PENDING_VERIFICATION' }, 'verify-email', 'Confirme seu e-mail'],
    [
      { accountStatus: 'PENDING_GUARDIAN_CONSENT' },
      'guardian-consent',
      'Consentimento do responsável',
    ],
    [{ requiresMajorityReaffirmation: true }, 'reaffirmation', 'Reafirme seu consentimento'],
    [{ pendingConsents: ['INSTITUTION_SHARING'] }, 'consent', 'Consentimentos pendentes'],
    [{ setupComplete: false }, 'setup', 'Configure seus estudos'],
  ])('sends %j to the %s screen', async (overrides, gate, heading) => {
    server.use(stateAt(() => stateBody(overrides)));
    const context = await setUp();

    await context.harness.navigateByUrl('/hoje');

    expect(context.router.url).toBe(pathOf(gate));
    expect(context.heading()).toBe(heading);
    expect(context.root().querySelector('sn-public-layout')).not.toBeNull();
    expect(context.root().querySelector('sn-student-layout')).toBeNull();
  });

  it.each([
    ['ANONYMIZED', '/conta-encerrada'],
    ['SUSPENDED', '/conta-suspensa'],
    ['PENDING_VERIFICATION', '/verificar-email'],
  ])(
    'reaches the %s screen from a body that carries nothing but the status (FE-4.1)',
    async (status, path) => {
      server.use(stateAt(() => ({ accountStatus: status }) as JsonBodyType));
      const { harness, router } = await setUp();
      await harness.navigateByUrl('/hoje');
      expect(router.url).toBe(path);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('lets through a student with a plan being generated: not a gate', async () => {
    server.use(
      stateAt(() => stateBody({ activeGenerationJobId: '00000000-0000-4000-8000-00000000000a' })),
    );
    const { harness, router } = await setUp();
    await harness.navigateByUrl('/plano');
    expect(router.url).toBe('/plano');
  });

  it('sends a person who needs nothing away from a gate screen, into the application', async () => {
    server.use(stateAt(() => stateBody()));
    const { harness, router } = await setUp();
    await harness.navigateByUrl('/conta-suspensa');
    expect(router.url).toBe('/hoje');
  });

  it('sends a person away from a gate screen that is not theirs, to their own', async () => {
    server.use(stateAt(() => stateBody({ pendingConsents: ['ACADEMIC_RESEARCH'] })));
    const { harness, router } = await setUp();
    await harness.navigateByUrl('/configurar');
    expect(router.url).toBe('/consentimentos');
  });

  it('clears the store on the terminal screen and offers no way back', async () => {
    server.use(stateAt(() => stateBody({ accountStatus: 'ANONYMIZED' })));
    const { harness, store, root } = await setUp();

    await harness.navigateByUrl('/hoje');

    expect(store.state()).toBeNull();
    expect(store.isSignedIn()).toBe(false);
    expect(root().querySelectorAll('main a, main button')).toHaveLength(0);
    expect(root().querySelector('button.sign-out')).toBeNull();
  });

  it('honours a state that changed since the last navigation, after a refresh', async () => {
    let setupComplete = false;
    server.use(stateAt(() => stateBody({ setupComplete })));
    const { harness, router, store } = await setUp();

    await harness.navigateByUrl('/hoje');
    expect(router.url).toBe('/configurar');
    setupComplete = true;
    await store.refresh();
    await harness.navigateByUrl('/agenda');
    expect(router.url).toBe('/agenda');
  });

  it('shows the failure screen when the bootstrap fails, and asks again from it', async () => {
    server.use(networkFailureAt('get', ApiRoutes.readModel.myState));
    const { harness, router, root } = await setUp();

    await harness.navigateByUrl('/agenda');
    expect(router.url).toBe('/indisponivel');
    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    expect(root().querySelector('sn-student-layout')).toBeNull();

    server.use(stateAt(() => stateBody()));
    root().querySelector<HTMLButtonElement>('sn-error-state button')?.click();
    await vi.waitFor(() => expect(router.url).toBe('/agenda'));
  });

  it('shows the error state, not the application, when a required member is absent (D1)', async () => {
    server.use(
      stateAt(() => {
        const body = stateBody() as Record<string, unknown>;
        delete body['setupComplete'];
        return body as JsonBodyType;
      }),
    );
    const { harness, router, root } = await setUp();

    await harness.navigateByUrl('/hoje');

    expect(router.url).toBe('/indisponivel');
    expect(root().querySelector('[role="alert"] h2')?.textContent?.trim()).toBe(
      'A resposta do servidor não pôde ser lida.',
    );
    // An unreadable answer is not retried: the same request gets the same body.
    expect(root().querySelector('sn-error-state button')).toBeNull();
  });

  it('shows the rate-limit notice, with no control, when the bootstrap is refused', async () => {
    server.use(
      problemAt('get', ApiRoutes.readModel.myState, 'urn:sinapse:problem:rate-limit-exceeded', {
        retryAfterSeconds: 90,
      }),
    );
    const { harness, root } = await setUp();
    await harness.navigateByUrl('/hoje');
    expect(root().querySelector('sn-rate-limit-notice')?.textContent).toContain('2 minutos');
    expect(root().querySelector('main button')).toBeNull();
  });

  it('sends a reload of the failure screen into the application', async () => {
    server.use(stateAt(() => stateBody()));
    const { harness, router } = await setUp();
    await harness.navigateByUrl('/indisponivel');
    expect(router.url).toBe('/hoje');
  });

  it('offers sign-out on a gate screen, which is the only control there', async () => {
    server.use(
      stateAt(() => stateBody({ accountStatus: 'SUSPENDED' })),
      http.delete(ApiRoutes.identity.currentSession, () => new HttpResponse(null, { status: 204 })),
    );
    const { harness, router, root } = await setUp();
    await harness.navigateByUrl('/hoje');
    expect(router.url).toBe('/conta-suspensa');
    expect(root().querySelectorAll('main button, main a')).toHaveLength(0);

    root().querySelector<HTMLButtonElement>('button.sign-out')?.click();
    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
  });
});
