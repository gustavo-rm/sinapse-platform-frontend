import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import { openApp, stateBody, stateServer } from '../../../../testing/privacy';
import {
  ANATOMY,
  PHYSIOLOGY,
  goalBody,
  setupServer,
  topicsOf,
  validationFailed,
  windowBody,
} from '../../../../testing/setup';
import { ApiRoutes } from '../../../core/api/api-routes';

const server = useMswServer();

/** 15:30 UTC on 11 November: the 11th in São Paulo and Pago Pago, already the 12th in Tokyo and Kiritimati. */
const NOW = '2026-11-11T15:30:00Z';

function fill(root: HTMLElement, label: string, value: string): void {
  const control = [...root.querySelectorAll<HTMLLabelElement>('label')].find((candidate) =>
    candidate.textContent?.replace(/\s+/g, ' ').trim().startsWith(label),
  )?.control as HTMLInputElement | HTMLSelectElement | null | undefined;
  if (!control) {
    throw new Error(`No control labelled "${label}"`);
  }
  control.value = value;
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
}

function controlOf(root: HTMLElement, label: string): HTMLInputElement {
  return [...root.querySelectorAll<HTMLLabelElement>('label')].find((candidate) =>
    candidate.textContent?.replace(/\s+/g, ' ').trim().startsWith(label),
  )?.control as HTMLInputElement;
}

async function declareWindow(
  app: Awaited<ReturnType<typeof openApp>>,
  values: { day?: string; start?: string; end?: string; until?: string } = {},
): Promise<void> {
  fill(app.root(), 'Dia da semana', values.day ?? 'TUESDAY');
  fill(app.root(), 'Começa às', values.start ?? '19:00');
  fill(app.root(), 'Termina às', values.end ?? '21:00');
  if (values.until !== undefined) {
    fill(app.root(), 'Último dia', values.until);
  }
  await app.click('Adicionar janela');
}

describe('the setup gate, /configurar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it('arrives on step 1 with the empty state, one h1, and the progress in words', async () => {
    const backend = setupServer();
    server.use(stateServer(stateBody({ setupComplete: false })).handler, ...backend.handlers);
    const app = await openApp('/configurar');

    expect(app.router.url).toBe('/configurar');
    expect(app.root().querySelectorAll('h1')).toHaveLength(1);
    expect(app.text()).toContain('Nenhuma janela declarada ainda');
    expect(app.text()).toContain('Passo 1 de 2: Quando você estuda');
    expect(app.root().querySelector('[aria-current="step"]')?.textContent).toContain(
      'Quando você estuda',
    );
    expect(app.buttonNamed('Continuar para as metas')?.disabled).toBe(true);
    // The live regions exist before anything is said in them.
    expect(app.root().querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
  });

  describe('the date passed to `on` is today in the ACCOUNT zone, never the browser one', () => {
    for (const [zone, expected] of [
      ['America/Sao_Paulo', '2026-11-11'],
      ['Asia/Tokyo', '2026-11-12'],
      ['Pacific/Pago_Pago', '2026-11-11'],
      ['Pacific/Kiritimati', '2026-11-12'],
    ] as const) {
      it(`${zone} at ${NOW} → on=${expected}, whatever the process TZ (the suite also runs under two)`, async () => {
        const backend = setupServer();
        server.use(
          stateServer(stateBody({ setupComplete: false, timeZone: zone })).handler,
          ...backend.handlers,
        );
        await openApp('/configurar');
        await vi.waitFor(() => expect(backend.onDates).toContain(expected));
        // And the read without a date — every window, for the record — never filtered by the client.
        expect(backend.onDates).toContain(null);
        expect(backend.onDates.filter((on) => on !== null && on !== expected)).toEqual([]);
      });
    }
  });

  it('declares a window, sending HH:mm, and lists it with the echo read as HH:mm (F19)', async () => {
    const backend = setupServer();
    server.use(stateServer(stateBody({ setupComplete: false })).handler, ...backend.handlers);
    const app = await openApp('/configurar');

    await declareWindow(app);
    await vi.waitFor(() => expect(backend.writes).toHaveLength(1));
    expect(backend.writes[0].body).toEqual({
      dayOfWeek: 'TUESDAY',
      startTime: '19:00',
      endTime: '21:00',
      effectiveFrom: '2026-11-11',
    });
    await vi.waitFor(() => expect(app.text()).toContain('19:00–21:00'));
    expect(app.text()).not.toContain('19:00:00');
    expect(app.text()).toContain(
      'Janela adicionada: Terça, das 19:00 às 21:00, a partir de 11/11/2026.',
    );
    await app.settle();
    expect(app.buttonNamed('Continuar para as metas')?.disabled).toBe(false);
  });

  it('refuses an end before the start on its own, with no request', async () => {
    const backend = setupServer();
    server.use(stateServer(stateBody({ setupComplete: false })).handler, ...backend.handlers);
    const app = await openApp('/configurar');

    await declareWindow(app, { start: '21:00', end: '19:00' });
    expect(backend.writes).toHaveLength(0);
    expect(app.text()).toContain('O fim precisa ser depois do início.');
    const end = controlOf(app.root(), 'Termina às');
    expect(end.getAttribute('aria-invalid')).toBe('true');
    expect(end.getAttribute('aria-describedby')).toContain('-end-error');
  });

  it('refuses a last day before the first on its own, with no request', async () => {
    const backend = setupServer();
    server.use(stateServer(stateBody({ setupComplete: false })).handler, ...backend.handlers);
    const app = await openApp('/configurar');

    await declareWindow(app, { until: '2026-11-10' });
    expect(backend.writes).toHaveLength(0);
    expect(app.text()).toContain('O último dia não pode vir antes do primeiro.');
    expect(controlOf(app.root(), 'Último dia').getAttribute('aria-invalid')).toBe('true');
  });

  it("still shows the server's 400 on the field, never its English message", async () => {
    const backend = setupServer();
    server.use(
      stateServer(stateBody({ setupComplete: false })).handler,
      http.post(ApiRoutes.planning.availability, () => validationFailed(['timeRangeOrdered'])),
      ...backend.handlers,
    );
    const app = await openApp('/configurar');

    await declareWindow(app);
    await vi.waitFor(() => expect(app.text()).toContain('O fim precisa ser depois do início.'));
    expect(app.text()).not.toContain('English text');
  });

  it('answers the 409 of an overlap with the reason, and keeps what was typed', async () => {
    const backend = setupServer({ windows: [windowBody()] });
    server.use(
      stateServer(stateBody({ setupComplete: false })).handler,
      http.post(ApiRoutes.planning.availability, () =>
        problemResponse('urn:sinapse:problem:conflict'),
      ),
      ...backend.handlers,
    );
    const app = await openApp('/configurar');

    await declareWindow(app, { start: '20:00', end: '22:00' });
    await vi.waitFor(() => expect(app.text()).toContain('se sobrepõe a outra'));
    expect(app.text()).toContain('terça');
    expect(app.text()).toContain('a mesma hora contar duas vezes');
    expect(app.root().querySelector('[role="alert"] .sn-alert')).not.toBeNull();
    expect(controlOf(app.root(), 'Começa às').value).toBe('20:00');
  });

  it('answers a 403 by saying so and letting the chain decide, with the state read again', async () => {
    const backend = setupServer();
    const state = stateServer(stateBody({ setupComplete: false }));
    server.use(
      state.handler,
      http.post(ApiRoutes.planning.availability, () =>
        problemResponse('urn:sinapse:problem:access-denied'),
      ),
      ...backend.handlers,
    );
    const app = await openApp('/configurar');
    const before = state.calls();
    state.set(stateBody({ accountStatus: 'SUSPENDED', setupComplete: false }));

    await declareWindow(app);
    await vi.waitFor(() => expect(state.calls()).toBe(before + 1));
    await vi.waitFor(() => expect(app.router.url).toBe('/conta-suspensa'));
  });

  describe('step 2 and the moment setup completes', () => {
    it('offers only subjects with no active goal, and shows their topics as context, not choices', async () => {
      const backend = setupServer({
        windows: [windowBody()],
        goals: [goalBody({ subjectId: ANATOMY.id })],
        subjects: [ANATOMY, PHYSIOLOGY],
        topics: topicsOf(35),
      });
      server.use(stateServer(stateBody({ setupComplete: false })).handler, ...backend.handlers);
      const app = await openApp('/configurar');
      await app.click('Continuar para as metas');

      const radios = [
        ...app.root().querySelectorAll<HTMLInputElement>('.sn-picker input[type="radio"]'),
      ];
      expect(radios.map((radio) => radio.closest('label')?.textContent?.trim())).toEqual([
        'Fisiologia',
      ]);
      radios[0].click();
      await app.settle();
      await vi.waitFor(() => expect(app.root().querySelectorAll('.sn-topics li')).toHaveLength(35));
      const topics = app.root().querySelector('.sn-topics') as HTMLElement;
      expect(topics.tagName).toBe('OL');
      expect(topics.querySelectorAll('input, button, a, [tabindex]')).toHaveLength(0);
      expect(app.text()).toContain('todos os 35 tópicos de Fisiologia entram');
      expect(app.text()).toContain('Não há tópicos a escolher nem a deixar de fora.');
    });

    it('asks for nothing but the subject, a target date and a priority — no effort, no level', async () => {
      const backend = setupServer({ windows: [windowBody()] });
      server.use(stateServer(stateBody({ setupComplete: false })).handler, ...backend.handlers);
      const app = await openApp('/configurar');
      await app.click('Continuar para as metas');

      const legends = [...app.root().querySelectorAll('legend')].map((l) => l.textContent?.trim());
      const labels = [...app.root().querySelectorAll('sn-goal-form label.sn-field__label')].map(
        (l) => l.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(legends).toEqual(['Disciplina', 'Prioridade']);
      expect(labels).toEqual(['Data-alvo (opcional)']);
      expect(app.text().toLowerCase()).not.toMatch(
        /esforço|dificuldade|quanto tempo|domínio|até quando o plano/,
      );
      // The date is a constraint on order, never an end: no countdown, no "your plan covers until".
      expect(app.text()).toContain('não define até quando o estudo é planejado');
    });

    it('labels the ends of the priority scale in words: 5 is the highest', async () => {
      const backend = setupServer({ windows: [windowBody()] });
      server.use(stateServer(stateBody({ setupComplete: false })).handler, ...backend.handlers);
      const app = await openApp('/configurar');
      await app.click('Continuar para as metas');

      const options = [...app.root().querySelectorAll('.sn-prio-field__opt')].map((o) =>
        o.querySelector('.sn-sr')?.textContent?.trim(),
      );
      expect(options).toEqual([
        '1, a menor prioridade',
        '2',
        '3, o padrão',
        '4',
        '5, a maior prioridade',
      ]);
      expect(
        app.root().querySelector<HTMLInputElement>('.sn-prio-field input:checked')?.value,
      ).toBe('3');
    });

    it('flips to complete only on the server answer, and lets the chain route on "Continuar"', async () => {
      const backend = setupServer({
        windows: [windowBody()],
        subjects: [ANATOMY, PHYSIOLOGY],
        topics: topicsOf(3),
      });
      const state = stateServer(stateBody({ setupComplete: false }));
      server.use(state.handler, ...backend.handlers);
      const app = await openApp('/configurar');
      await app.click('Continuar para as metas');
      expect(app.text()).toContain('Falta definir ao menos uma meta.');

      // The server keeps answering false: the screen does not decide otherwise.
      app.root().querySelector<HTMLInputElement>('.sn-picker input')?.click();
      await app.settle();
      const reads = state.calls();
      await app.click(/^Definir meta/);
      await vi.waitFor(() => expect(backend.writes).toHaveLength(1));
      expect(backend.writes[0].body).toEqual({ subjectId: ANATOMY.id, priority: 3 });
      await vi.waitFor(() => expect(state.calls()).toBe(reads + 1));
      await app.settle();
      expect(app.text()).toContain('mas a configuração ainda não está completa');
      expect(app.buttonNamed('Continuar')).toBeUndefined();
      expect(app.router.url).toBe('/configurar');

      // Now the server says true (the next read): only then is "Continuar" offered.
      state.set(stateBody({ setupComplete: true }));
      app.root().querySelector<HTMLInputElement>('.sn-picker input')?.click();
      await app.settle();
      await app.click(/^Definir meta/);
      await vi.waitFor(() => expect(app.buttonNamed('Continuar')).toBeDefined());
      expect(app.text()).toContain('A configuração está completa');
      expect(app.text()).toContain('Nenhum plano é montado nesta etapa.');
      expect(app.router.url).toBe('/configurar');

      await app.click('Continuar');
      await vi.waitFor(() => expect(app.router.url).toBe('/hoje'));
    });

    it('handles the 409 of a duplicate goal (a race), saying so and reading again', async () => {
      const backend = setupServer({ windows: [windowBody()] });
      server.use(
        stateServer(stateBody({ setupComplete: false })).handler,
        http.post(ApiRoutes.planning.goals, () => problemResponse('urn:sinapse:problem:conflict')),
        ...backend.handlers,
      );
      const app = await openApp('/configurar');
      await app.click('Continuar para as metas');
      app.root().querySelector<HTMLInputElement>('.sn-picker input')?.click();
      await app.settle();
      await app.click(/^Definir meta/);
      await vi.waitFor(() => expect(app.text()).toContain('Esta disciplina já tem uma meta ativa'));
    });
  });

  describe('the four states of both steps', () => {
    it('loading: the shape of the content, with a label, while each read is under way', async () => {
      const backend = setupServer({ windows: [windowBody()] });
      const seen: string[] = [];
      /** What the person sees while a read is in flight — TestBed renders into the document. */
      const look = () =>
        seen.push(document.querySelector('sn-loading-state')?.textContent?.trim() ?? 'nothing');
      server.use(
        stateServer(stateBody({ setupComplete: false })).handler,
        http.get(ApiRoutes.planning.availability, async ({ request }) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          look();
          const on = new URL(request.url).searchParams.get('on');
          return HttpResponse.json(on === null || on !== '' ? [windowBody()] : []);
        }),
        http.get(ApiRoutes.planning.goals, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          look();
          return HttpResponse.json([]);
        }),
        ...backend.handlers,
      );
      const app = await openApp('/configurar');
      expect(seen[0]).toContain('Carregando suas janelas de estudo');
      expect(app.root().querySelector('sn-loading-state')).toBeNull();

      await app.click('Continuar para as metas');
      await vi.waitFor(() =>
        expect(seen.some((text) => text.includes('Carregando suas metas'))).toBe(true),
      );
    });

    it('error: by problem type, with a retry for an internal error', async () => {
      const backend = setupServer();
      server.use(
        stateServer(stateBody({ setupComplete: false })).handler,
        http.get(ApiRoutes.planning.availability, () =>
          problemResponse('urn:sinapse:problem:internal-error'),
        ),
        http.get(ApiRoutes.planning.goals, () =>
          problemResponse('urn:sinapse:problem:internal-error'),
        ),
        ...backend.handlers,
      );
      const app = await openApp('/configurar');
      await vi.waitFor(() => expect(app.text()).toContain('Não foi possível concluir a operação.'));
      expect(app.text()).toContain('Nenhuma janela foi alterada.');
      expect(app.buttonNamed(/tentar de novo/i)).toBeDefined();
      app.buttonNamed('Continuar para as metas')?.removeAttribute('disabled');
      await app.click('Continuar para as metas');
      await vi.waitFor(() => expect(app.text()).toContain('Nenhuma meta foi alterada.'));
    });

    it('rate-limited: the wait, and no retry control', async () => {
      const backend = setupServer();
      server.use(
        stateServer(stateBody({ setupComplete: false })).handler,
        http.get(ApiRoutes.planning.availability, () =>
          problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 120 }),
        ),
        http.get(ApiRoutes.planning.goals, () =>
          problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 120 }),
        ),
        ...backend.handlers,
      );
      const app = await openApp('/configurar');
      await vi.waitFor(() => expect(app.text()).toContain('Aguarde 2 minutos'));
      expect(app.buttonNamed(/tentar de novo/i)).toBeUndefined();
      app.buttonNamed('Continuar para as metas')?.removeAttribute('disabled');
      await app.click('Continuar para as metas');
      await vi.waitFor(() =>
        expect(app.root().querySelector('sn-goals-section sn-rate-limit-notice')).not.toBeNull(),
      );
      expect(app.buttonNamed(/tentar de novo/i)).toBeUndefined();
    });
  });
});
