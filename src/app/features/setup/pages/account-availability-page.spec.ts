import { HttpResponse, http } from 'msw';

import { mswPath } from '../../../../testing/msw/handlers/handlers-from-snapshot';
import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import { openApp, stateBody, stateServer } from '../../../../testing/privacy';
import { setupServer, windowBody } from '../../../../testing/setup';
import { ApiRoutes } from '../../../core/api/api-routes';

const server = useMswServer();

function sectionOf(root: HTMLElement, heading: string): HTMLElement {
  const h2 = [...root.querySelectorAll('h2')].find((h) => h.textContent?.trim() === heading);
  const section = h2?.closest('section');
  if (!section) {
    throw new Error(`No section "${heading}"`);
  }
  return section as HTMLElement;
}

describe('the availability screen, /conta/disponibilidade', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T15:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('shows a closed window as a record with its period — never struck through, never "excluída"', async () => {
    const backend = setupServer({
      windows: [
        windowBody({ id: 'open' }),
        windowBody({ id: 'closed', dayOfWeek: 'MONDAY', effectiveUntil: '2026-11-05' }),
        windowBody({ id: 'later', dayOfWeek: 'FRIDAY', effectiveFrom: '2026-12-01' }),
      ],
    });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/disponibilidade');

    const today = sectionOf(app.root(), 'Em vigor hoje');
    const others = sectionOf(app.root(), 'Fora de vigor hoje');
    expect(today.textContent).toContain('Terça');
    expect(today.textContent).toContain('A partir de 01/11/2026');
    expect(others.textContent).toContain('Segunda');
    expect(others.textContent).toContain('De 01/11/2026 a 05/11/2026');
    expect(others.textContent).toContain('Sexta');
    expect(others.textContent).toContain('A partir de 01/12/2026');
    expect(others.textContent).toContain('não é apagada');
    expect(app.root().querySelector('.sn-avail__slot--closed, s, del, strike')).toBeNull();
    expect(app.text().toLowerCase()).not.toMatch(/excluir|excluída|remover|removida|apagar janela/);
    // A closed window offers nothing more: closing twice is a 409.
    expect(others.querySelectorAll('button')).toHaveLength(1); // the later window's "Encerrar"
  });

  it('closes a window with the last day chosen, offering today, and refuses a day before it began', async () => {
    const backend = setupServer({ windows: [windowBody({ id: 'open' })] });
    const state = stateServer(stateBody());
    server.use(state.handler, ...backend.handlers);
    const app = await openApp('/conta/disponibilidade');
    const reads = state.calls();

    await app.click('Encerrar');
    const date = app.root().querySelector<HTMLInputElement>('.sn-wrow__panel input[type="date"]')!;
    expect(date.value).toBe('2026-11-11');
    expect(date.min).toBe('2026-11-01');
    expect(app.text()).toContain('A janela não é apagada');

    date.value = '2026-10-31';
    date.dispatchEvent(new Event('input'));
    await app.click('Encerrar janela');
    expect(backend.writes).toHaveLength(0);
    expect(app.text()).toContain(
      'O último dia não pode vir antes do dia em que a janela começou a valer.',
    );
    expect(date.getAttribute('aria-invalid')).toBe('true');

    date.value = '2026-11-10';
    date.dispatchEvent(new Event('input'));
    await app.click('Encerrar janela');
    await vi.waitFor(() => expect(backend.writes).toHaveLength(1));
    expect(backend.writes[0]).toEqual({
      method: 'POST',
      path: ApiRoutes.planning.availabilityClosure({ windowId: 'open' }),
      body: { effectiveUntil: '2026-11-10' },
    });
    await vi.waitFor(() =>
      expect(app.text()).toContain('Ela continua registrada, valendo até 10/11/2026, inclusive.'),
    );
    await vi.waitFor(() => expect(state.calls()).toBe(reads + 1));
    await vi.waitFor(() =>
      expect(sectionOf(app.root(), 'Fora de vigor hoje').textContent).toContain(
        'De 01/11/2026 a 10/11/2026',
      ),
    );
    expect(app.router.url).toBe('/conta/disponibilidade');
  });

  it('answers the 409 of a window closed meanwhile', async () => {
    const backend = setupServer({ windows: [windowBody({ id: 'open' })] });
    server.use(
      stateServer(stateBody()).handler,
      http.post(mswPath(ApiRoutes.planning.availabilityClosure.template), () =>
        problemResponse('urn:sinapse:problem:conflict'),
      ),
      ...backend.handlers,
    );
    const app = await openApp('/conta/disponibilidade');
    await app.click('Encerrar');
    await app.click('Encerrar janela');
    await vi.waitFor(() => expect(app.text()).toContain('Esta janela já estava encerrada.'));
  });

  it('survives twenty windows, grouped by weekday', async () => {
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const windows = Array.from({ length: 20 }, (_, i) =>
      windowBody({
        id: `w${i}`,
        dayOfWeek: days[i % 7],
        startTime: `${String(6 + Math.floor(i / 7) * 3).padStart(2, '0')}:00:00`,
        endTime: `${String(8 + Math.floor(i / 7) * 3).padStart(2, '0')}:00:00`,
      }),
    );
    const backend = setupServer({ windows });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/disponibilidade');
    expect(app.root().querySelectorAll('li.sn-wrow')).toHaveLength(20);
    expect([...app.root().querySelectorAll('h3')].map((h) => h.textContent?.trim())).toEqual([
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
      'Domingo',
    ]);
  });

  describe('the four states', () => {
    it('empty', async () => {
      const backend = setupServer();
      server.use(stateServer(stateBody()).handler, ...backend.handlers);
      const app = await openApp('/conta/disponibilidade');
      expect(app.text()).toContain('Nenhuma janela declarada ainda');
    });

    it('loading', async () => {
      const backend = setupServer();
      let seen = '';
      server.use(
        stateServer(stateBody()).handler,
        http.get(ApiRoutes.planning.availability, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          seen = document.querySelector('sn-loading-state')?.textContent?.trim() ?? '';
          return HttpResponse.json([]);
        }),
        ...backend.handlers,
      );
      await openApp('/conta/disponibilidade');
      expect(seen).toContain('Carregando suas janelas de estudo');
    });

    it('error, with a 403 told by its type', async () => {
      const backend = setupServer();
      server.use(
        stateServer(stateBody()).handler,
        http.get(ApiRoutes.planning.availability, () =>
          problemResponse('urn:sinapse:problem:access-denied'),
        ),
        ...backend.handlers,
      );
      const app = await openApp('/conta/disponibilidade');
      await vi.waitFor(() =>
        expect(app.text()).toContain('Esta conta não tem permissão para esta operação.'),
      );
      // A 4xx is not retried.
      expect(app.buttonNamed('Tentar de novo')).toBeUndefined();
    });

    it('rate-limited', async () => {
      const backend = setupServer();
      server.use(
        stateServer(stateBody()).handler,
        http.get(ApiRoutes.planning.availability, () =>
          problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 300 }),
        ),
        ...backend.handlers,
      );
      const app = await openApp('/conta/disponibilidade');
      await vi.waitFor(() => expect(app.text()).toContain('Aguarde 5 minutos'));
      expect(app.buttonNamed('Tentar de novo')).toBeUndefined();
    });
  });
});
