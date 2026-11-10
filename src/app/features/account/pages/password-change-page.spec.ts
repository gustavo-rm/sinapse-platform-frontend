import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { fixture } from '../../../../testing/msw/fixtures';
import { problemBody, problemResponse } from '../../../../testing/msw/problems';
import { problemAt } from '../../../../testing/msw/scenarios';
import { useMswServer } from '../../../../testing/msw/server';
import { appConfig } from '../../../app.config';
import { ApiRoutes } from '../../../core/api/api-routes';
import { NETWORK_RETRY_DELAYS_MS } from '../../../core/api/interceptors/network-retry.interceptor';
import { SessionStore } from '../../../core/session/session-store';
import { AccountTimeService } from '../../../core/time/account-time.service';
import { TRANSPORT_FAILURE_LABELS } from '../../../shared/labels/transport-failure.labels';

const server = useMswServer();

const CURRENT = 'senha atual secreta';
const NEXT = 'nova senha longa secreta';

function activeState(): JsonBodyType {
  return {
    ...fixture('StudentStateView'),
    accountStatus: 'ACTIVE',
    setupComplete: true,
    requiresMajorityReaffirmation: false,
    pendingConsents: [],
    timeZone: 'America/Sao_Paulo',
  } as JsonBodyType;
}

/**
 * `/me/state` answers the bootstrap with an active account, then each later request (the probe)
 * with the given answers in turn. Counts every request.
 */
function stateThen(...probes: (() => Response)[]) {
  let calls = 0;
  const handler = http.get(ApiRoutes.readModel.myState, () => {
    const answer = calls === 0 ? HttpResponse.json(activeState()) : probes[calls - 1]();
    calls++;
    return answer;
  });
  return Object.assign(handler, { calls: () => calls });
}

async function open(...probes: (() => Response)[]) {
  const state = stateThen(...probes);
  server.use(state);
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/conta/senha');
  const root = () => harness.fixture.nativeElement as HTMLElement;
  const input = (id: string) =>
    root().querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
  const type = (id: string, value: string) => {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
  };
  return {
    harness,
    root,
    input,
    state,
    router: TestBed.inject(Router),
    store: TestBed.inject(SessionStore),
    submit: async () => {
      type('current-password', CURRENT);
      type('new-password', NEXT);
      root().querySelector('form')?.dispatchEvent(new Event('submit'));
      await harness.fixture.whenStable();
    },
  };
}

const unauthenticated = () => problemResponse('urn:sinapse:problem:unauthenticated');

describe('the password change', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('is reached from the account area, behind the guard chain', async () => {
    const { router, root } = await open();
    expect(router.url).toBe('/conta/senha');
    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Trocar senha');
  });

  it('on 204 clears the store at once, without waiting for a 401, and goes to sign in', async () => {
    let body: unknown = null;
    server.use(
      http.post(ApiRoutes.identity.passwordChanges, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { submit, store, router, state } = await open();
    await submit();

    expect(body).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
    expect(store.state()).toBeNull();
    expect(store.status()).toBe('signed-out');
    expect(store.notice()).toBe('password-changed');
    expect(TestBed.inject(AccountTimeService).zone()).toBe('UTC');
    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    expect(state.calls()).toBe(1);
  });

  it('on 401 then a 200 probe: the current password is wrong; stays on the form', async () => {
    server.use(
      problemAt('post', ApiRoutes.identity.passwordChanges, 'urn:sinapse:problem:unauthenticated'),
    );
    const { submit, store, router, input, root, state } = await open(() =>
      HttpResponse.json(activeState()),
    );
    await submit();

    expect(state.calls()).toBe(2);
    expect(router.url).toBe('/conta/senha');
    expect(store.isSignedIn()).toBe(true);
    const current = input('current-password');
    expect(current.getAttribute('aria-invalid')).toBe('true');
    expect(root().querySelector('#current-password-error')?.textContent?.trim()).toBe(
      'A senha atual não confere.',
    );
    expect(document.activeElement).toBe(current);
    expect(input('new-password').getAttribute('aria-invalid')).toBeNull();
  });

  it('on 401 then a 401 probe: the session is gone; the expiry path runs', async () => {
    server.use(
      problemAt('post', ApiRoutes.identity.passwordChanges, 'urn:sinapse:problem:unauthenticated'),
    );
    const { submit, store, router, state } = await open(unauthenticated);
    const expire = vi.spyOn(store, 'expire');
    await submit();

    expect(state.calls()).toBe(2);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(store.status()).toBe('signed-out');
    expect(store.notice()).toBe('session-expired');
    expect(store.attemptedRoute()).toBe('/conta/senha');
    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
  });

  it('on 401 then a transport failure on the probe: cannot tell; error state, nothing cleared', async () => {
    server.use(
      problemAt('post', ApiRoutes.identity.passwordChanges, 'urn:sinapse:problem:unauthenticated'),
    );
    const probeFails = () => HttpResponse.error() as unknown as Response;
    // The probe is a GET: the retry policy tries it twice more before giving up.
    const { submit, store, router, root } = await open(probeFails, probeFails, probeFails);
    const before = store.state();
    await submit();

    expect(store.isSignedIn()).toBe(true);
    expect(store.state()).toBe(before);
    expect(store.hasEnded()).toBe(false);
    expect(router.url).toBe('/conta/senha');
    expect(root().querySelector('sn-error-state h2')?.textContent?.trim()).toBe(
      TRANSPORT_FAILURE_LABELS.network,
    );
    expect(root().querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });

  it('never probes on a failure that is not a 401', async () => {
    server.use(
      http.post(ApiRoutes.identity.passwordChanges, () =>
        HttpResponse.json(
          {
            ...problemBody('urn:sinapse:problem:validation-failed'),
            errors: [{ field: 'newPassword', message: 'size must be between 12 and 256' }],
          },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    const { submit, input, state, root } = await open();
    await submit();
    expect(state.calls()).toBe(1);
    expect(input('new-password').getAttribute('aria-invalid')).toBe('true');
    expect(input('new-password').getAttribute('aria-describedby')).toContain('new-password-error');
    expect(root().textContent).not.toContain('size must be');
  });

  it('checks the contract locally: a new password under 12 characters is not sent', async () => {
    const changes = problemAt(
      'post',
      ApiRoutes.identity.passwordChanges,
      'urn:sinapse:problem:internal-error',
    );
    server.use(changes);
    const { root, input, harness } = await open();
    input('current-password').value = CURRENT;
    input('current-password').dispatchEvent(new Event('input'));
    input('new-password').value = 'curta';
    input('new-password').dispatchEvent(new Event('input'));
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
    expect(changes.calls()).toBe(0);
    expect(input('new-password').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the rate-limit notice with no retry control on a 429', async () => {
    server.use(
      problemAt(
        'post',
        ApiRoutes.identity.passwordChanges,
        'urn:sinapse:problem:rate-limit-exceeded',
        {
          retryAfterSeconds: 30,
        },
      ),
    );
    const { submit, root } = await open();
    await submit();
    expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull();
    expect(root().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
});

describe('signing out from the account area', () => {
  it('ends the session and goes to sign in', async () => {
    let deleted = 0;
    server.use(
      http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())),
      http.delete(ApiRoutes.identity.currentSession, () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    TestBed.configureTestingModule({ providers: appConfig.providers });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/conta');
    const button = [
      ...(harness.fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((candidate) => candidate.textContent?.trim() === 'Sair');
    button?.click();
    const router = TestBed.inject(Router);
    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    expect(deleted).toBe(1);
    expect(TestBed.inject(SessionStore).isSignedIn()).toBe(false);
  });
});
