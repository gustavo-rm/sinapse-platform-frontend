import { TestBed } from '@angular/core/testing';
import { HttpResponse, type JsonBodyType, http } from 'msw';

import { problemBody, problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import {
  type RecordedRequest,
  WORDING_ID,
  bodyOf,
  openApp,
  placeholderTerms,
  realTerms,
} from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';
import { AccountTimeService } from '../../../core/time/account-time.service';
import {
  ADDRESS_UNAVAILABLE_MESSAGE,
  REGISTRATION_MESSAGES,
  UNDER_AGE_MESSAGE,
  UNDER_AGE_TITLE,
} from './registration-page';

const server = useMswServer();

const PASSWORD = 'correct-horse-battery-staple';

/** No session: the visitor `/criar-conta` is for. */
const anonymous = () =>
  http.get(ApiRoutes.readModel.myState, () =>
    problemResponse('urn:sinapse:problem:unauthenticated'),
  );

/** `GET /api/v1/terms`, answering each read with the next body (the last one repeats). */
function termsAt(...bodies: JsonBodyType[]) {
  let calls = 0;
  const handler = http.get(ApiRoutes.identity.terms, () => {
    const body = bodies[Math.min(calls, bodies.length - 1)];
    calls++;
    return HttpResponse.json(body);
  });
  return Object.assign(handler, { calls: () => calls });
}

/** `POST /api/v1/accounts`, recording each request; answers with the next answer given. */
function accountsAt(...answers: (() => Response)[]) {
  const received: RecordedRequest[] = [];
  const handler = http.post(ApiRoutes.identity.accounts, async ({ request }) => {
    received.push({
      method: 'POST',
      path: new URL(request.url).pathname,
      body: await bodyOf(request),
    });
    return answers[Math.min(received.length - 1, answers.length - 1)]();
  });
  return { received, handler };
}

const created = () =>
  HttpResponse.json(
    { accountId: '9ff3ddbc-6007-44a8-bce0-cb904d94ffd2', status: 'PENDING_VERIFICATION' },
    { status: 201 },
  );

async function open(terms: JsonBodyType[] = [placeholderTerms()]) {
  const termsHandler = termsAt(...terms);
  server.use(anonymous(), termsHandler);
  const app = await openApp('/criar-conta');
  await vi.waitFor(() =>
    expect(app.root().querySelectorAll('sn-consent-disclosure').length).toBeGreaterThan(0),
  );
  await app.settle();
  const input = (id: string) =>
    app.root().querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
  const type = (id: string, value: string) => {
    const element = input(id);
    element.value = value;
    element.dispatchEvent(new Event('input'));
  };
  const disclosure = (title: string) =>
    [...app.root().querySelectorAll<HTMLElement>('sn-consent-disclosure')].find((element) =>
      element.querySelector('.sn-card__title')?.textContent?.includes(title),
    ) as HTMLElement;
  const box = (title: string) =>
    disclosure(title).querySelector<HTMLInputElement>('input[type="checkbox"]') as HTMLInputElement;
  const fill = (dateOfBirth = '1996-01-01') => {
    type('registration-email', 'pessoa@example.com');
    type('registration-password', PASSWORD);
    type('registration-birth', dateOfBirth);
  };
  const submit = async () => {
    app.root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await app.settle();
  };
  return { ...app, termsHandler, input, type, disclosure, box, fill, submit };
}

const ESSENTIAL = 'Processamento de dados de aprendizagem';
const RESEARCH = 'Pesquisa acadêmica';

describe('registration, /criar-conta', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  describe('what it shows before anything is typed', () => {
    it('reads the terms first and shows the FULL text of each purpose before its control', async () => {
      const { disclosure } = await open([realTerms()]);
      for (const [title, text] of [
        [ESSENTIAL, 'Texto do processamento de dados de aprendizagem.'],
        [RESEARCH, 'Texto da pesquisa, versão 2.\nSegundo parágrafo.'],
      ]) {
        const card = disclosure(title);
        const body = card.querySelector('.sn-terms__body') as HTMLElement;
        expect(body.textContent).toBe(text);
        // The text comes before the control in the document.
        const control = card.querySelector('input[type="checkbox"]') as HTMLElement;
        expect(
          body.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });

    it('offers only the essential purpose and research — never institution sharing (F1, K-I)', async () => {
      const { root, text } = await open([realTerms()]);
      expect(root().querySelectorAll('sn-consent-disclosure')).toHaveLength(2);
      expect(text()).not.toContain('Texto do compartilhamento com a turma.');
      expect(text()).not.toContain('Compartilhamento');
    });

    it('starts with NOTHING checked, and marks no purpose as recommended or as a lesser choice', async () => {
      const { root, box, disclosure, text } = await open();
      expect(root().querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
      expect(box(ESSENTIAL).checked).toBe(false);
      expect(box(RESEARCH).checked).toBe(false);
      expect(box(RESEARCH).defaultChecked).toBe(false);
      expect(box(RESEARCH).hasAttribute('checked')).toBe(false);
      expect(text().toLowerCase()).not.toContain('recomend');
      expect(
        root().querySelectorAll(
          '.sn-alert--warning, .sn-alert--error, .sn-badge--warning, .sn-badge--error, .sn-field--invalid',
        ),
      ).toHaveLength(0);
      // The same component, the same classes, for the essential purpose and the optional one.
      const shape = (title: string) =>
        [...disclosure(title).querySelectorAll('*')].map((element) => element.className).join(' ');
      expect(shape(RESEARCH)).toBe(shape(ESSENTIAL));
      expect(disclosure(RESEARCH).textContent).toContain('Recusar não muda nada no serviço.');
    });

    it('states the password policy before the person types', async () => {
      const { input, root } = await open();
      const password = input('registration-password');
      const hint = root().querySelector('#registration-password-hint');
      expect(hint?.textContent?.trim()).toBe('De 12 a 256 caracteres.');
      expect(password.getAttribute('aria-describedby')).toContain('registration-password-hint');
      expect(password.value).toBe('');
    });

    it('suggests the browser zone, and the person can change it', async () => {
      const { input } = await open();
      const suggested = TestBed.inject(AccountTimeService).suggestedZone();
      const zone = input('registration-zone') as unknown as HTMLSelectElement;
      expect(zone.value).toBe(suggested ?? '');
      expect([...zone.options].map((option) => option.value)).toContain('Asia/Tokyo');
    });

    it('shows the loading state while the terms are read, and no form', async () => {
      let seen: { loading: boolean; form: boolean } | null = null;
      server.use(
        anonymous(),
        http.get(ApiRoutes.identity.terms, async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          // TestBed renders into the document: what the person sees while the read is under way.
          seen = {
            loading: document.querySelector('sn-loading-state') !== null,
            form: document.querySelector('sn-registration-page form') !== null,
          };
          return HttpResponse.json(placeholderTerms());
        }),
      );
      const { root } = await openApp('/criar-conta');
      expect(seen).toEqual({ loading: true, form: false });
      expect(root().querySelector('sn-loading-state')).toBeNull();
    });

    it('shows the error state when the terms cannot be read, and no form', async () => {
      server.use(
        anonymous(),
        http.get(ApiRoutes.identity.terms, () =>
          problemResponse('urn:sinapse:problem:internal-error'),
        ),
      );
      const { root, settle } = await openApp('/criar-conta');
      await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
      await settle();
      expect(root().querySelector('form')).toBeNull();
    });

    it('shows the rate-limit notice when the terms read is limited', async () => {
      server.use(
        anonymous(),
        http.get(ApiRoutes.identity.terms, () =>
          problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 120 }),
        ),
      );
      const { root, text } = await openApp('/criar-conta');
      await vi.waitFor(() => expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull());
      expect(text()).toContain('2 minutos');
    });

    it('says registration is unavailable when the essential wording is not published', async () => {
      const onlyResearch = (placeholderTerms() as { purpose: string }[]).filter(
        (entry) => entry.purpose === 'ACADEMIC_RESEARCH',
      );
      server.use(anonymous(), termsAt(onlyResearch as JsonBodyType));
      const { root, text } = await openApp('/criar-conta');
      await vi.waitFor(() => expect(root().querySelector('sn-empty-state')).not.toBeNull());
      expect(text()).toContain('O cadastro não está disponível agora');
      expect(root().querySelector('form')).toBeNull();
    });
  });

  describe('the success', () => {
    it('with research REFUSED: succeeds, sends only the essential wording on screen, and opens no session', async () => {
      const accounts = accountsAt(created);
      const sessions: string[] = [];
      server.use(
        accounts.handler,
        http.post(ApiRoutes.identity.sessions, () => {
          sessions.push('POST');
          return new HttpResponse(null, { status: 500 });
        }),
      );
      const { fill, box, submit, router, store, text } = await open();
      fill();
      box(ESSENTIAL).click();
      await submit();

      await vi.waitFor(() => expect(router.url).toBe('/verificar-email'));
      expect(accounts.received).toHaveLength(1);
      expect(accounts.received[0].body).toEqual({
        email: 'pessoa@example.com',
        password: PASSWORD,
        dateOfBirth: '1996-01-01',
        timeZone: TestBed.inject(AccountTimeService).suggestedZone(),
        acceptedTerms: [
          {
            purpose: 'LEARNING_DATA_PROCESSING',
            termsVersionId: WORDING_ID.LEARNING_DATA_PROCESSING,
          },
        ],
      });
      expect(sessions).toEqual([]);
      expect(store.isSignedIn()).toBe(false);
      // The handoff: the verification screen says what happened and what has to happen next.
      expect(text()).toContain('Conta criada.');
      expect(text()).toContain('a conta só fica ativa depois disso');
      expect(text()).toContain('DEV ONLY');
    });

    it('with research accepted: sends both wordings, each the one on screen', async () => {
      const accounts = accountsAt(created);
      server.use(accounts.handler);
      const { fill, box, submit, router } = await open([realTerms()]);
      fill();
      box(ESSENTIAL).click();
      box(RESEARCH).click();
      await submit();

      await vi.waitFor(() => expect(router.url).toBe('/verificar-email'));
      expect((accounts.received[0].body as { acceptedTerms: unknown }).acceptedTerms).toEqual([
        { purpose: 'LEARNING_DATA_PROCESSING', termsVersionId: 'ldp-v1' },
        // The most recently published research wording — the one displayed — never the older one.
        { purpose: 'ACADEMIC_RESEARCH', termsVersionId: 'research-v2' },
      ]);
    });

    it('sends the date of birth exactly as typed, whatever the zone (a local date never shifts)', async () => {
      const accounts = accountsAt(created);
      server.use(accounts.handler);
      const { fill, box, submit, router } = await open();
      // The first and last instants of a day are where a zone conversion would move it.
      fill('2000-01-01');
      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() => expect(router.url).toBe('/verificar-email'));
      expect((accounts.received[0].body as { dateOfBirth: string }).dateOfBirth).toBe('2000-01-01');
    });

    it('sends the zone the person chose instead of the suggestion', async () => {
      const accounts = accountsAt(created);
      server.use(accounts.handler);
      const { fill, box, submit, router, input } = await open();
      fill();
      const zone = input('registration-zone') as unknown as HTMLSelectElement;
      zone.value = 'Asia/Tokyo';
      zone.dispatchEvent(new Event('change'));
      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() => expect(router.url).toBe('/verificar-email'));
      expect((accounts.received[0].body as { timeZone: string }).timeZone).toBe('Asia/Tokyo');
    });
  });

  describe('what this side refuses, without a request', () => {
    it('requires the essential purpose, says so on its control, and moves focus there', async () => {
      const accounts = accountsAt(created);
      server.use(accounts.handler);
      const { fill, submit, box, root } = await open();
      fill();
      await submit();
      expect(accounts.received).toEqual([]);
      const control = box(ESSENTIAL);
      expect(control.getAttribute('aria-invalid')).toBe('true');
      const described = (control.getAttribute('aria-describedby') ?? '').split(' ');
      const messages = described.map((id) => root().querySelector(`#${id}`)?.textContent?.trim());
      expect(messages).toContain(REGISTRATION_MESSAGES.essential);
      expect(document.activeElement).toBe(control);
      // Research was not required, and nothing points at it.
      expect(box(RESEARCH).getAttribute('aria-invalid')).toBeNull();
    });

    it.each([
      [
        'a password shorter than 12',
        'curta-11ch',
        'registration-password',
        REGISTRATION_MESSAGES.password,
      ],
      [
        'a password longer than 256',
        'x'.repeat(257),
        'registration-password',
        REGISTRATION_MESSAGES.password,
      ],
    ])('refuses %s', async (_name, password, id, message) => {
      const accounts = accountsAt(created);
      server.use(accounts.handler);
      const { fill, type, box, submit, input, root } = await open();
      fill();
      type('registration-password', password);
      box(ESSENTIAL).click();
      await submit();
      expect(accounts.received).toEqual([]);
      expect(input(id).getAttribute('aria-invalid')).toBe('true');
      expect(root().querySelector(`#${id}-error`)?.textContent?.trim()).toBe(message);
      expect(document.activeElement).toBe(input(id));
    });

    it('requires the e-mail and the date of birth, but does not judge the e-mail format: the server does', async () => {
      const accounts = accountsAt(created);
      server.use(accounts.handler);
      const { type, box, submit, input, router } = await open();
      type('registration-password', PASSWORD);
      box(ESSENTIAL).click();
      await submit();
      expect(accounts.received).toEqual([]);
      expect(input('registration-email').getAttribute('aria-invalid')).toBe('true');
      expect(input('registration-birth').getAttribute('aria-invalid')).toBe('true');

      type('registration-email', 'sem-arroba');
      type('registration-birth', '1996-01-01');
      await submit();
      await vi.waitFor(() => expect(router.url).toBe('/verificar-email'));
      expect((accounts.received[0].body as { email: string }).email).toBe('sem-arroba');
    });
  });

  describe('each declared error', () => {
    it('400: marks each field the server named, with this client’s words, never the server’s', async () => {
      server.use(
        accountsAt(() =>
          HttpResponse.json(
            {
              ...problemBody('urn:sinapse:problem:validation-failed'),
              errors: [
                { field: 'email', message: 'must be a well-formed email address' },
                { field: 'dateOfBirth', message: 'must be a past date' },
                { field: 'timeZone', message: 'must be an IANA time zone identifier' },
              ],
            },
            { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ).handler,
      );
      const { fill, box, submit, input, root, text } = await open();
      fill();
      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() =>
        expect(input('registration-email').getAttribute('aria-invalid')).toBe('true'),
      );
      expect(root().querySelector('#registration-email-error')?.textContent?.trim()).toBe(
        REGISTRATION_MESSAGES.email,
      );
      expect(root().querySelector('#registration-birth-error')?.textContent?.trim()).toBe(
        REGISTRATION_MESSAGES.dateOfBirth,
      );
      expect(root().querySelector('#registration-zone-error')?.textContent?.trim()).toBe(
        REGISTRATION_MESSAGES.timeZone,
      );
      expect(input('registration-password').getAttribute('aria-invalid')).toBeNull();
      expect(text()).not.toContain('must be');
      expect(document.activeElement).toBe(input('registration-email'));
    });

    it('400 on the accepted terms (institutionSharingAbsent): points at the terms', async () => {
      server.use(
        accountsAt(() =>
          HttpResponse.json(
            {
              ...problemBody('urn:sinapse:problem:validation-failed'),
              errors: [
                {
                  field: 'institutionSharingAbsent',
                  message: 'sharing with an institution is consented to when an invite is redeemed',
                },
              ],
            },
            { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ).handler,
      );
      const { fill, box, submit, text } = await open();
      fill();
      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() => expect(text()).toContain(REGISTRATION_MESSAGES.terms));
      expect(text()).not.toContain('invite');
    });

    it('422: says so plainly, blames nobody, and offers nothing that does not exist', async () => {
      const accounts = accountsAt(() =>
        problemResponse('urn:sinapse:problem:minor-registration-not-supported'),
      );
      server.use(accounts.handler);
      const { fill, box, submit, root, text, router } = await open();
      fill('2012-06-15');
      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() => expect(text()).toContain(UNDER_AGE_TITLE));
      const alert = root().querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(UNDER_AGE_MESSAGE);
      expect(router.url).toBe('/criar-conta');
      // No guardian's address asked for — no route would receive it — and no new field at all.
      expect(
        root().querySelectorAll('form input:not([type="checkbox"]), form select'),
      ).toHaveLength(4);
      expect(text().toLowerCase()).not.toMatch(/e-mail do responsável|e-mail de um responsável/);
    });

    it('429: tells how long — an hour, for 5 an hour — and keeps the submit disabled', async () => {
      server.use(
        accountsAt(() =>
          problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 3600 }),
        ).handler,
      );
      const { fill, box, submit, root, text, buttonNamed } = await open();
      fill();
      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() => expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull());
      expect(text()).toContain('Aguarde 1 hora para tentar outra vez.');
      expect(buttonNamed('Criar conta')?.disabled).toBe(true);
      expect(root().querySelector('sn-rate-limit-notice button')).toBeNull();
    });

    it('shows the error state on a server failure', async () => {
      server.use(accountsAt(() => problemResponse('urn:sinapse:problem:internal-error')).handler);
      const { fill, box, submit, root } = await open();
      fill();
      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
    });
  });

  describe('409 — decision G2: the terms are read again and compared', () => {
    function movedEssential(): JsonBodyType {
      return [
        {
          id: 'ldp-dev-1',
          purpose: 'LEARNING_DATA_PROCESSING',
          version: 'dev-1',
          body: 'Development placeholder, second version. Not a consent term.',
          publishedAt: '2026-11-11T00:40:34.000Z',
        },
        ...(placeholderTerms() as object[]),
      ] as JsonBodyType;
    }

    it('wording MOVED: shows the new text, unchecks the stale acceptance, says so, and sends the new id next', async () => {
      const accounts = accountsAt(() => problemResponse('urn:sinapse:problem:conflict'), created);
      server.use(accounts.handler);
      const { fill, box, submit, disclosure, root, text, router, termsHandler } = await open([
        placeholderTerms(),
        movedEssential(),
      ]);
      fill();
      box(ESSENTIAL).click();
      await submit();

      await vi.waitFor(() =>
        expect(text()).toContain(
          'O texto de "Processamento de dados de aprendizagem" mudou desde que esta página foi aberta.',
        ),
      );
      expect(termsHandler.calls()).toBe(2);
      expect(disclosure(ESSENTIAL).textContent).toContain('versão dev-1');
      expect(disclosure(ESSENTIAL).querySelector('.sn-terms__body')?.textContent).toBe(
        'Development placeholder, second version. Not a consent term.',
      );
      expect(box(ESSENTIAL).checked).toBe(false);
      expect(root().querySelector('[role="alert"]')?.textContent).toContain(
        'Leia a versão em vigor',
      );
      expect(router.url).toBe('/criar-conta');

      box(ESSENTIAL).click();
      await submit();
      await vi.waitFor(() => expect(router.url).toBe('/verificar-email'));
      expect((accounts.received[1].body as { acceptedTerms: unknown }).acceptedTerms).toEqual([
        { purpose: 'LEARNING_DATA_PROCESSING', termsVersionId: 'ldp-dev-1' },
      ]);
    });

    it('wording UNCHANGED: the address — says it cannot be used, offers sign-in and reset, asserts no account', async () => {
      const accounts = accountsAt(() => problemResponse('urn:sinapse:problem:conflict'));
      server.use(accounts.handler);
      const { fill, box, submit, root, text, input, termsHandler } = await open();
      fill();
      box(ESSENTIAL).click();
      await submit();

      await vi.waitFor(() => expect(text()).toContain(ADDRESS_UNAVAILABLE_MESSAGE));
      expect(termsHandler.calls()).toBe(2);
      const alert = root().querySelector('[role="alert"]') as HTMLElement;
      expect(alert.querySelector('a[href="/entrar"]')?.textContent?.trim()).toBe('Entrar');
      expect(alert.querySelector('a[href="/esqueci-senha"]')?.textContent?.trim()).toBe(
        'Redefinir a senha',
      );
      expect(input('registration-email').getAttribute('aria-invalid')).toBe('true');
      expect(text()).not.toMatch(/já existe uma conta|já está cadastrad/i);
      // The acceptance stays: nothing about the wording was wrong.
      expect(box(ESSENTIAL).checked).toBe(true);
    });

    it('when the terms cannot be read again, shows the error state rather than guessing', async () => {
      let reads = 0;
      server.use(
        accountsAt(() => problemResponse('urn:sinapse:problem:conflict')).handler,
        http.get(ApiRoutes.identity.terms, () =>
          reads++ === 0
            ? HttpResponse.json(placeholderTerms())
            : problemResponse('urn:sinapse:problem:internal-error'),
        ),
        anonymous(),
      );
      const app = await openApp('/criar-conta');
      await vi.waitFor(() =>
        expect(app.root().querySelectorAll('sn-consent-disclosure').length).toBe(2),
      );
      const type = (id: string, value: string) => {
        const element = app.root().querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
        element.value = value;
        element.dispatchEvent(new Event('input'));
      };
      type('registration-email', 'pessoa@example.com');
      type('registration-password', PASSWORD);
      type('registration-birth', '1996-01-01');
      (app.root().querySelector('input[type="checkbox"]') as HTMLInputElement).click();
      app.root().querySelector('form')?.dispatchEvent(new Event('submit'));
      await app.settle();
      await vi.waitFor(() =>
        expect(app.root().querySelector('form sn-error-state')).not.toBeNull(),
      );
      expect(app.text()).not.toContain(ADDRESS_UNAVAILABLE_MESSAGE);
      expect(app.text()).not.toContain('mudou desde que esta página foi aberta');
    });
  });
});
