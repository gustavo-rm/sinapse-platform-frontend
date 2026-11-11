import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import {
  type RecordedRequest,
  bodyOf,
  openApp,
  stateBody,
  stateServer,
} from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';
import { RESET_NOT_ACCEPTED_MESSAGE } from './password-reset-page';

const server = useMswServer();
const TOKEN = 'b7Qe0mZ4YkM1v2ZbXy3oP9sT6uWqA0cDfHjKlNr5sUw';
const NEW_PASSWORD = 'uma-nova-senha-bem-longa';

const anonymous = () =>
  http.get(ApiRoutes.readModel.myState, () =>
    problemResponse('urn:sinapse:problem:unauthenticated'),
  );

function confirmationsAt(...answers: (() => Response | Promise<Response>)[]) {
  const received: RecordedRequest[] = [];
  const handler = http.post(ApiRoutes.identity.passwordResetConfirmation, async ({ request }) => {
    received.push({
      method: 'POST',
      path: new URL(request.url).pathname,
      body: await bodyOf(request),
    });
    return answers[Math.min(received.length - 1, answers.length - 1)]();
  });
  return { received, handler };
}

async function open(url: string) {
  server.use(anonymous());
  const app = await openApp(url);
  const type = (id: string, value: string) => {
    const input = app.root().querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    app.root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await app.settle();
  };
  return { ...app, type, submit };
}

describe('the password-reset confirmation, /redefinir-senha', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('states the new password policy before the person types', async () => {
    const { root } = await open('/redefinir-senha');
    const input = root().querySelector('#reset-new-password') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toContain('reset-new-password-hint');
    expect(root().querySelector('#reset-new-password-hint')?.textContent?.trim()).toBe(
      'De 12 a 256 caracteres.',
    );
  });

  describe('token from the URL', () => {
    it('takes it, cleans the URL at once, holds it in memory only, and shows no field for it', async () => {
      const { root, router } = await open(`/redefinir-senha?token=${TOKEN}`);
      await vi.waitFor(() =>
        expect(root().textContent).toContain('O código do link foi recebido.'),
      );
      expect(router.url).toBe('/redefinir-senha');
      expect(TestBed.inject(Location).path(true)).not.toContain(TOKEN);
      expect(root().querySelector('#reset-token')).toBeNull();
      expect(root().textContent).toContain('O código do link foi recebido.');
      expect(root().textContent).not.toContain(TOKEN);
      expect(document.title).not.toContain(TOKEN);
    });

    it('sends {token, newPassword}; on 204 clears the session locally and goes to sign in, saying every session ended', async () => {
      const confirmations = confirmationsAt(() => new HttpResponse(null, { status: 204 }));
      server.use(confirmations.handler);
      const { type, submit, router, store, text } = await open(`/redefinir-senha?token=${TOKEN}`);
      type('reset-new-password', NEW_PASSWORD);
      await submit();

      await vi.waitFor(() => expect(router.url).toBe('/entrar'));
      expect(confirmations.received).toEqual([
        {
          method: 'POST',
          path: ApiRoutes.identity.passwordResetConfirmation,
          body: { token: TOKEN, newPassword: NEW_PASSWORD },
        },
      ]);
      expect(store.notice()).toBe('password-reset');
      expect(store.status()).toBe('signed-out');
      expect(text()).toContain(
        'Sua senha foi redefinida, e todas as sessões desta conta foram encerradas.',
      );
    });

    it('404: one message, drops the held token, offers the field and a new request', async () => {
      server.use(
        confirmationsAt(() => problemResponse('urn:sinapse:problem:resource-not-found')).handler,
      );
      const { type, submit, root } = await open(`/redefinir-senha?token=${TOKEN}`);
      type('reset-new-password', NEW_PASSWORD);
      await submit();
      await vi.waitFor(() =>
        expect(root().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
          RESET_NOT_ACCEPTED_MESSAGE,
        ),
      );
      expect(root().querySelector('#reset-token')).not.toBeNull();
      expect((root().querySelector('#reset-token') as HTMLInputElement).value).toBe('');
      expect(root().querySelector('a[href="/esqueci-senha"]')?.textContent?.trim()).toBe(
        'Pedir um novo código',
      );
      expect(root().textContent).not.toContain(TOKEN);
    });

    it('an empty token parameter is refused at once, with the field offered', async () => {
      const confirmations = confirmationsAt(() => new HttpResponse(null, { status: 204 }));
      server.use(confirmations.handler);
      const { root, router } = await open('/redefinir-senha?token=');
      await vi.waitFor(() =>
        expect(root().querySelector('[role="alert"] .sn-alert')).not.toBeNull(),
      );
      expect(router.url).toBe('/redefinir-senha');
      expect(root().querySelector('#reset-token')).not.toBeNull();
      expect(root().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        RESET_NOT_ACCEPTED_MESSAGE,
      );
      expect(confirmations.received).toEqual([]);
    });
  });

  describe('token from the field', () => {
    it('sends the pasted token, trimmed', async () => {
      const confirmations = confirmationsAt(() => new HttpResponse(null, { status: 204 }));
      server.use(confirmations.handler);
      const { type, submit, router } = await open('/redefinir-senha');
      type('reset-token', `  ${TOKEN}\n`);
      type('reset-new-password', NEW_PASSWORD);
      await submit();
      await vi.waitFor(() => expect(router.url).toBe('/entrar'));
      expect(confirmations.received.map((request) => request.body)).toEqual([
        { token: TOKEN, newPassword: NEW_PASSWORD },
      ]);
    });

    it('404: the message on the field, focus there, and the way to a new request', async () => {
      server.use(
        confirmationsAt(() => problemResponse('urn:sinapse:problem:resource-not-found')).handler,
      );
      const { type, submit, root } = await open('/redefinir-senha');
      type('reset-token', TOKEN);
      type('reset-new-password', NEW_PASSWORD);
      await submit();
      const input = root().querySelector('#reset-token') as HTMLInputElement;
      await vi.waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
      expect(root().querySelector('#reset-token-error')?.textContent?.trim()).toBe(
        RESET_NOT_ACCEPTED_MESSAGE,
      );
      await vi.waitFor(() => expect(document.activeElement).toBe(input));
      expect(root().querySelector('a[href="/esqueci-senha"]')).not.toBeNull();
    });

    it('refuses an empty token and a short password on this side, without a request', async () => {
      const confirmations = confirmationsAt(() => new HttpResponse(null, { status: 204 }));
      server.use(confirmations.handler);
      const { type, submit, root } = await open('/redefinir-senha');
      type('reset-new-password', 'curta');
      await submit();
      expect(confirmations.received).toEqual([]);
      expect(root().querySelector('#reset-token')?.getAttribute('aria-invalid')).toBe('true');
      expect(root().querySelector('#reset-new-password')?.getAttribute('aria-invalid')).toBe(
        'true',
      );
      expect(document.activeElement).toBe(root().querySelector('#reset-token'));
    });
  });

  it('400 on newPassword: on its field, with this client’s words', async () => {
    server.use(
      confirmationsAt(() =>
        HttpResponse.json(
          {
            type: 'urn:sinapse:problem:validation-failed',
            title: 't',
            status: 400,
            detail: 'd',
            instance: '/',
            errors: [{ field: 'newPassword', message: 'size must be between 12 and 256' }],
          },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ).handler,
    );
    const { type, submit, root, text } = await open(`/redefinir-senha?token=${TOKEN}`);
    type('reset-new-password', NEW_PASSWORD);
    await submit();
    await vi.waitFor(() =>
      expect(root().querySelector('#reset-new-password')?.getAttribute('aria-invalid')).toBe(
        'true',
      ),
    );
    expect(text()).not.toContain('size must be');
    // The held token was not the problem: still held.
    expect(root().querySelector('#reset-token')).toBeNull();
  });

  it('429: tells how long — 5 minutes — and keeps the submit disabled', async () => {
    server.use(
      confirmationsAt(() =>
        problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 300 }),
      ).handler,
    );
    const { type, submit, root, text, buttonNamed } = await open(`/redefinir-senha?token=${TOKEN}`);
    type('reset-new-password', NEW_PASSWORD);
    await submit();
    await vi.waitFor(() => expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull());
    expect(text()).toContain('Aguarde 5 minutos para tentar outra vez.');
    expect(buttonNamed('Redefinir senha')?.disabled).toBe(true);
  });

  it('shows the error state on a server failure', async () => {
    server.use(
      confirmationsAt(() => problemResponse('urn:sinapse:problem:internal-error')).handler,
    );
    const { type, submit, root } = await open(`/redefinir-senha?token=${TOKEN}`);
    type('reset-new-password', NEW_PASSWORD);
    await submit();
    await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
  });

  it('clears a session this browser held, after a 204 — whatever the store knew', async () => {
    // A session opened in another tab after this screen was reached: the store learns of it here.
    const state = stateServer(stateBody());
    const confirmations = confirmationsAt(() => new HttpResponse(null, { status: 204 }));
    server.use(confirmations.handler);
    const { type, submit, router, store } = await open(`/redefinir-senha?token=${TOKEN}`);
    server.use(state.handler);
    await store.refresh();
    expect(store.isSignedIn()).toBe(true);

    type('reset-new-password', NEW_PASSWORD);
    await submit();
    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    expect(store.isSignedIn()).toBe(false);
    expect(store.state()).toBeNull();
    expect(store.notice()).toBe('password-reset');
  });
});
