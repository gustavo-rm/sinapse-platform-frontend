import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import { openApp, placeholderTerms } from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';

/**
 * Accessibility of the four account-entry screens (FE-6: registration, the reset request and the
 * reset confirmation; FE-5's verification, which registration hands over to), as far as a DOM
 * without layout can tell: one <h1>, a <main>, the keyboard path, a label for every field, and the
 * live regions present before their message. Contrast in both themes and the visible focus ring
 * were measured in Chromium (`docs/ai/STATE.md`, FE-6).
 */

const server = useMswServer();

const SCREENS = ['/criar-conta', '/verificar-email', '/esqueci-senha', '/redefinir-senha'] as const;

beforeEach(() => {
  server.use(
    http.get(ApiRoutes.readModel.myState, () =>
      problemResponse('urn:sinapse:problem:unauthenticated'),
    ),
    http.get(ApiRoutes.identity.terms, () => HttpResponse.json(placeholderTerms())),
  );
});

/** The elements Tab reaches, in order, named as a person hears them. */
function keyboardPath(root: HTMLElement): string[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].map((element) => {
    const label =
      element.getAttribute('aria-label') ??
      (element.id ? root.querySelector(`label[for="${element.id}"]`)?.textContent : null) ??
      element.closest('label')?.querySelector('.sn-choice__title')?.textContent ??
      element.textContent;
    return `${element.tagName.toLowerCase()}:${(label ?? '').trim().replace(/\s+/g, ' ')}`;
  });
}

async function render(url: string) {
  const app = await openApp(url);
  if (url === '/criar-conta') {
    await vi.waitFor(() => expect(app.root().querySelector('form')).not.toBeNull());
    await app.settle();
  }
  return app;
}

describe('accessibility of the account-entry screens', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each(SCREENS)('%s has one <h1>, one <main>, and no navigation', async (url) => {
    const { root } = await render(url);
    expect(root().querySelectorAll('h1')).toHaveLength(1);
    expect(root().querySelectorAll('main')).toHaveLength(1);
    expect(root().querySelector('nav')).toBeNull();
  });

  it.each(SCREENS)('%s labels every field it shows', async (url) => {
    const { root } = await render(url);
    for (const field of root().querySelectorAll<HTMLElement>('main input, main select')) {
      const labelled =
        (field.id !== '' && root().querySelector(`label[for="${field.id}"]`) !== null) ||
        field.closest('label') !== null;
      expect(labelled, `${field.outerHTML} has no label`).toBe(true);
    }
  });

  it.each(SCREENS)('%s keeps its alert region in the page before any message', async (url) => {
    const { root } = await render(url);
    const region = root().querySelector('form [role="alert"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-atomic')).toBe('true');
    expect(region?.textContent?.trim()).toBe('');
  });

  it('registration is walked by keyboard in reading order: fields, terms, submit, then sign-in', async () => {
    const { root } = await render('/criar-conta');
    expect(keyboardPath(root())).toEqual([
      'input:E-mail',
      'input:Senha',
      'input:Data de nascimento',
      'select:Fuso horário',
      'input:Li e concordo com esta finalidade',
      'input:Li e concordo com esta finalidade',
      'button:Criar conta',
      'a:Entrar',
      expect.stringMatching(/^select:/),
    ]);
  });

  it('the reset request is walked by keyboard: e-mail, submit, back to sign-in', async () => {
    const { root } = await render('/esqueci-senha');
    expect(keyboardPath(root())).toEqual([
      'input:E-mail',
      'button:Pedir redefinição',
      'a:Voltar para Entrar',
      expect.stringMatching(/^select:/),
    ]);
  });

  it('the reset confirmation is walked by keyboard: code, new password, submit', async () => {
    const { root } = await render('/redefinir-senha');
    expect(keyboardPath(root())).toEqual([
      'input:Código de redefinição',
      'input:Nova senha',
      'button:Redefinir senha',
      expect.stringMatching(/^select:/),
    ]);
  });

  it('registration announces a field error by aria-invalid and aria-describedby', async () => {
    const { root, settle } = await render('/criar-conta');
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    for (const id of ['registration-email', 'registration-password', 'registration-birth']) {
      const field = root().querySelector(`#${id}`);
      expect(field?.getAttribute('aria-invalid')).toBe('true');
      const described = (field?.getAttribute('aria-describedby') ?? '').split(' ');
      expect(
        described.some((ref) => ref.endsWith('-error') && root().querySelector(`#${ref}`)),
      ).toBe(true);
    }
  });

  it('the reset confirmation announces a refused link in its alert region', async () => {
    server.use(
      http.post(ApiRoutes.identity.passwordResetConfirmation, () =>
        problemResponse('urn:sinapse:problem:resource-not-found'),
      ),
    );
    const { root, settle } = await render('/redefinir-senha?token=abc');
    await vi.waitFor(() => expect(root().querySelector('#reset-new-password')).not.toBeNull());
    const region = root().querySelector('form [role="alert"]');
    const password = root().querySelector<HTMLInputElement>(
      '#reset-new-password',
    ) as HTMLInputElement;
    password.value = 'uma-senha-bem-longa';
    password.dispatchEvent(new Event('input'));
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() => expect(region?.textContent?.trim()).not.toBe(''));
    expect(root().querySelector('form [role="alert"]')).toBe(region);
  });
});
