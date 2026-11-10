import { HttpResponse, type JsonBodyType, http } from 'msw';

import { mswPath } from '../../../../testing/msw/handlers/handlers-from-snapshot';
import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import {
  type RecordedRequest,
  WORDING_ID,
  bodyOf,
  consentRecord,
  openApp,
  placeholderTerms,
  realTerms,
  stateBody,
  stateServer,
} from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ConsentPurpose } from '../../../core/api/contract/enums';

const server = useMswServer();

/** Answers the consent routes from a history this test controls, recording every write. */
function consentServer(initial: JsonBodyType[], terms: JsonBodyType = placeholderTerms()) {
  let history = [...initial];
  const writes: RecordedRequest[] = [];
  return {
    writes,
    setHistory: (next: JsonBodyType[]) => (history = next),
    handlers: [
      http.get(ApiRoutes.identity.terms, () => HttpResponse.json(terms)),
      http.get(ApiRoutes.identity.consents, () => HttpResponse.json(history)),
      http.post(ApiRoutes.identity.consents, async ({ request }) => {
        const body = (await bodyOf(request)) as { purpose: ConsentPurpose };
        writes.push({ method: 'POST', path: ApiRoutes.identity.consents, body });
        history = [consentRecord(body.purpose), ...history];
        return new HttpResponse(null, { status: 201 });
      }),
      http.delete(mswPath(ApiRoutes.identity.consent.template), ({ params }) => {
        const purpose = params['purpose'] as ConsentPurpose;
        writes.push({
          method: 'DELETE',
          path: ApiRoutes.identity.consent({ purpose }),
          body: undefined,
        });
        history = history.map((record) =>
          (record as { purpose: string }).purpose === purpose
            ? consentRecord(purpose, true)
            : record,
        );
        return new HttpResponse(null, { status: 204 });
      }),
    ],
  };
}

/** The card of a purpose, by its heading. */
function cardOf(root: HTMLElement, heading: string): HTMLElement {
  const title = [...root.querySelectorAll('h2')].find((h) => h.textContent?.trim() === heading);
  const card = title?.closest('section');
  if (!card) {
    throw new Error(`No card "${heading}"`);
  }
  return card as HTMLElement;
}

const RESEARCH = 'Pesquisa acadêmica';
const ESSENTIAL = 'Processamento de dados de aprendizagem';
const SHARING = 'Compartilhamento com a turma';

describe('the consent settings screen, /conta/consentimentos', () => {
  it('shows each purpose in full, with its version, and the development marker', async () => {
    const consents = consentServer([consentRecord('LEARNING_DATA_PROCESSING')]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    const { root, text } = await openApp('/conta/consentimentos');

    expect(root().querySelectorAll('h1')).toHaveLength(1);
    for (const heading of [ESSENTIAL, SHARING, RESEARCH]) {
      const card = cardOf(root(), heading);
      expect(card.textContent).toContain('Development placeholder. Not a consent term.');
      expect(card.textContent).toContain('versão dev-0');
      expect(card.textContent).toContain('Texto provisório de desenvolvimento');
    }
    expect(text()).toContain('Em vigor desde 10 de novembro de 2026, na versão dev-0');
  });

  it('offers research to an account that declined it, never pre-checked, never recommended, never in warning colour', async () => {
    const consents = consentServer([consentRecord('LEARNING_DATA_PROCESSING')]);
    server.use(
      stateServer(stateBody({ pendingConsents: ['ACADEMIC_RESEARCH'] })).handler,
      ...consents.handlers,
    );
    const { root } = await openApp('/conta/consentimentos');

    const card = cardOf(root(), RESEARCH);
    expect(card.textContent).toContain('Sem consentimento em vigor');
    expect(card.textContent).toContain('Recusar não muda nada no serviço.');
    expect(card.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
    expect(card.textContent?.toLowerCase()).not.toMatch(/recomendad|sugerid/);
    expect(
      card.querySelector(
        '.sn-alert--warning, .sn-alert--error, .sn-badge--warning, .sn-btn--danger',
      ),
    ).toBeNull();
    // The same badge as every other purpose: the word carries the difference, not a colour.
    expect(card.querySelector('.sn-badge')?.className).toBe(
      cardOf(root(), ESSENTIAL).querySelector('.sn-badge')?.className,
    );
  });

  it('grants research with the id of the wording displayed, then re-reads the state and stays', async () => {
    const consents = consentServer([consentRecord('LEARNING_DATA_PROCESSING')], realTerms());
    const state = stateServer(stateBody({ pendingConsents: ['ACADEMIC_RESEARCH'] }));
    server.use(state.handler, ...consents.handlers);
    const { root, router, settle } = await openApp('/conta/consentimentos');
    const before = state.calls();

    const card = cardOf(root(), RESEARCH);
    // The newest wording, in full — not the superseded one.
    expect(card.textContent).toContain('Texto da pesquisa, versão 2.');
    expect(card.textContent).not.toContain('versão 1.');
    [...card.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Dar consentimento'))
      ?.click();
    await settle();
    await vi.waitFor(() => expect(consents.writes).toHaveLength(1));

    expect(consents.writes[0].body).toEqual({
      purpose: 'ACADEMIC_RESEARCH',
      termsVersionId: 'research-v2',
    });
    await vi.waitFor(() => expect(state.calls()).toBe(before + 1));
    expect(router.url).toBe('/conta/consentimentos');
    await vi.waitFor(() => expect(root().textContent).toContain('Consentimento registrado.'));
  });

  it('withdraws research with no confirmation and no warning: no harder than granting', async () => {
    const consents = consentServer([
      consentRecord('LEARNING_DATA_PROCESSING'),
      consentRecord('ACADEMIC_RESEARCH'),
    ]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    const { root, settle } = await openApp('/conta/consentimentos');

    const card = cardOf(root(), RESEARCH);
    expect(card.textContent).toContain('Nada muda no serviço.');
    expect(card.textContent).not.toMatch(/suspend/i);
    [...card.querySelectorAll('button')].find((b) => b.textContent?.includes('Retirar'))?.click();
    await settle();

    expect(root().querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() =>
      expect(consents.writes).toEqual([
        {
          method: 'DELETE',
          path: ApiRoutes.identity.consent({ purpose: 'ACADEMIC_RESEARCH' }),
          body: undefined,
        },
      ]),
    );
  });

  it('warns that withdrawing the essential consent suspends the account, BEFORE any request', async () => {
    const consents = consentServer([consentRecord('LEARNING_DATA_PROCESSING')]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    const { root, settle } = await openApp('/conta/consentimentos');

    const card = cardOf(root(), ESSENTIAL);
    // On the screen already, before the act: not a tooltip, not fine print.
    expect(card.querySelector('.sn-alert--warning')?.textContent).toContain('suspende a sua conta');
    expect(card.textContent).toContain('dar o consentimento de novo não reativa a conta');

    [...card.querySelectorAll('button')].find((b) => b.textContent?.includes('Retirar'))?.click();
    await settle();
    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('encerra todas as suas sessões');

    const confirm = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('suspender a conta'),
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    await settle();
    expect(consents.writes).toEqual([]);

    // A wrong word keeps it disabled, and Esc does not close a destructive dialog.
    const word = dialog.querySelector('input') as HTMLInputElement;
    word.value = 'sim';
    word.dispatchEvent(new Event('input'));
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(confirm.disabled).toBe(true);
    expect(root().querySelector('[role="dialog"]')).not.toBeNull();
    expect(consents.writes).toEqual([]);
  });

  it('after the typed confirmation, withdraws it and lets the expiry path end the session', async () => {
    const consents = consentServer([consentRecord('LEARNING_DATA_PROCESSING')]);
    const state = stateServer(stateBody());
    server.use(state.handler, ...consents.handlers);
    // The backend revokes every session in the same transaction as the withdrawal.
    server.use(
      http.delete(mswPath(ApiRoutes.identity.consent.template), () => {
        consents.writes.push({
          method: 'DELETE',
          path: 'LEARNING_DATA_PROCESSING',
          body: undefined,
        });
        state.unauthenticated();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { root, settle, router, store } = await openApp('/conta/consentimentos');

    [...cardOf(root(), ESSENTIAL).querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Retirar'))
      ?.click();
    await settle();
    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    const word = dialog.querySelector('input') as HTMLInputElement;
    word.value = 'suspender';
    word.dispatchEvent(new Event('input'));
    await settle();
    (
      [...dialog.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('suspender a conta'),
      ) as HTMLButtonElement
    ).click();
    await settle();

    await vi.waitFor(() => expect(router.url).toBe('/entrar'));
    expect(consents.writes).toHaveLength(1);
    expect(store.status()).toBe('signed-out');
    expect(store.notice()).toBe('session-expired');
  });

  it('confirms the withdrawal of sharing as an ordinary decision, saying nothing of suspension', async () => {
    const consents = consentServer([
      consentRecord('LEARNING_DATA_PROCESSING'),
      consentRecord('INSTITUTION_SHARING'),
    ]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    const { root, settle } = await openApp('/conta/consentimentos');

    const card = cardOf(root(), SHARING);
    expect(card.textContent).toContain('encerra imediatamente o acesso dos professores');
    expect(card.textContent).not.toMatch(/suspend/i);
    [...card.querySelectorAll('button')].find((b) => b.textContent?.includes('Retirar'))?.click();
    await settle();
    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('input')).toBeNull();
    expect(dialog.textContent).not.toMatch(/suspend/i);
    expect(consents.writes).toEqual([]);

    (
      [...dialog.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Retirar consentimento',
      ) as HTMLButtonElement
    ).click();
    await settle();
    await vi.waitFor(() =>
      expect(consents.writes.map((w) => w.path)).toEqual([
        ApiRoutes.identity.consent({ purpose: 'INSTITUTION_SHARING' }),
      ]),
    );
  });

  it('cancels a confirmation without a request, and returns focus to the button that opened it', async () => {
    const consents = consentServer([
      consentRecord('LEARNING_DATA_PROCESSING'),
      consentRecord('INSTITUTION_SHARING'),
    ]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    const { root, settle } = await openApp('/conta/consentimentos');

    const opener = [...cardOf(root(), SHARING).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Retirar'),
    ) as HTMLButtonElement;
    opener.focus();
    opener.click();
    await settle();
    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(root().querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(consents.writes).toEqual([]);
  });

  it('offers no grant of sharing: only an invite does that (F1)', async () => {
    const consents = consentServer([consentRecord('LEARNING_DATA_PROCESSING')]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    const { root } = await openApp('/conta/consentimentos');
    const card = cardOf(root(), SHARING);
    expect([...card.querySelectorAll('button')]).toHaveLength(0);
    expect(card.textContent).toContain('Consentido somente ao entrar em uma turma por convite.');
  });

  it('reads 409 on a grant as a changed state: re-reads, and says so', async () => {
    const consents = consentServer([consentRecord('LEARNING_DATA_PROCESSING')]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    server.use(
      http.post(ApiRoutes.identity.consents, () => problemResponse('urn:sinapse:problem:conflict')),
    );
    const { root, settle } = await openApp('/conta/consentimentos');
    [...cardOf(root(), RESEARCH).querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Dar'))
      ?.click();
    await settle();
    await vi.waitFor(() =>
      expect(root().textContent).toContain('A situação deste consentimento mudou'),
    );
    expect(root().querySelector('sn-error-state')).toBeNull();
  });

  it('reads 404 on a withdrawal as "already not in force"', async () => {
    const consents = consentServer([
      consentRecord('LEARNING_DATA_PROCESSING'),
      consentRecord('ACADEMIC_RESEARCH'),
    ]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    server.use(
      http.delete(mswPath(ApiRoutes.identity.consent.template), () =>
        problemResponse('urn:sinapse:problem:resource-not-found'),
      ),
    );
    const { root, settle } = await openApp('/conta/consentimentos');
    [...cardOf(root(), RESEARCH).querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Retirar'))
      ?.click();
    await settle();
    await vi.waitFor(() => expect(root().textContent).toContain('já não estava em vigor'));
  });

  it('shows the four states of its reads: loading, error, rate-limited, and the content', async () => {
    server.use(
      stateServer(stateBody()).handler,
      http.get(ApiRoutes.identity.terms, () => HttpResponse.json(placeholderTerms())),
      http.get(ApiRoutes.identity.consents, () =>
        problemResponse('urn:sinapse:problem:internal-error'),
      ),
    );
    const failed = await openApp('/conta/consentimentos');
    await vi.waitFor(() => expect(failed.root().querySelector('sn-error-state')).not.toBeNull());
    expect(failed.text()).toContain('Nenhum consentimento foi alterado.');
  });

  it('shows the rate-limit notice, with no retry control, when a read is limited', async () => {
    server.use(
      stateServer(stateBody()).handler,
      http.get(ApiRoutes.identity.terms, () => HttpResponse.json(placeholderTerms())),
      http.get(ApiRoutes.identity.consents, () =>
        problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 120 }),
      ),
    );
    const { root, text } = await openApp('/conta/consentimentos');
    await vi.waitFor(() => expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull());
    expect(text()).toContain('2 minutos');
    expect(root().querySelector('sn-rate-limit-notice button')).toBeNull();
  });

  it('shows a skeleton while it reads', async () => {
    let seenWhileReading: boolean | null = null;
    server.use(
      stateServer(stateBody()).handler,
      http.get(ApiRoutes.identity.terms, async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        // TestBed renders into the document: what the person sees while the read is under way.
        seenWhileReading = document.querySelector('sn-loading-state') !== null;
        return HttpResponse.json(placeholderTerms());
      }),
      http.get(ApiRoutes.identity.consents, () =>
        HttpResponse.json([consentRecord('LEARNING_DATA_PROCESSING')]),
      ),
    );
    const { root } = await openApp('/conta/consentimentos');
    expect(seenWhileReading).toBe(true);
    expect(root().querySelector('sn-loading-state')).toBeNull();
  });

  it('is reached from the account area', async () => {
    server.use(stateServer(stateBody()).handler);
    const { root } = await openApp('/conta');
    expect(root().querySelector('a[href="/conta/consentimentos"]')?.textContent?.trim()).toBe(
      'Consentimentos',
    );
  });

  it('keeps the wording id it was given, not one from the history (never a remembered id)', async () => {
    const consents = consentServer([
      consentRecord('LEARNING_DATA_PROCESSING'),
      { ...(consentRecord('ACADEMIC_RESEARCH', true) as object), termsVersionId: 'stale-id' },
    ]);
    server.use(stateServer(stateBody()).handler, ...consents.handlers);
    const { root, settle } = await openApp('/conta/consentimentos');
    [...cardOf(root(), RESEARCH).querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Dar'))
      ?.click();
    await settle();
    await vi.waitFor(() => expect(consents.writes).toHaveLength(1));
    expect(consents.writes[0].body).toEqual({
      purpose: 'ACADEMIC_RESEARCH',
      termsVersionId: WORDING_ID.ACADEMIC_RESEARCH,
    });
  });
});
