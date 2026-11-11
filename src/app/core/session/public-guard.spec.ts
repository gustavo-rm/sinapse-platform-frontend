import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { RedirectCommand } from '@angular/router';

import { http } from 'msw';

import { problemResponse } from '../../../testing/msw/problems';
import { networkFailureAt } from '../../../testing/msw/scenarios';
import { useMswServer } from '../../../testing/msw/server';
import { openApp, stateBody, stateServer } from '../../../testing/privacy';
import { ApiRoutes } from '../api/api-routes';
import { type Bootstrap, accessToPublic } from './gate';
import { publicGuard } from './session-guards';

/**
 * The public screens that create and recover an account (FE-6): registration, the reset request and
 * the reset confirmation. The rule is the mirror of a gate screen's — open to a person with no
 * session, and a person with one is sent on to where the chain says they belong.
 */

const server = useMswServer();
const PUBLIC = ['/criar-conta', '/esqueci-senha', '/redefinir-senha'] as const;

function anonymous() {
  let calls = 0;
  const handler = http.get(ApiRoutes.readModel.myState, () => {
    calls++;
    return problemResponse('urn:sinapse:problem:unauthenticated');
  });
  return Object.assign(handler, { calls: () => calls });
}

describe('accessToPublic (pure)', () => {
  const state = (overrides: Record<string, unknown>): Bootstrap => ({
    kind: 'state',
    state: {
      accountStatus: 'ACTIVE',
      timeZone: 'America/Sao_Paulo',
      pendingConsents: [],
      requiresMajorityReaffirmation: false,
      setupComplete: true,
      activePlanId: null,
      activeGenerationJobId: null,
      openSessionId: null,
      ...overrides,
    } as never,
  });

  it('lets a person with no session through', () => {
    expect(accessToPublic({ kind: 'unauthenticated' })).toBe(true);
  });

  it.each([
    [{}, 'app'],
    [{ setupComplete: false }, 'setup'],
    [{ accountStatus: 'SUSPENDED' }, 'suspended'],
    [{ accountStatus: 'ANONYMIZED' }, 'anonymized'],
    // The exception the prompt names: an unverified account belongs on /verificar-email, and the
    // chain (row 4) already sends it there.
    [{ accountStatus: 'PENDING_VERIFICATION' }, 'verify-email'],
    [{ accountStatus: 'PENDING_GUARDIAN_CONSENT' }, 'guardian-consent'],
    [{ requiresMajorityReaffirmation: true }, 'reaffirmation'],
    [{ pendingConsents: ['LEARNING_DATA_PROCESSING'] }, 'consent'],
    // Research declined at registration holds nobody (K-H): straight into the application.
    [{ pendingConsents: ['ACADEMIC_RESEARCH'] }, 'app'],
  ])('sends a person signed in with %j on to %s', (overrides, expected) => {
    expect(accessToPublic(state(overrides))).toBe(expected);
  });

  it('honours the reaffirmation deferred this session', () => {
    expect(
      accessToPublic(state({ requiresMajorityReaffirmation: true }), {
        reaffirmationDeferred: true,
      }),
    ).toBe('app');
  });
});

describe('the public routes, guarded', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each(PUBLIC)(
    'opens %s to a visitor: one read of the state, and its 401 is not an expiry',
    async (path) => {
      const state = anonymous();
      server.use(state);
      const { router, store, root } = await openApp(path);

      expect(router.url).toBe(path);
      expect(root().querySelectorAll('h1')).toHaveLength(1);
      expect(state.calls()).toBe(1);
      expect(store.status()).toBe('signed-out');
      // Not the expiry path: no notice for the sign-in screen, no route kept to return to.
      expect(store.notice()).toBeNull();
      expect(store.attemptedRoute()).toBeNull();
    },
  );

  it.each([
    [{}, '/hoje'],
    [{ setupComplete: false }, '/configurar'],
    [{ accountStatus: 'SUSPENDED' }, '/conta-suspensa'],
  ])('sends a person signed in with %j away from every public route, to %s', async (body, to) => {
    for (const path of PUBLIC) {
      TestBed.resetTestingModule();
      server.use(stateServer(stateBody(body)).handler);
      const { router } = await openApp(path);
      expect(router.url).toBe(to);
    }
  });

  it('redirects a person with a session by REPLACING the history entry', async () => {
    // What matters on the initial load of a reset link: the address bar already holds `?token=`,
    // and the redirect must replace that entry (seen in Chromium, docs/ai/STATE.md, FE-6 walk 4b).
    // An in-app navigation never commits the URL before the guard, so it is asserted directly.
    server.use(stateServer(stateBody()).handler);
    const { router } = await openApp('/hoje');
    const entries = window.history.length;

    const result = await TestBed.runInInjectionContext(() => publicGuard({} as never, {} as never));

    expect(result).toBeInstanceOf(RedirectCommand);
    const command = result as RedirectCommand;
    expect(router.serializeUrl(command.redirectTo)).toBe('/hoje');
    expect(command.navigationBehaviorOptions?.replaceUrl).toBe(true);

    await router.navigateByUrl('/redefinir-senha?token=nao-deve-ficar-no-historico');
    expect(router.url).toBe('/hoje');
    expect(TestBed.inject(Location).path(true)).not.toContain('nao-deve-ficar');
    expect(window.history.length).toBe(entries);
  });

  it('lets a visitor through when the state cannot be read: these screens depend on no session', async () => {
    server.use(networkFailureAt('get', ApiRoutes.readModel.myState));
    const { router } = await openApp('/criar-conta');
    expect(router.url).toBe('/criar-conta');
  });

  it('keeps the expiry path for the application: a 401 there still goes to sign in', async () => {
    server.use(anonymous());
    const { router, store } = await openApp('/criar-conta');
    await router.navigateByUrl('/hoje');
    expect(router.url).toBe('/entrar');
    expect(store.attemptedRoute()).toBe('/hoje');
  });
});
