import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { fixture } from '../../../../testing/msw/fixtures';
import { problemAt } from '../../../../testing/msw/scenarios';
import { useMswServer } from '../../../../testing/msw/server';
import { appConfig } from '../../../app.config';
import { ApiRoutes } from '../../../core/api/api-routes';

/**
 * Accessibility of the screens FE-4 adds, as far as a DOM without layout can tell: one <h1>, the
 * keyboard path, labels, and the live regions. Contrast in both themes and the visible focus ring
 * need a real browser and were measured in Chromium (docs/ai/STATE.md, FE-4); the focus ring is
 * one global rule that `scripts/style-literals.test.mjs` keeps from being removed.
 */

const server = useMswServer();

function state(overrides: Record<string, unknown>): JsonBodyType {
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

async function render(url: string) {
  TestBed.configureTestingModule({ providers: appConfig.providers });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { harness, root: harness.fixture.nativeElement as HTMLElement };
}

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
      element.textContent;
    return `${element.tagName.toLowerCase()}:${(label ?? '').trim().replace(/\s+/g, ' ')}`;
  });
}

const GATE_SCREENS: [string, Record<string, unknown>, string][] = [
  ['/conta-suspensa', { accountStatus: 'SUSPENDED' }, 'Conta suspensa'],
  ['/verificar-email', { accountStatus: 'PENDING_VERIFICATION' }, 'Confirme seu e-mail'],
  [
    '/consentimento-do-responsavel',
    { accountStatus: 'PENDING_GUARDIAN_CONSENT' },
    'Consentimento do responsável',
  ],
  [
    '/reafirmar-consentimento',
    { requiresMajorityReaffirmation: true },
    'Reafirme seu consentimento',
  ],
  ['/consentimentos', { pendingConsents: ['ACADEMIC_RESEARCH'] }, 'Consentimentos pendentes'],
  ['/configurar', { setupComplete: false }, 'Configure seus estudos'],
];

describe('accessibility of the session screens', () => {
  describe('sign-in', () => {
    it('has one <h1>, a <main>, and no navigation', async () => {
      const { root } = await render('/entrar');
      expect(root.querySelectorAll('h1')).toHaveLength(1);
      expect(root.querySelectorAll('main')).toHaveLength(1);
      expect(root.querySelector('nav')).toBeNull();
    });

    it('is walked by keyboard: e-mail, password, submit, then the theme', async () => {
      const { root } = await render('/entrar');
      expect(keyboardPath(root)).toEqual([
        'input:E-mail',
        'input:Senha',
        'button:Entrar',
        expect.stringMatching(/^select:/),
      ]);
    });

    it('labels every field', async () => {
      const { root } = await render('/entrar');
      for (const input of root.querySelectorAll('input')) {
        expect(root.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
      }
    });

    it('announces an error in a live region that was already in the page', async () => {
      server.use(
        problemAt('post', ApiRoutes.identity.sessions, 'urn:sinapse:problem:unauthenticated'),
      );
      const { root, harness } = await render('/entrar');
      const region = root.querySelector('form [role="alert"]');
      expect(region).not.toBeNull();
      expect(region?.textContent?.trim()).toBe('');

      const email = root.querySelector<HTMLInputElement>('#sign-in-email') as HTMLInputElement;
      email.value = 'a@example.com';
      email.dispatchEvent(new Event('input'));
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await harness.fixture.whenStable();

      expect(root.querySelector('form [role="alert"]')).toBe(region);
      expect(region?.getAttribute('aria-atomic')).toBe('true');
      expect(region?.textContent?.trim()).not.toBe('');
    });

    it('announces a field error by aria-describedby and aria-invalid', async () => {
      const { root, harness } = await render('/entrar');
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await harness.fixture.whenStable();
      const email = root.querySelector('#sign-in-email');
      expect(email?.getAttribute('aria-invalid')).toBe('true');
      expect(root.querySelector(`#${email?.getAttribute('aria-describedby')}`)).not.toBeNull();
    });
  });

  describe.each(GATE_SCREENS)('%s', (url, overrides, heading) => {
    beforeEach(() => {
      server.use(http.get(ApiRoutes.readModel.myState, () => HttpResponse.json(state(overrides))));
    });

    it('has one <h1>, a sentence, and no control of its own in <main>', async () => {
      const { root } = await render(url);
      expect(root.querySelectorAll('h1')).toHaveLength(1);
      expect(root.querySelector('h1')?.textContent?.trim()).toBe(heading);
      expect(root.querySelector('main p')?.textContent?.trim()).not.toBe('');
      expect(root.querySelectorAll('main a, main button, main input, main select')).toHaveLength(0);
    });

    it('is walked by keyboard: sign out, then the theme', async () => {
      const { root } = await render(url);
      expect(keyboardPath(root)).toEqual(['button:Sair', expect.stringMatching(/^select:/)]);
    });
  });

  it('the terminal screen: one <h1>, and nothing to go back with', async () => {
    server.use(
      http.get(ApiRoutes.readModel.myState, () =>
        HttpResponse.json(state({ accountStatus: 'ANONYMIZED' })),
      ),
    );
    const { root } = await render('/conta-encerrada');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(keyboardPath(root)).toEqual([expect.stringMatching(/^select:/)]);
  });
});
