import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { fixture } from '../../../../testing/msw/fixtures';
import { problemBody, problemResponse } from '../../../../testing/msw/problems';
import { networkFailureAt, problemAt } from '../../../../testing/msw/scenarios';
import { useMswServer } from '../../../../testing/msw/server';
import { appConfig } from '../../../app.config';
import { ApiRoutes } from '../../../core/api/api-routes';
import { NETWORK_RETRY_DELAYS_MS } from '../../../core/api/interceptors/network-retry.interceptor';
import { SessionStore } from '../../../core/session/session-store';
import { PROBLEM_TYPE_LABELS } from '../../../shared/labels/problem-type.labels';
import { SIGN_IN_NOTICE_LABELS } from '../../../shared/labels/sign-in-notice.labels';
import { TRANSPORT_FAILURE_LABELS } from '../../../shared/labels/transport-failure.labels';
import { REFUSED_MESSAGE } from './sign-in-page';

const server = useMswServer();

const EMAIL = 'pessoa.real@example.com';
const PASSWORD = 'uma senha bem secreta 42';

function activeState(overrides: Record<string, unknown> = {}): JsonBodyType {
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

async function openSignIn() {
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/entrar');
  const root = () => harness.fixture.nativeElement as HTMLElement;
  const input = (id: string) =>
    root().querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
  const type = (id: string, value: string) => {
    const element = input(id);
    element.value = value;
    element.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    root().querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
  };
  return {
    harness,
    root,
    input,
    type,
    submit,
    router: TestBed.inject(Router),
    store: TestBed.inject(SessionStore),
    fill: () => {
      type('sign-in-email', EMAIL);
      type('sign-in-password', PASSWORD);
    },
  };
}

describe('the sign-in screen', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('has one <h1>, labelled fields and a submit button, in keyboard order', async () => {
    const { root } = await openSignIn();

    expect(root().querySelectorAll('h1')).toHaveLength(1);
    expect(root().querySelector('label[for="sign-in-email"]')?.textContent?.trim()).toBe('E-mail');
    expect(root().querySelector('label[for="sign-in-password"]')?.textContent?.trim()).toBe(
      'Senha',
    );
    const focusable = [
      ...root().querySelectorAll<HTMLElement>('main input, main button, main a, main select'),
    ];
    expect(focusable.map((element) => element.id || element.textContent?.trim())).toEqual([
      'sign-in-email',
      'sign-in-password',
      'Entrar',
      // FE-6: the two entry points, after the form.
      'Esqueci minha senha',
      'Criar conta',
    ]);
    expect(root().querySelector('a[href="/esqueci-senha"]')).not.toBeNull();
    expect(root().querySelector('a[href="/criar-conta"]')).not.toBeNull();
    expect(root().querySelector('#sign-in-password')?.getAttribute('type')).toBe('password');
    expect(root().querySelector('#sign-in-password')?.getAttribute('autocomplete')).toBe(
      'current-password',
    );
  });

  describe('201', () => {
    it('discards the token, reads the state, and goes to /hoje through the guard chain', async () => {
      let posted: unknown = null;
      server.use(
        http.post(ApiRoutes.identity.sessions, async ({ request }) => {
          posted = await request.json();
          return HttpResponse.json(
            { ...fixture('SessionResponse'), token: 'TOKEN-NEVER-KEPT' },
            { status: 201 },
          );
        }),
        http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())),
      );
      const { fill, submit, router, store } = await openSignIn();
      fill();
      await submit();

      await vi.waitFor(() => expect(router.url).toBe('/hoje'));
      expect(posted).toEqual({ email: EMAIL, password: PASSWORD });
      expect(store.isSignedIn()).toBe(true);
      expect(JSON.stringify(store.state())).not.toContain('TOKEN-NEVER-KEPT');
    });

    it('goes back to the remembered route, and forgets it', async () => {
      server.use(http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())));
      const { fill, submit, router, store } = await openSignIn();
      store.remember('/plano');
      fill();
      await submit();
      await vi.waitFor(() => expect(router.url).toBe('/plano'));
      expect(store.attemptedRoute()).toBeNull();
    });

    it('does not bypass the chain: an unconfigured account goes to setup', async () => {
      server.use(
        http.get(ApiRoutes.readModel.myState, () =>
          HttpResponse.json(activeState({ setupComplete: false })),
        ),
      );
      const { fill, submit, router, store } = await openSignIn();
      store.remember('/agenda');
      fill();
      await submit();
      await vi.waitFor(() => expect(router.url).toBe('/configurar'));
    });

    it('empties the form once signed in', async () => {
      server.use(http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())));
      const { fill, submit, input } = await openSignIn();
      fill();
      const password = input('sign-in-password');
      await submit();
      await vi.waitFor(() => expect(password.value).toBe(''));
    });
  });

  describe('201, then a 401 on the state (the session could not be established)', () => {
    it('says so, leaves the person on the sign-in screen, and does not loop', async () => {
      let stateCalls = 0;
      server.use(
        http.get(ApiRoutes.readModel.myState, () => {
          stateCalls++;
          return problemResponse('urn:sinapse:problem:unauthenticated');
        }),
      );
      const { fill, submit, router, root, harness } = await openSignIn();
      const before = stateCalls; // the cold bootstrap of /entrar makes none: it is public
      const navigate = vi.spyOn(router, 'navigateByUrl');
      fill();
      await submit();
      await harness.fixture.whenStable();

      expect(router.url).toBe('/entrar');
      expect(stateCalls - before).toBe(1);
      expect(navigate).not.toHaveBeenCalled();
      expect(root().querySelector('[role="status"]')?.textContent?.trim()).toBe(
        SIGN_IN_NOTICE_LABELS['session-not-established'],
      );
      expect(root().textContent).not.toMatch(/cookie|header|cabeçalho/i);
    });
  });

  describe('401', () => {
    it('says one thing, naming neither field, and does not probe', async () => {
      const refused = problemAt(
        'post',
        ApiRoutes.identity.sessions,
        'urn:sinapse:problem:unauthenticated',
      );
      let probes = 0;
      server.use(
        refused,
        http.get(ApiRoutes.readModel.myState, () => {
          probes++;
          return HttpResponse.json(activeState());
        }),
      );
      const { fill, submit, root, router, store } = await openSignIn();
      fill();
      await submit();

      const alert = root().querySelector('[role="alert"]');
      expect(alert?.textContent?.trim()).toBe(REFUSED_MESSAGE);
      expect(root().querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
      expect(root().textContent).not.toContain(PASSWORD);
      expect(root().textContent).not.toContain(EMAIL);
      expect(probes).toBe(0);
      expect(refused.calls()).toBe(1);
      expect(router.url).toBe('/entrar');
      expect(store.hasEnded()).toBe(false);
    });

    it('moves the focus to the password, keeping the address', async () => {
      server.use(
        problemAt('post', ApiRoutes.identity.sessions, 'urn:sinapse:problem:unauthenticated'),
      );
      const { fill, submit, input } = await openSignIn();
      fill();
      await submit();
      expect(document.activeElement).toBe(input('sign-in-password'));
      expect(input('sign-in-email').value).toBe(EMAIL);
    });
  });

  describe('validation-failed (D3: not declared for this operation, handled anyway)', () => {
    it('points at both fields the server named, with messages written here', async () => {
      server.use(
        http.post(ApiRoutes.identity.sessions, () =>
          HttpResponse.json(
            {
              ...problemBody('urn:sinapse:problem:validation-failed', ApiRoutes.identity.sessions),
              errors: [
                { field: 'email', message: 'must not be blank' },
                { field: 'password', message: 'size must be between 0 and 256' },
              ],
            },
            { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ),
      );
      const { fill, submit, root, input } = await openSignIn();
      fill();
      await submit();

      for (const id of ['sign-in-email', 'sign-in-password']) {
        expect(input(id).getAttribute('aria-invalid')).toBe('true');
        const describedBy = input(id).getAttribute('aria-describedby');
        expect(root().querySelector(`#${describedBy}`)?.textContent?.trim()).not.toBe('');
      }
      expect(root().textContent).not.toContain('must not be blank');
      expect(root().textContent).not.toContain('size must be');
      expect(document.activeElement).toBe(input('sign-in-email'));
    });

    it('puts a "request" error at form level', async () => {
      server.use(
        http.post(ApiRoutes.identity.sessions, () =>
          HttpResponse.json(
            {
              ...problemBody('urn:sinapse:problem:validation-failed'),
              errors: [{ field: 'request', message: 'Malformed' }],
            },
            { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ),
      );
      const { fill, submit, root } = await openSignIn();
      fill();
      await submit();
      expect(root().querySelector('[role="alert"]')?.textContent?.trim()).not.toBe('');
      expect(root().querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    });

    it('checks the contract locally, and sends nothing, when the e-mail is empty', async () => {
      const sessions = problemAt(
        'post',
        ApiRoutes.identity.sessions,
        'urn:sinapse:problem:internal-error',
      );
      server.use(sessions);
      const { submit, input, type } = await openSignIn();
      type('sign-in-password', PASSWORD);
      await submit();
      expect(input('sign-in-email').getAttribute('aria-invalid')).toBe('true');
      expect(sessions.calls()).toBe(0);
    });
  });

  describe('429', () => {
    it('shows the rate-limit notice and offers no control that retries', async () => {
      const limited = problemAt(
        'post',
        ApiRoutes.identity.sessions,
        'urn:sinapse:problem:rate-limit-exceeded',
        {
          retryAfterSeconds: 120,
        },
      );
      server.use(limited);
      const { fill, submit, root } = await openSignIn();
      fill();
      await submit();

      expect(root().querySelector('sn-rate-limit-notice')?.textContent).toContain('2 minutos');
      expect(root().querySelector('sn-rate-limit-notice button')).toBeNull();
      expect(root().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
      await submit();
      expect(limited.calls()).toBe(1);
    });
  });

  it('shows the error state for a failure that is neither, by type or reason', async () => {
    server.use(networkFailureAt('post', ApiRoutes.identity.sessions));
    const { fill, submit, root } = await openSignIn();
    fill();
    await submit();
    expect(root().querySelector('sn-error-state h2')?.textContent?.trim()).toBe(
      TRANSPORT_FAILURE_LABELS.network,
    );
  });

  it('shows the internal-error message for a 500', async () => {
    server.use(
      problemAt('post', ApiRoutes.identity.sessions, 'urn:sinapse:problem:internal-error'),
    );
    const { fill, submit, root } = await openSignIn();
    fill();
    await submit();
    expect(root().querySelector('sn-error-state h2')?.textContent?.trim()).toBe(
      PROBLEM_TYPE_LABELS['urn:sinapse:problem:internal-error'],
    );
  });

  it('never puts the password in the URL', async () => {
    server.use(
      problemAt('post', ApiRoutes.identity.sessions, 'urn:sinapse:problem:unauthenticated'),
    );
    const { fill, submit, router } = await openSignIn();
    fill();
    await submit();
    expect(router.url).not.toContain('senha');
    expect(decodeURIComponent(router.url)).not.toContain(PASSWORD);
    expect(decodeURIComponent(location.href)).not.toContain(PASSWORD);
  });

  it.each([
    ['session-expired' as const],
    ['password-changed' as const],
    ['sign-out-unconfirmed' as const],
  ])('says how the person got here: %s', async (notice) => {
    server.use(
      http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())),
      notice === 'sign-out-unconfirmed'
        ? networkFailureAt('delete', ApiRoutes.identity.currentSession)
        : http.delete(
            ApiRoutes.identity.currentSession,
            () => new HttpResponse(null, { status: 204 }),
          ),
    );
    const { store, harness, root } = await openSignIn();
    await store.ensureLoaded();
    if (notice === 'session-expired') store.expire();
    else if (notice === 'password-changed') store.end('password-changed');
    else await store.signOut();
    await harness.navigateByUrl('/entrar');
    expect(root().querySelector('[role="status"]')?.textContent?.trim()).toBe(
      SIGN_IN_NOTICE_LABELS[notice],
    );
  });
});
