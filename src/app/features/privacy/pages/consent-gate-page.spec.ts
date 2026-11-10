import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import {
  type RecordedRequest,
  bodyOf,
  openApp,
  realTerms,
  stateBody,
  stateServer,
} from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';

const server = useMswServer();

/** The gate holds on the essential purpose only; research rides along when it is pending too. */
const GATED = stateBody({
  pendingConsents: ['LEARNING_DATA_PROCESSING', 'ACADEMIC_RESEARCH'],
});

function grants() {
  const writes: RecordedRequest[] = [];
  const handler = http.post(ApiRoutes.identity.consents, async ({ request }) => {
    writes.push({ method: 'POST', path: ApiRoutes.identity.consents, body: await bodyOf(request) });
    return new HttpResponse(null, { status: 201 });
  });
  return { writes, handler };
}

function checkboxes(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

function check(input: HTMLInputElement): void {
  input.checked = true;
  input.dispatchEvent(new Event('change'));
}

describe('the consent gate, /consentimentos', () => {
  beforeEach(() => {
    server.use(http.get(ApiRoutes.identity.terms, () => HttpResponse.json(realTerms())));
  });

  it('shows each pending purpose in full before its control, and pre-checks nothing', async () => {
    server.use(stateServer(GATED).handler);
    const { root, text } = await openApp('/consentimentos');
    expect(root().querySelectorAll('h1')).toHaveLength(1);
    expect(text()).toContain('Texto do processamento de dados de aprendizagem.');
    expect(text()).toContain('Texto da pesquisa, versão 2.');
    const boxes = checkboxes(root());
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => !box.checked)).toBe(true);
    // Text before control, in document order.
    const section = root().querySelector('sn-consent-disclosure') as HTMLElement;
    const body = section.querySelector('.sn-terms__body') as HTMLElement;
    expect(body.compareDocumentPosition(boxes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers research with no recommendation, no warning colour, and a visible way on without it', async () => {
    server.use(stateServer(GATED).handler);
    const { root, text } = await openApp('/consentimentos');
    const research = [...root().querySelectorAll('sn-consent-disclosure')][1] as HTMLElement;
    expect(research.textContent).toContain('Pesquisa acadêmica');
    expect(research.textContent).toContain('Recusar não muda nada no serviço.');
    expect(research.textContent?.toLowerCase()).not.toMatch(/recomendad|sugerid/);
    expect(
      root().querySelector('.sn-alert--warning, .sn-badge--warning, .sn-btn--danger'),
    ).toBeNull();
    expect(text()).toContain('Você pode continuar sem marcar as finalidades opcionais.');
  });

  it('says what is missing when the essential purpose is not checked, and sends nothing', async () => {
    const posted = grants();
    server.use(stateServer(GATED).handler, posted.handler);
    const { click, root } = await openApp('/consentimentos');
    await click('Continuar');
    expect(posted.writes).toEqual([]);
    expect(root().querySelector('[role="alert"]')?.textContent).toContain(
      'Para continuar, marque "Li e concordo" em "Processamento de dados de aprendizagem"',
    );
  });

  it('continues without research: grants only the essential, with the displayed wording, and lets the chain route', async () => {
    const posted = grants();
    const state = stateServer(GATED);
    server.use(state.handler, posted.handler);
    const { root, settle, router } = await openApp('/consentimentos');
    check(checkboxes(root())[0]);
    // What the server will answer once the grant is in: research still "pending", which no longer holds.
    state.set(stateBody({ pendingConsents: ['ACADEMIC_RESEARCH'] }));
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();

    await vi.waitFor(() => expect(router.url).toBe('/hoje'));
    expect(posted.writes.map((write) => write.body)).toEqual([
      { purpose: 'LEARNING_DATA_PROCESSING', termsVersionId: 'ldp-v1' },
    ]);
  });

  it('grants research too when the person checks it', async () => {
    const posted = grants();
    const state = stateServer(GATED);
    server.use(state.handler, posted.handler);
    const { root, settle, router } = await openApp('/consentimentos');
    checkboxes(root()).forEach(check);
    state.set(stateBody());
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() => expect(router.url).toBe('/hoje'));
    expect(posted.writes.map((write) => write.body)).toEqual([
      { purpose: 'LEARNING_DATA_PROCESSING', termsVersionId: 'ldp-v1' },
      { purpose: 'ACADEMIC_RESEARCH', termsVersionId: 'research-v2' },
    ]);
  });

  it('reads 409 as a changed state: refreshes, and if still held, asks to read again', async () => {
    const state = stateServer(GATED);
    server.use(state.handler);
    server.use(
      http.post(ApiRoutes.identity.consents, () => problemResponse('urn:sinapse:problem:conflict')),
    );
    const { root, settle, router } = await openApp('/consentimentos');
    const calls = state.calls();
    check(checkboxes(root())[0]);
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() =>
      expect(root().textContent).toContain('A situação destes consentimentos mudou'),
    );
    expect(state.calls()).toBe(calls + 1);
    expect(router.url).toBe('/consentimentos');
    expect(root().querySelector('sn-error-state')).toBeNull();
    // The choice is cleared: the new wording must be read before it is accepted.
    expect(checkboxes(root()).map((box) => box.checked)).toEqual([false, false]);
  });

  it('reads 409 as a changed state and moves on when the purpose was already in force', async () => {
    const state = stateServer(GATED);
    server.use(state.handler);
    server.use(
      http.post(ApiRoutes.identity.consents, () => {
        state.set(stateBody());
        return problemResponse('urn:sinapse:problem:conflict');
      }),
    );
    const { root, settle, router } = await openApp('/consentimentos');
    check(checkboxes(root())[0]);
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() => expect(router.url).toBe('/hoje'));
  });

  it('shows the error state on a server failure and stays', async () => {
    server.use(stateServer(GATED).handler);
    server.use(
      http.post(ApiRoutes.identity.consents, () =>
        problemResponse('urn:sinapse:problem:internal-error'),
      ),
    );
    const { root, settle, router } = await openApp('/consentimentos');
    check(checkboxes(root())[0]);
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    await vi.waitFor(() => expect(root().querySelector('form sn-error-state')).not.toBeNull());
    expect(router.url).toBe('/consentimentos');
  });

  it('says it cannot go on when the essential wording is not published (empty state)', async () => {
    server.use(stateServer(GATED).handler);
    server.use(http.get(ApiRoutes.identity.terms, () => HttpResponse.json([])));
    const { root } = await openApp('/consentimentos');
    expect(root().querySelector('sn-empty-state')?.textContent).toContain('não está publicado');
    expect(root().querySelector('form')).toBeNull();
  });

  it('shows the error state when the wordings cannot be read', async () => {
    server.use(stateServer(GATED).handler);
    server.use(
      http.get(ApiRoutes.identity.terms, () =>
        problemResponse('urn:sinapse:problem:internal-error'),
      ),
    );
    const { root } = await openApp('/consentimentos');
    await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
  });

  it('is not shown to an account that only declined research (K-H)', async () => {
    server.use(stateServer(stateBody({ pendingConsents: ['ACADEMIC_RESEARCH'] })).handler);
    const { router } = await openApp('/consentimentos');
    expect(router.url).toBe('/hoje');
  });
});
