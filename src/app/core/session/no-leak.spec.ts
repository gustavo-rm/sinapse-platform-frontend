import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { fixture } from '../../../testing/msw/fixtures';
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
const SECRETS = [EMAIL, PASSWORD, NEW_PASSWORD, TOKEN, VERIFICATION_TOKEN];

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
