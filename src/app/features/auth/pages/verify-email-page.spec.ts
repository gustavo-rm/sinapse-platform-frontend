import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import { type RecordedRequest, bodyOf, openApp } from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';
import { NOT_ACCEPTED_MESSAGE } from './verify-email-page';

const server = useMswServer();
const TOKEN = 'L1ttciHdYtsHSFsQnmVHHl8Rd--ciyMRTtzKXPU0ALI';

function verifications(answer: () => Response | Promise<Response>) {
  const received: RecordedRequest[] = [];
  const handler = http.post(ApiRoutes.identity.emailVerifications, async ({ request }) => {
    received.push({
      method: 'POST',
      path: new URL(request.url).pathname,
      body: await bodyOf(request),
    });
    return answer();
  });
  return { received, handler };
}

function type(root: HTMLElement, value: string): void {
  const input = root.querySelector<HTMLInputElement>('#verification-token') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('the e-mail verification, /verificar-email — public, not a gate', () => {
  it('opens with no session and asks for nothing first', async () => {
    const { root, store } = await openApp('/verificar-email');
    expect(root().querySelectorAll('h1')).toHaveLength(1);
    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Confirme seu e-mail');
    expect(root().querySelector('label[for="verification-token"]')).not.toBeNull();
    expect(store.status()).toBe('unknown');
  });

  it('consumes a token from the URL on arrival, in the body only, and removes it from the URL', async () => {
    const verified = verifications(() => new HttpResponse(null, { status: 204 }));
    server.use(verified.handler);
    const { router, store } = await openApp(`/verificar-email?token=${TOKEN}`);

    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    expect(verified.received).toEqual([
      { method: 'POST', path: ApiRoutes.identity.emailVerifications, body: { token: TOKEN } },
    ]);
    expect(store.notice()).toBe('email-verified');
    expect(TestBed.inject(Location).path()).not.toContain(TOKEN);
  });

  it('cleans the URL with a history replacement before the answer, whatever it is', async () => {
    let urlWhileWaiting = '';
    let pathWhileWaiting = '';
    const verified = verifications(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      urlWhileWaiting = TestBed.inject(Location).path();
      pathWhileWaiting = TestBed.inject(Location).path(true);
      return problemResponse('urn:sinapse:problem:resource-not-found');
    });
    server.use(verified.handler);
    const navigations: boolean[] = [];
    const { router, root } = await openApp(`/verificar-email?token=${TOKEN}`);
    router.events.subscribe(() => navigations.push(true));

    await vi.waitFor(() => expect(root().textContent).toContain('não foi aceito'));
    expect(urlWhileWaiting).toBe('/verificar-email');
    expect(pathWhileWaiting).not.toContain(TOKEN);
    expect(router.url).toBe('/verificar-email');
    // The token from the link is never copied into the field or the page.
    expect((root().querySelector('#verification-token') as HTMLInputElement).value).toBe('');
    expect(root().textContent).not.toContain(TOKEN);
  });

  it('gives one message for 404 — unknown, expired or already used — and guesses none', async () => {
    server.use(
      verifications(() => problemResponse('urn:sinapse:problem:resource-not-found')).handler,
    );
    const { root } = await openApp(`/verificar-email?token=${TOKEN}`);
    await vi.waitFor(() =>
      expect(root().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        NOT_ACCEPTED_MESSAGE,
      ),
    );
  });

  it('consumes a pasted token, trimmed, and sends the person to sign in', async () => {
    const verified = verifications(() => new HttpResponse(null, { status: 204 }));
    server.use(verified.handler);
    const { root, router, settle } = await openApp('/verificar-email');
    type(root(), `  ${TOKEN}\n`);
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    expect(verified.received.map((request) => request.body)).toEqual([{ token: TOKEN }]);
    expect(root().textContent).toContain('Seu e-mail foi confirmado.');
  });

  it('marks the field on a 404 of a pasted token, and moves focus to it', async () => {
    server.use(
      verifications(() => problemResponse('urn:sinapse:problem:resource-not-found')).handler,
    );
    const { root, settle } = await openApp('/verificar-email');
    type(root(), TOKEN);
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    const input = root().querySelector('#verification-token') as HTMLInputElement;
    await vi.waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    expect(
      root()
        .querySelector(`#${input.getAttribute('aria-describedby')}`)
        ?.textContent?.trim(),
    ).toBe(NOT_ACCEPTED_MESSAGE);
    expect(document.activeElement).toBe(input);
  });

  it('refuses an empty field on this side, without a request', async () => {
    const verified = verifications(() => new HttpResponse(null, { status: 204 }));
    server.use(verified.handler);
    const { root, settle } = await openApp('/verificar-email');
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(verified.received).toEqual([]);
    expect(root().querySelector('#verification-token')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('tells the wait on a 429 and keeps the submit disabled for it (C6)', async () => {
    server.use(
      verifications(() =>
        problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 240 }),
      ).handler,
    );
    const { root, settle, buttonNamed } = await openApp('/verificar-email');
    type(root(), TOKEN);
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() => expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull());
    expect(root().textContent).toContain('4 minutos');
    expect(buttonNamed('Confirmar e-mail')?.disabled).toBe(true);
  });

  it('shows the error state on a server failure', async () => {
    server.use(verifications(() => problemResponse('urn:sinapse:problem:internal-error')).handler);
    const { root, settle } = await openApp('/verificar-email');
    type(root(), TOKEN);
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
  });

  it('keeps the title free of the token', async () => {
    server.use(verifications(() => new HttpResponse(null, { status: 204 })).handler);
    await openApp(`/verificar-email?token=${TOKEN}`);
    expect(document.title).not.toContain(TOKEN);
  });
});
