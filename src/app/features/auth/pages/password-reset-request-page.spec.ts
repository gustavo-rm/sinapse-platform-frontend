import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import { type RecordedRequest, bodyOf, openApp } from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';
import { RESET_REQUESTED_MESSAGE, RESET_REQUESTED_TITLE } from './password-reset-request-page';

const server = useMswServer();

const anonymous = () =>
  http.get(ApiRoutes.readModel.myState, () =>
    problemResponse('urn:sinapse:problem:unauthenticated'),
  );

function resetsAt(answer: (email: string) => Response) {
  const received: RecordedRequest[] = [];
  const handler = http.post(ApiRoutes.identity.passwordResets, async ({ request }) => {
    const body = (await bodyOf(request)) as { email: string };
    received.push({ method: 'POST', path: new URL(request.url).pathname, body });
    return answer(body.email);
  });
  return { received, handler };
}

async function open() {
  server.use(anonymous());
  const app = await openApp('/esqueci-senha');
  const type = (value: string) => {
    const input = app.root().querySelector<HTMLInputElement>('#reset-email') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    app.root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await app.settle();
  };
  return { ...app, type, submit };
}

/** What the person sees once the request is answered: the whole <main>, as markup. */
async function screenAfterRequest(email: string): Promise<string> {
  const { type, submit, root } = await open();
  type(email);
  await submit();
  await vi.waitFor(() => expect(root().textContent).toContain(RESET_REQUESTED_TITLE));
  return (root().querySelector('main') as HTMLElement).innerHTML;
}

describe('the password-reset request, /esqueci-senha', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('sends {email} and shows the one confirmation, with the way to the code', async () => {
    const resets = resetsAt(() => new HttpResponse(null, { status: 204 }));
    server.use(resets.handler);
    const { type, submit, root, text } = await open();
    type('  pessoa@example.com ');
    await submit();
    await vi.waitFor(() => expect(text()).toContain(RESET_REQUESTED_MESSAGE));
    expect(resets.received.map((request) => request.body)).toEqual([
      { email: 'pessoa@example.com' },
    ]);
    expect(root().querySelector('a[href="/redefinir-senha"]')?.textContent?.trim()).toBe(
      'Já tenho o código',
    );
    // The address typed is not kept, nor shown back.
    expect(text()).not.toContain('pessoa@example.com');
    expect(root().querySelector('#reset-email')).toBeNull();
    // Focus goes to what replaced the form, not to <body>.
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('status'));
  });

  // THE privacy property of this screen. The server answers 204 whether or not the address has an
  // account; the screen must not undo that. If this fails, someone made the message "helpful".
  it('renders the IDENTICAL screen for a registered and an unregistered address', async () => {
    server.use(resetsAt(() => new HttpResponse(null, { status: 204 })).handler);
    const known = await screenAfterRequest('conta.existente@example.com');
    const { TestBed } = await import('@angular/core/testing');
    TestBed.resetTestingModule();
    const unknown = await screenAfterRequest('ninguem.aqui@example.com');
    expect(unknown).toBe(known);
    expect(known).toContain(RESET_REQUESTED_MESSAGE);
    // Worded to hold in both cases: conditional, and claiming no account.
    expect(RESET_REQUESTED_MESSAGE).toMatch(/^Se o endereço informado for de uma conta/);
  });

  it('refuses an empty address on this side, without a request', async () => {
    const resets = resetsAt(() => new HttpResponse(null, { status: 204 }));
    server.use(resets.handler);
    const { submit, root } = await open();
    await submit();
    expect(resets.received).toEqual([]);
    const input = root().querySelector('#reset-email') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);
  });

  it('400: about what was typed, on the field — never about an account', async () => {
    server.use(resetsAt(() => problemResponse('urn:sinapse:problem:validation-failed')).handler);
    const { type, submit, root, text } = await open();
    type('x');
    await submit();
    const input = root().querySelector('#reset-email') as HTMLInputElement;
    await vi.waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    expect(text()).toContain('Informe o e-mail da conta.');
    expect(text()).not.toContain(RESET_REQUESTED_TITLE);
  });

  it('429: tells how long — an hour, for 5 an hour — and keeps the submit disabled', async () => {
    server.use(
      resetsAt(() =>
        problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 3600 }),
      ).handler,
    );
    const { type, submit, root, text, buttonNamed } = await open();
    type('pessoa@example.com');
    await submit();
    await vi.waitFor(() => expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull());
    expect(text()).toContain('Aguarde 1 hora para tentar outra vez.');
    expect(buttonNamed('Pedir redefinição')?.disabled).toBe(true);
    expect(text()).not.toContain(RESET_REQUESTED_TITLE);
  });

  it('shows the error state on a server failure, and no confirmation', async () => {
    server.use(resetsAt(() => problemResponse('urn:sinapse:problem:internal-error')).handler);
    const { type, submit, root, text } = await open();
    type('pessoa@example.com');
    await submit();
    await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
    expect(text()).not.toContain(RESET_REQUESTED_TITLE);
  });
});
