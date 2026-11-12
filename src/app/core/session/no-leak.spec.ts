import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { fixture } from '../../../testing/msw/fixtures';
import { FAST_POLLING, FITNESS, planBody, planServer } from '../../../testing/plan';
import { openApp } from '../../../testing/privacy';
import { useMswServer } from '../../../testing/msw/server';
import { appConfig } from '../../app.config';
import { ApiRoutes } from '../api/api-routes';
import { NETWORK_RETRY_DELAYS_MS } from '../api/interceptors/network-retry.interceptor';
import { SessionStore } from './session-store';

/**
 * Nothing secret leaves memory: no password, session token or e-mail address reaches the console
 * or any storage API, through every flow of FE-4 — in the style of FE-3's log test, but over whole
 * flows rather than one request. The server's answers here deliberately carry the secrets back in
 * `detail` and `errors[].message`, as a careless backend might.
 */

const server = useMswServer();

const EMAIL = 'pessoa.vazamento@example.com';
const PASSWORD = 'senha-que-nao-pode-vazar-91';
const NEW_PASSWORD = 'nova-senha-que-nao-pode-vazar-92';
const TOKEN = 'token-opaco-que-nao-pode-vazar-93';
/** An e-mail verification token: a single-use credential that arrives in a URL (FE-5). */
const VERIFICATION_TOKEN = 'verificacao-de-uso-unico-que-nao-pode-vazar-94';
/** A password-reset token: a single-use credential that authorises the change on its own (FE-6). */
const RESET_TOKEN = 'redefinicao-de-uso-unico-que-nao-pode-vazar-95';
const SECRETS = [EMAIL, PASSWORD, NEW_PASSWORD, TOKEN, VERIFICATION_TOKEN, RESET_TOKEN];

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

/** A problem body that echoes the secrets in the fields this client must never show or log. */
function leakyProblem(type: string, status: number, errors?: { field: string; message: string }[]) {
  return HttpResponse.json(
    {
      type,
      title: `Title ${EMAIL}`,
      status,
      detail: `Rejected ${EMAIL} with ${PASSWORD} and ${TOKEN}`,
      instance: `${ApiRoutes.identity.sessions}?email=${EMAIL}`,
      ...(errors ? { errors } : {}),
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json', 'X-Correlation-Id': 'corr-leak' },
    },
  );
}

describe('no secret reaches the console or storage', () => {
  const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
  const storageWrites: unknown[][] = [];
  const cookieWrites: unknown[] = [];
  const idbOpens: unknown[] = [];

  beforeEach(() => {
    for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
      consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((...args) => {
      storageWrites.push(args);
    });
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation((value: string) => {
      cookieWrites.push(value);
      cookie?.set?.call(document, value);
    });
    if (typeof indexedDB !== 'undefined') {
      vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
        idbOpens.push(args);
        throw new Error('no IndexedDB');
      });
    }
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpies.length = 0;
    storageWrites.length = 0;
    cookieWrites.length = 0;
    idbOpens.length = 0;
  });

  function assertNothingLeaked(): void {
    const logged = consoleSpies
      .flatMap((spy) => spy.mock.calls.flat())
      .map((arg) => {
        try {
          return typeof arg === 'string' ? arg : `${String(arg)} ${JSON.stringify(arg)}`;
        } catch {
          return String(arg);
        }
      });
    for (const secret of SECRETS) {
      for (const line of logged) {
        expect(line).not.toContain(secret);
      }
    }
    expect(storageWrites).toEqual([]);
    expect(cookieWrites).toEqual([]);
    expect(idbOpens).toEqual([]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  }

  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: NETWORK_RETRY_DELAYS_MS, useValue: [1, 1] }],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const root = () => harness.fixture.nativeElement as HTMLElement;
    const type = (id: string, value: string) => {
      const element = root().querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
      element.value = value;
      element.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      root().querySelector('form')?.dispatchEvent(new Event('submit'));
      await harness.fixture.whenStable();
    };
    return { harness, root, type, submit, router: TestBed.inject(Router) };
  }

  it('catches a leak when there is one (negative control of the check itself)', () => {
    console.warn(`oops ${PASSWORD}`);
    expect(() => assertNothingLeaked()).toThrow();
    consoleSpies.forEach((spy) => spy.mockClear());
    sessionStorage.setItem('token', TOKEN);
    expect(() => assertNothingLeaked()).toThrow();
    storageWrites.length = 0;
    document.cookie = `session=${TOKEN}`;
    expect(() => assertNothingLeaked()).toThrow();
    document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('through a sign-in that succeeds, whose body carries the token', async () => {
    server.use(
      http.post(ApiRoutes.identity.sessions, () =>
        HttpResponse.json({ ...fixture('SessionResponse'), token: TOKEN }, { status: 201 }),
      ),
      http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())),
    );
    const { type, submit, router, root } = await open('/entrar');
    type('sign-in-email', EMAIL);
    type('sign-in-password', PASSWORD);
    await submit();
    await vi.waitFor(() => expect(router.url).toBe('/hoje'));

    assertNothingLeaked();
    expect(JSON.stringify(TestBed.inject(SessionStore).state())).not.toContain(TOKEN);
    expect(root().textContent).not.toContain(TOKEN);
  });

  it.each([
    ['refused', 'urn:sinapse:problem:unauthenticated', 401, undefined],
    [
      'invalid',
      'urn:sinapse:problem:validation-failed',
      400,
      [
        { field: 'email', message: `bad ${EMAIL}` },
        { field: 'password', message: `bad ${PASSWORD}` },
      ],
    ],
    ['rate-limited', 'urn:sinapse:problem:rate-limit-exceeded', 429, undefined],
    ['server error', 'urn:sinapse:problem:internal-error', 500, undefined],
  ])('through a sign-in that is %s', async (_name, problemType, status, errors) => {
    server.use(
      http.post(ApiRoutes.identity.sessions, () => leakyProblem(problemType, status, errors)),
    );
    const { type, submit, root } = await open('/entrar');
    type('sign-in-email', EMAIL);
    type('sign-in-password', PASSWORD);
    await submit();

    assertNothingLeaked();
    for (const secret of [PASSWORD, TOKEN]) {
      expect(root().textContent).not.toContain(secret);
    }
    // The address the person typed stays in its field, and nowhere else on the screen.
    expect(root().textContent).not.toContain(EMAIL);
  });

  it.each([
    ['204', () => new HttpResponse(null, { status: 204 })],
    ['401', () => leakyProblem('urn:sinapse:problem:unauthenticated', 401)],
    ['500', () => leakyProblem('urn:sinapse:problem:internal-error', 500)],
  ])('through a password change answered %s', async (_name, answer) => {
    server.use(
      http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())),
      http.post(ApiRoutes.identity.passwordChanges, answer),
    );
    const { type, submit, root } = await open('/conta/senha');
    type('current-password', PASSWORD);
    type('new-password', NEW_PASSWORD);
    await submit();

    assertNothingLeaked();
    expect(root().textContent).not.toContain(PASSWORD);
    expect(root().textContent).not.toContain(NEW_PASSWORD);
  });

  it('through a sign-out that fails', async () => {
    server.use(
      http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(activeState())),
      http.delete(ApiRoutes.identity.currentSession, () =>
        leakyProblem('urn:sinapse:problem:internal-error', 500),
      ),
    );
    await open('/conta');
    await TestBed.inject(SessionStore).signOut();
    assertNothingLeaked();
  });

  /** What the verification token must never be found in once the flow is over. */
  function assertVerificationTokenGone(root: () => HTMLElement): void {
    assertNothingLeaked();
    expect(document.title).not.toContain(VERIFICATION_TOKEN);
    expect(window.location.href).not.toContain(VERIFICATION_TOKEN);
    expect(TestBed.inject(Router).url).not.toContain(VERIFICATION_TOKEN);
    expect(root().textContent).not.toContain(VERIFICATION_TOKEN);
    expect(JSON.stringify(TestBed.inject(SessionStore).state())).not.toContain(VERIFICATION_TOKEN);
  }

  it.each([
    ['204', () => new HttpResponse(null, { status: 204 })],
    ['404', () => leakyProblem('urn:sinapse:problem:resource-not-found', 404)],
    ['429', () => leakyProblem('urn:sinapse:problem:rate-limit-exceeded', 429)],
    ['500', () => leakyProblem('urn:sinapse:problem:internal-error', 500)],
  ])('through an e-mail verification by URL answered %s', async (_name, answer) => {
    let received: unknown = null;
    server.use(
      http.post(ApiRoutes.identity.emailVerifications, async ({ request }) => {
        received = await request.json();
        return answer();
      }),
    );
    const { root, harness } = await open(`/verificar-email?token=${VERIFICATION_TOKEN}`);
    await vi.waitFor(() => expect(received).toEqual({ token: VERIFICATION_TOKEN }));
    await harness.fixture.whenStable();

    assertVerificationTokenGone(root);
  });

  it.each([
    ['204', () => new HttpResponse(null, { status: 204 })],
    ['404', () => leakyProblem('urn:sinapse:problem:resource-not-found', 404)],
  ])('through an e-mail verification by a pasted token answered %s', async (_name, answer) => {
    let received: unknown = null;
    server.use(
      http.post(ApiRoutes.identity.emailVerifications, async ({ request }) => {
        received = await request.json();
        return answer();
      }),
    );
    const { root, type, submit } = await open('/verificar-email');
    type('verification-token', VERIFICATION_TOKEN);
    await submit();
    await vi.waitFor(() => expect(received).toEqual({ token: VERIFICATION_TOKEN }));

    // The field may hold what the person pasted until they leave; nothing else may.
    const field = root().querySelector<HTMLInputElement>('#verification-token');
    if (field) {
      field.value = '';
    }
    assertVerificationTokenGone(root);
  });

  it('catches a verification token left in the URL (negative control)', async () => {
    server.use(
      http.post(
        ApiRoutes.identity.emailVerifications,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { root } = await open('/verificar-email');
    window.history.replaceState(null, '', `/verificar-email?token=${VERIFICATION_TOKEN}`);
    expect(() => assertVerificationTokenGone(root)).toThrow();
    window.history.replaceState(null, '', '/');
  });

  /** No session: the visitor of the public screens of FE-6. */
  const anonymous = () =>
    http.get(ApiRoutes.readModel.myState, () =>
      leakyProblem('urn:sinapse:problem:unauthenticated', 401),
    );

  /** What the reset token must never be found in once the flow is over. */
  function assertResetTokenGone(root: () => HTMLElement): void {
    assertNothingLeaked();
    expect(document.title).not.toContain(RESET_TOKEN);
    expect(window.location.href).not.toContain(RESET_TOKEN);
    expect(TestBed.inject(Router).url).not.toContain(RESET_TOKEN);
    expect(root().textContent).not.toContain(RESET_TOKEN);
    expect(root().textContent).not.toContain(NEW_PASSWORD);
    for (const input of root().querySelectorAll('input')) {
      expect(input.value).not.toContain(RESET_TOKEN);
    }
  }

  it.each([
    [
      '201',
      () => HttpResponse.json({ accountId: 'a', status: 'PENDING_VERIFICATION' }, { status: 201 }),
    ],
    [
      '400',
      () =>
        leakyProblem('urn:sinapse:problem:validation-failed', 400, [
          { field: 'email', message: `bad ${EMAIL}` },
          { field: 'password', message: `bad ${PASSWORD}` },
        ]),
    ],
    ['409', () => leakyProblem('urn:sinapse:problem:conflict', 409)],
    ['422', () => leakyProblem('urn:sinapse:problem:minor-registration-not-supported', 422)],
    ['429', () => leakyProblem('urn:sinapse:problem:rate-limit-exceeded', 429)],
    ['500', () => leakyProblem('urn:sinapse:problem:internal-error', 500)],
  ])('through a registration answered %s', async (_name, answer) => {
    let received: unknown = null;
    server.use(
      anonymous(),
      http.get(ApiRoutes.identity.terms, () =>
        HttpResponse.json([
          {
            id: 'ldp',
            purpose: 'LEARNING_DATA_PROCESSING',
            version: '1',
            body: 'Texto.',
            publishedAt: '2026-11-10T00:00:00Z',
          },
        ]),
      ),
      http.post(ApiRoutes.identity.accounts, async ({ request }) => {
        received = await request.json();
        return answer();
      }),
    );
    const { type, submit, root, harness } = await open('/criar-conta');
    await vi.waitFor(() => expect(root().querySelector('#registration-email')).not.toBeNull());
    type('registration-email', EMAIL);
    type('registration-password', PASSWORD);
    type('registration-birth', '1996-01-01');
    (root().querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await submit();
    await vi.waitFor(() => expect(received).toMatchObject({ email: EMAIL, password: PASSWORD }));
    await harness.fixture.whenStable();

    assertNothingLeaked();
    expect(root().textContent).not.toContain(PASSWORD);
    expect(root().textContent).not.toContain(EMAIL);
  });

  it.each([
    ['204', () => new HttpResponse(null, { status: 204 })],
    ['429', () => leakyProblem('urn:sinapse:problem:rate-limit-exceeded', 429)],
    ['500', () => leakyProblem('urn:sinapse:problem:internal-error', 500)],
  ])('through a password-reset request answered %s', async (_name, answer) => {
    let received: unknown = null;
    server.use(
      anonymous(),
      http.post(ApiRoutes.identity.passwordResets, async ({ request }) => {
        received = await request.json();
        return answer();
      }),
    );
    const { type, submit, root } = await open('/esqueci-senha');
    type('reset-email', EMAIL);
    await submit();
    await vi.waitFor(() => expect(received).toEqual({ email: EMAIL }));
    assertNothingLeaked();
    // The address is not shown back by the confirmation.
    if (root().querySelector('#reset-email') === null) {
      expect(root().textContent).not.toContain(EMAIL);
    }
  });

  it.each([
    ['204', () => new HttpResponse(null, { status: 204 })],
    ['404', () => leakyProblem('urn:sinapse:problem:resource-not-found', 404)],
    ['429', () => leakyProblem('urn:sinapse:problem:rate-limit-exceeded', 429)],
    ['500', () => leakyProblem('urn:sinapse:problem:internal-error', 500)],
  ])('through a password reset by URL answered %s', async (_name, answer) => {
    let received: unknown = null;
    server.use(
      anonymous(),
      http.post(ApiRoutes.identity.passwordResetConfirmation, async ({ request }) => {
        received = await request.json();
        return answer();
      }),
    );
    const { type, submit, root, harness } = await open(`/redefinir-senha?token=${RESET_TOKEN}`);
    await vi.waitFor(() => expect(root().querySelector('#reset-new-password')).not.toBeNull());
    await harness.fixture.whenStable();
    type('reset-new-password', NEW_PASSWORD);
    await submit();
    await vi.waitFor(() =>
      expect(received).toEqual({ token: RESET_TOKEN, newPassword: NEW_PASSWORD }),
    );
    await harness.fixture.whenStable();
    const password = root().querySelector<HTMLInputElement>('#reset-new-password');
    if (password) {
      password.value = '';
    }
    assertResetTokenGone(root);
  });

  it.each([
    ['204', () => new HttpResponse(null, { status: 204 })],
    ['404', () => leakyProblem('urn:sinapse:problem:resource-not-found', 404)],
  ])('through a password reset by a pasted token answered %s', async (_name, answer) => {
    let received: unknown = null;
    server.use(
      anonymous(),
      http.post(ApiRoutes.identity.passwordResetConfirmation, async ({ request }) => {
        received = await request.json();
        return answer();
      }),
    );
    const { type, submit, root } = await open('/redefinir-senha');
    type('reset-token', RESET_TOKEN);
    type('reset-new-password', NEW_PASSWORD);
    await submit();
    await vi.waitFor(() =>
      expect(received).toEqual({ token: RESET_TOKEN, newPassword: NEW_PASSWORD }),
    );
    // The fields may hold what the person typed until they leave; nothing else may.
    for (const input of root().querySelectorAll('input')) {
      input.value = '';
    }
    assertResetTokenGone(root);
  });

  it('catches a reset token left in the URL or on the screen (negative control)', async () => {
    server.use(anonymous());
    const { root } = await open('/redefinir-senha');
    window.history.replaceState(null, '', `/redefinir-senha?token=${RESET_TOKEN}`);
    expect(() => assertResetTokenGone(root)).toThrow();
    window.history.replaceState(null, '', '/');
    (root().querySelector('#reset-token') as HTMLInputElement).value = RESET_TOKEN;
    expect(() => assertResetTokenGone(root)).toThrow();
  });

  it('through a bootstrap whose body is unreadable and carries a secret', async () => {
    server.use(
      http.get(ApiRoutes.readModel.myState, () =>
        HttpResponse.json({ accountStatus: 'ACTIVE', timeZone: TOKEN, note: EMAIL }),
      ),
    );
    const { router } = await open('/hoje');
    expect(router.url).toBe('/indisponivel');
    assertNothingLeaked();
  });
});

/**
 * `fitness` never reaches the student (FE-8). The Core puts the engine and its build in it (backend
 * K17), so on a pilot that compares engines, any trace of it on a student's screen says which arm of
 * the experiment they are in: experiment contamination, not a cosmetic defect. Neither rendered,
 * logged, put in the title, in a data attribute or in storage — on the two plan routes that carry
 * it (`/study-plans/current` and the summary), on the history, and through a generation.
 */
describe('fitness never reaches the screen, the title, the DOM attributes, the console or storage', () => {
  const FITNESS_SECRETS = [
    FITNESS.engine,
    FITNESS.build,
    FITNESS.strategy,
    FITNESS['topics-unscheduled-ids'][0],
    'availability-utilisation',
    'topics-unscheduled',
  ];
  const logged: unknown[][] = [];

  beforeEach(() => {
    for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    logged.length = 0;
  });

  /** Everything a person or a script on the page could read: text, every attribute, the title, logs, storage. */
  function assertNoFitness(root: HTMLElement): void {
    const surfaces = [
      root.textContent ?? '',
      document.documentElement.outerHTML,
      document.title,
      [...root.querySelectorAll('*')]
        .flatMap((element) => [...element.attributes].map((attr) => `${attr.name}=${attr.value}`))
        .join(' '),
      logged
        .map((args) =>
          args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
        )
        .join('\n'),
      JSON.stringify({ ...localStorage }),
      JSON.stringify({ ...sessionStorage }),
    ];
    for (const secret of FITNESS_SECRETS) {
      for (const surface of surfaces) {
        expect(surface).not.toContain(secret);
      }
    }
  }

  async function openPlan(url: string, options: Parameters<typeof planServer>[0] = {}) {
    TestBed.resetTestingModule();
    const backend = planServer(options);
    server.use(...backend.handlers);
    const app = await openApp(url, FAST_POLLING);
    return { app, backend };
  }

  it('catches fitness when it is there (negative control of the check itself)', async () => {
    const { app } = await openPlan('/plano', { plans: [planBody()] });
    await vi.waitFor(() => expect(app.text()).toContain('O que este plano pede'));
    assertNoFitness(app.root());

    const planted = app.root().querySelector('h1') as HTMLElement;
    planted.setAttribute('data-engine', FITNESS.engine);
    expect(() => assertNoFitness(app.root())).toThrow();
    planted.removeAttribute('data-engine');

    console.info({ fitness: FITNESS });
    expect(() => assertNoFitness(app.root())).toThrow();
    logged.length = 0;

    const title = document.title;
    document.title = `Plano · ${FITNESS.build}`;
    expect(() => assertNoFitness(app.root())).toThrow();
    document.title = title;

    planted.append(document.createTextNode(FITNESS.strategy));
    expect(() => assertNoFitness(app.root())).toThrow();
  });

  it('on /plano: `current`, the summary and the sessions all carry it, and none of it shows', async () => {
    const { app, backend } = await openPlan('/plano', { plans: [planBody()] });
    await vi.waitFor(() => expect(app.text()).toContain('Ver todas as sessões'));
    (app.root().querySelector('details') as HTMLDetailsElement).open = true;
    await app.settle();
    expect(backend.count('GET', '/study-plans/current')).toBe(1);
    expect(backend.count('GET', '/summary')).toBe(1);
    assertNoFitness(app.root());
  });

  it('on /plano/historico, with a superseded plan', async () => {
    const { app } = await openPlan('/plano/historico', {
      plans: [
        planBody({ id: 'plan-2' }),
        planBody({
          id: 'plan-1',
          status: 'SUPERSEDED',
          supersededAt: '2026-11-12T20:55:00Z',
          supersededByPlanId: 'plan-2',
        }),
      ],
    });
    await vi.waitFor(() => expect(app.text()).toContain('Substituído em'));
    assertNoFitness(app.root());
  });

  it('through a whole generation, from /hoje to the new plan', async () => {
    const { app } = await openPlan('/hoje', {
      steps: [{ status: 'PENDING' }, { status: 'READY', planId: 'plan-5' }],
    });
    await app.click('Gerar meu plano');
    await vi.waitFor(() => expect(app.router.url).toBe('/plano'));
    await vi.waitFor(() => expect(app.text()).toContain('Por onde começar'));
    assertNoFitness(app.root());
  });
});
