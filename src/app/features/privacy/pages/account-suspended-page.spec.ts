import { HttpResponse, type JsonBodyType, http } from 'msw';

import { mswPath } from '../../../../testing/msw/handlers/handlers-from-snapshot';
import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import {
  consentRecord,
  openApp,
  openErasureRequest,
  stateBody,
  stateServer,
} from '../../../../testing/privacy';
import { ApiRoutes } from '../../../core/api/api-routes';
import { JsonFileSaver } from './json-file-saver';

const server = useMswServer();

/** The suspended body observed in FE-5 — the same for both causes. */
const SUSPENDED = stateBody({
  accountStatus: 'SUSPENDED',
  pendingConsents: ['ACADEMIC_RESEARCH'],
  setupComplete: false,
});

function reads(requests: JsonBodyType[], history: JsonBodyType[]) {
  return [
    http.get(ApiRoutes.dataRights.erasureRequests, () => HttpResponse.json(requests)),
    http.get(ApiRoutes.identity.consents, () => HttpResponse.json(history)),
  ];
}

function fakeSaver() {
  const saved: { name: string; body: unknown }[] = [];
  return {
    saved,
    provider: {
      provide: JsonFileSaver,
      useValue: { save: (name: string, body: unknown) => saved.push({ name, body }) },
    },
  };
}

describe('the suspended screen, /conta-suspensa', () => {
  describe('suspended by an erasure request', () => {
    it('says why, when the erasure happens and how long the window is, from the request itself', async () => {
      server.use(
        stateServer(SUSPENDED).handler,
        ...reads([openErasureRequest()], [consentRecord('LEARNING_DATA_PROCESSING')]),
      );
      const { text, root } = await openApp('/conta-suspensa');
      expect(root().querySelectorAll('h1')).toHaveLength(1);
      expect(text()).toContain(
        'Esta conta está suspensa porque você pediu a eliminação dos seus dados em 10 de novembro de 2026.',
      );
      // 21:12 UTC is 18:12 in the account's zone, America/Sao_Paulo.
      expect(text()).toContain('A eliminação acontece em 17/11/2026, 18:12.');
      expect(text()).toContain('O prazo para cancelar é de 7 dias a partir do pedido.');
      expect(text()).toContain('Cancelar o pedido de eliminação');
      expect(text()).toContain('Baixar meus dados');
    });

    it('withdraws the request, and the chain takes the reactivated account into the application', async () => {
      const state = stateServer(SUSPENDED);
      let cancelled = 0;
      server.use(
        state.handler,
        ...reads([openErasureRequest()], [consentRecord('LEARNING_DATA_PROCESSING')]),
        http.post(mswPath(ApiRoutes.dataRights.erasureRequestCancellation.template), () => {
          cancelled++;
          state.set(stateBody({ pendingConsents: ['ACADEMIC_RESEARCH'] }));
          return HttpResponse.json({ ...(openErasureRequest() as object), status: 'CANCELLED' });
        }),
      );
      const { click, router } = await openApp('/conta-suspensa');
      await click('Cancelar o pedido de eliminação');
      await vi.waitFor(() => expect(router.url).toBe('/hoje'));
      expect(cancelled).toBe(1);
    });

    it('reads 409 on the cancellation as refused, says what it may mean, and reads again', async () => {
      let requestsRead = 0;
      server.use(
        stateServer(SUSPENDED).handler,
        http.get(ApiRoutes.dataRights.erasureRequests, () => {
          requestsRead++;
          return HttpResponse.json([openErasureRequest()]);
        }),
        http.get(ApiRoutes.identity.consents, () => HttpResponse.json([])),
        http.post(mswPath(ApiRoutes.dataRights.erasureRequestCancellation.template), () =>
          problemResponse('urn:sinapse:problem:conflict'),
        ),
      );
      const { click, root, router } = await openApp('/conta-suspensa');
      await click('Cancelar o pedido de eliminação');
      await vi.waitFor(() =>
        expect(root().textContent).toContain('O pedido não pôde ser cancelado.'),
      );
      await vi.waitFor(() => expect(requestsRead).toBe(2));
      expect(router.url).toBe('/conta-suspensa');
    });
  });

  describe('suspended by the withdrawal of the essential consent', () => {
    it('says so, and offers no grant: granting again does not reactivate (measured, FE-5)', async () => {
      server.use(
        stateServer(SUSPENDED).handler,
        ...reads([], [consentRecord('LEARNING_DATA_PROCESSING', true)]),
      );
      const { text, root } = await openApp('/conta-suspensa');
      expect(text()).toContain(
        'o consentimento para o processamento dos dados de aprendizagem foi retirado',
      );
      expect(text()).toContain('não há como reativar a conta por aqui');
      expect(root().querySelector('input[type="checkbox"]')).toBeNull();
      const buttons = [...root().querySelectorAll('main button')].map((b) => b.textContent?.trim());
      expect(buttons).toEqual(['Baixar meus dados']);
    });
  });

  it('states the situation and promises nothing when neither cause is found (D4)', async () => {
    server.use(
      stateServer(SUSPENDED).handler,
      ...reads([], [consentRecord('LEARNING_DATA_PROCESSING')]),
    );
    const { text } = await openApp('/conta-suspensa');
    expect(text()).toContain('Esta conta está suspensa. Enquanto estiver assim');
    expect(text()).not.toContain('porque');
  });

  describe('the data export', () => {
    it('says it is preparing while the request runs — no progress bar — then hands the file over', async () => {
      let seenWhileRunning = '';
      const saver = fakeSaver();
      server.use(
        stateServer(SUSPENDED).handler,
        ...reads([openErasureRequest()], [consentRecord('LEARNING_DATA_PROCESSING')]),
        http.get(ApiRoutes.dataRights.dataExport, async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          seenWhileRunning = document.querySelector('[role="status"]')?.textContent ?? '';
          return HttpResponse.json({
            generatedAt: '2026-11-10T21:12:55Z',
            modules: { identity: { consents: [] } },
          });
        }),
      );
      const { click, root } = await openApp('/conta-suspensa', [saver.provider]);
      await click('Baixar meus dados');
      await vi.waitFor(() => expect(saver.saved).toHaveLength(1));
      expect(seenWhileRunning).toContain('Preparando seus dados');
      expect(root().querySelector('progress, [role="progressbar"]')).toBeNull();
      expect(saver.saved[0].name).toMatch(/^sinapse-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
      expect(saver.saved[0].body).toEqual({
        generatedAt: '2026-11-10T21:12:55Z',
        modules: { identity: { consents: [] } },
      });
      await vi.waitFor(() =>
        expect(root().textContent).toContain('Seus dados foram entregues ao navegador'),
      );
    });

    it('tells the wait on a 429, and offers no retry until it ends', async () => {
      server.use(
        stateServer(SUSPENDED).handler,
        ...reads([], [consentRecord('LEARNING_DATA_PROCESSING', true)]),
        http.get(ApiRoutes.dataRights.dataExport, () =>
          problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 3000 }),
        ),
      );
      const { click, root, buttonNamed } = await openApp('/conta-suspensa', [fakeSaver().provider]);
      await click('Baixar meus dados');
      await vi.waitFor(() => expect(root().querySelector('sn-rate-limit-notice')).not.toBeNull());
      expect(root().textContent).toContain('50 minutos');
      expect(buttonNamed('Baixar meus dados')?.disabled).toBe(true);
    });

    it('shows the error state, with a retry, on a timeout', async () => {
      server.use(
        stateServer(SUSPENDED).handler,
        ...reads([], [consentRecord('LEARNING_DATA_PROCESSING', true)]),
        http.get(ApiRoutes.dataRights.dataExport, () =>
          problemResponse('urn:sinapse:problem:internal-error'),
        ),
      );
      const { click, root } = await openApp('/conta-suspensa', [fakeSaver().provider]);
      await click('Baixar meus dados');
      await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
      expect(root().querySelector('sn-error-state')?.textContent).toContain('Tentar de novo');
    });
  });

  it('shows the error state when the cause cannot be read', async () => {
    server.use(
      stateServer(SUSPENDED).handler,
      http.get(ApiRoutes.dataRights.erasureRequests, () =>
        problemResponse('urn:sinapse:problem:internal-error'),
      ),
      http.get(ApiRoutes.identity.consents, () => HttpResponse.json([])),
    );
    const { root, text } = await openApp('/conta-suspensa');
    await vi.waitFor(() => expect(root().querySelector('sn-error-state')).not.toBeNull());
    expect(text()).toContain('Esta conta está suspensa.');
  });

  it('shows a skeleton while it reads the cause', async () => {
    let seen: boolean | null = null;
    server.use(
      stateServer(SUSPENDED).handler,
      http.get(ApiRoutes.dataRights.erasureRequests, async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        seen = document.querySelector('sn-loading-state') !== null;
        return HttpResponse.json([]);
      }),
      http.get(ApiRoutes.identity.consents, () => HttpResponse.json([])),
    );
    await openApp('/conta-suspensa');
    expect(seen).toBe(true);
  });

  it('is shown only to a suspended account', async () => {
    server.use(stateServer(stateBody()).handler);
    const { router } = await openApp('/conta-suspensa');
    expect(router.url).toBe('/hoje');
  });
});
