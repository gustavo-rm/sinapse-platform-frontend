import { HttpResponse, http } from 'msw';

import { problemResponse } from '../../../../testing/msw/problems';
import { useMswServer } from '../../../../testing/msw/server';
import { openApp, stateBody, stateServer } from '../../../../testing/privacy';
import { ANATOMY, PHYSIOLOGY, goalBody, setupServer } from '../../../../testing/setup';
import { ApiRoutes } from '../../../core/api/api-routes';

const server = useMswServer();

const JUDGING =
  '.sn-badge--success, .sn-badge--error, .sn-badge--warning, .sn-alert--success, .sn-alert--error, .sn-alert--warning, .sn-btn--danger';

function itemOf(
  root: HTMLElement,
  name: string,
  section: 'Metas ativas' | 'Metas encerradas',
): HTMLElement {
  const heading = [...root.querySelectorAll('h2')].find((h) => h.textContent?.trim() === section);
  const item = [
    ...(heading?.closest('section')?.querySelectorAll<HTMLElement>('li.sn-goal') ?? []),
  ].find((li) => li.querySelector('h3')?.textContent?.trim() === name);
  if (!item) {
    throw new Error(`No goal "${name}" under "${section}"`);
  }
  return item;
}

describe('the goals screen, /conta/metas', () => {
  it('shows closed goals as part of the record, told apart by status in words, with no judging colour', async () => {
    const backend = setupServer({
      subjects: [ANATOMY, PHYSIOLOGY, { id: 's3', name: 'Bioquímica' }],
      goals: [
        goalBody({ id: 'a', subjectId: ANATOMY.id, priority: 4, targetDate: '2027-06-30' }),
        goalBody({
          id: 'b',
          subjectId: PHYSIOLOGY.id,
          status: 'ABANDONED',
          closedAt: '2026-11-10T13:00:00Z',
        }),
        goalBody({
          id: 'c',
          subjectId: 's3',
          status: 'ACHIEVED',
          closedAt: '2026-11-09T13:00:00Z',
        }),
      ],
    });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/metas');

    expect(app.root().querySelectorAll('h1')).toHaveLength(1);
    const active = itemOf(app.root(), 'Anatomia Humana', 'Metas ativas');
    const abandoned = itemOf(app.root(), 'Fisiologia', 'Metas encerradas');
    const achieved = itemOf(app.root(), 'Bioquímica', 'Metas encerradas');
    expect(active.textContent).toContain('Ativa');
    expect(active.textContent).toContain('Prioridade 4 de 5');
    expect(active.textContent).toContain('Data-alvo: 30/06/2027');
    expect(abandoned.textContent).toContain('Abandonada');
    expect(abandoned.textContent).toContain('Encerrada em 10/11/2026');
    expect(achieved.textContent).toContain('Alcançada');

    // The same neutral badge for the three statuses: the word carries the difference.
    const classes = [active, abandoned, achieved].map(
      (li) => li.querySelector('.sn-badge')?.className,
    );
    expect(new Set(classes)).toEqual(new Set(['sn-badge']));
    expect(app.root().querySelector(JUDGING)).toBeNull();
    // Closed goals are a record: no actions on them.
    expect(abandoned.querySelectorAll('button')).toHaveLength(0);
    // The target date is the student's date, nothing derived: no countdown, no bar toward it.
    expect(app.text()).not.toMatch(/faltam|restam|dias para|até o fim do plano|plano vai até/i);
    expect(app.root().querySelector('progress, [role="progressbar"], .sn-adh')).toBeNull();
  });

  it('revising only the priority sends back the target date it READ, so it is not cleared', async () => {
    const backend = setupServer({
      goals: [goalBody({ id: 'a', priority: 3, targetDate: '2027-06-30' })],
    });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/metas');

    await app.click('Revisar');
    const panel = app.root().querySelector('.sn-wrow__panel') as HTMLElement;
    expect(panel.querySelector<HTMLInputElement>('input:checked')?.value).toBe('3');
    expect(panel.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2027-06-30');
    panel.querySelector<HTMLInputElement>('input[value="5"]')?.click();
    await app.settle();
    await app.click('Salvar');

    await vi.waitFor(() => expect(backend.writes).toHaveLength(1));
    expect(backend.writes[0]).toEqual({
      method: 'PATCH',
      path: ApiRoutes.planning.goal({ goalId: 'a' }),
      body: { priority: 5, targetDate: '2027-06-30' },
    });
    await vi.waitFor(() => expect(app.text()).toContain('Prioridade 5 de 5'));
    expect(app.text()).toContain('Data-alvo: 30/06/2027');
  });

  it('revising only the date sends back the priority it READ', async () => {
    const backend = setupServer({ goals: [goalBody({ id: 'a', priority: 4 })] });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/metas');

    await app.click('Revisar');
    const date = app.root().querySelector<HTMLInputElement>('.sn-wrow__panel input[type="date"]')!;
    date.value = '2027-01-15';
    date.dispatchEvent(new Event('input'));
    await app.click('Salvar');
    await vi.waitFor(() => expect(backend.writes).toHaveLength(1));
    expect(backend.writes[0].body).toEqual({ priority: 4, targetDate: '2027-01-15' });
  });

  for (const [action, verb, path, status] of [
    ['Abandonar', 'Abandonar meta', 'goalAbandonment', 'Abandonada'],
    ['Marcar como alcançada', 'Marcar como alcançada', 'goalAchievement', 'Alcançada'],
  ] as const) {
    it(`"${action}" asks first, says it is not a deletion, then lists the goal as closed`, async () => {
      const backend = setupServer({ goals: [goalBody({ id: 'a' })] });
      const state = stateServer(stateBody());
      server.use(state.handler, ...backend.handlers);
      const app = await openApp('/conta/metas');
      const reads = state.calls();

      await app.click(action);
      const dialog = app.root().querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.textContent).toContain('fica registrada');
      expect(dialog.querySelector('.sn-btn--danger')).toBeNull();
      expect(backend.writes).toHaveLength(0);
      [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === verb)?.click();
      await app.settle();

      await vi.waitFor(() => expect(backend.writes).toHaveLength(1));
      expect(backend.writes[0].path).toBe(ApiRoutes.planning[path]({ goalId: 'a' }));
      await vi.waitFor(() =>
        expect(itemOf(app.root(), 'Anatomia Humana', 'Metas encerradas').textContent).toContain(
          status,
        ),
      );
      await vi.waitFor(() => expect(state.calls()).toBe(reads + 1));
      expect(app.router.url).toBe('/conta/metas');
      expect(app.root().querySelector(JUDGING)).toBeNull();
    });
  }

  it('says so when the server reports setup incomplete after the last goal is closed, and stays', async () => {
    const backend = setupServer({ goals: [goalBody({ id: 'a' })] });
    const state = stateServer(stateBody());
    server.use(state.handler, ...backend.handlers);
    const app = await openApp('/conta/metas');
    expect(app.text()).not.toContain('a configuração não está completa');

    state.set(stateBody({ setupComplete: false }));
    await app.click('Abandonar');
    await app.click('Abandonar meta');
    await vi.waitFor(() => expect(app.text()).toContain('a configuração não está completa'));
    expect(app.router.url).toBe('/conta/metas');
  });

  it('does not offer a subject that already has an active goal', async () => {
    const backend = setupServer({ goals: [goalBody({ subjectId: ANATOMY.id })] });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/metas');

    expect(app.root().querySelectorAll('.sn-picker input[type="radio"]')).toHaveLength(0);
    expect(app.text()).toContain('Todas as disciplinas já têm uma meta ativa');
    expect(app.text()).toContain('encerre antes a que está ativa');
  });

  it('offers a subject again once its goal was abandoned', async () => {
    const backend = setupServer({
      goals: [
        goalBody({ subjectId: ANATOMY.id, status: 'ABANDONED', closedAt: '2026-11-10T13:00:00Z' }),
      ],
    });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/metas');
    expect(
      [...app.root().querySelectorAll('.sn-picker label')].map((l) => l.textContent?.trim()),
    ).toEqual(['Anatomia Humana']);
  });

  it('handles the 409 of a duplicate goal set elsewhere meanwhile', async () => {
    const backend = setupServer({ subjects: [ANATOMY, PHYSIOLOGY] });
    server.use(
      stateServer(stateBody()).handler,
      http.post(ApiRoutes.planning.goals, () => problemResponse('urn:sinapse:problem:conflict')),
      ...backend.handlers,
    );
    const app = await openApp('/conta/metas');
    app.root().querySelector<HTMLInputElement>('.sn-picker input')?.click();
    await app.settle();
    await app.click(/^Definir meta/);
    await vi.waitFor(() => expect(app.text()).toContain('Esta disciplina já tem uma meta ativa'));
  });

  it('answers a 403 by saying so and letting the chain decide', async () => {
    const backend = setupServer({ goals: [goalBody({ id: 'a' })] });
    const state = stateServer(stateBody());
    server.use(
      state.handler,
      http.post(ApiRoutes.planning.goalAbandonment.template.replace('{goalId}', ':goalId'), () =>
        problemResponse('urn:sinapse:problem:access-denied'),
      ),
      ...backend.handlers,
    );
    const app = await openApp('/conta/metas');
    state.set(stateBody({ accountStatus: 'SUSPENDED', setupComplete: false }));
    await app.click('Abandonar');
    await app.click('Abandonar meta');
    await vi.waitFor(() => expect(app.router.url).toBe('/conta-suspensa'));
  });

  it('answers the 409 of a goal closed meanwhile', async () => {
    const backend = setupServer({ goals: [goalBody({ id: 'a' })] });
    server.use(
      stateServer(stateBody()).handler,
      http.post(ApiRoutes.planning.goalAchievement.template.replace('{goalId}', ':goalId'), () =>
        problemResponse('urn:sinapse:problem:conflict'),
      ),
      ...backend.handlers,
    );
    const app = await openApp('/conta/metas');
    await app.click('Marcar como alcançada');
    [...app.root().querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent?.trim() === 'Marcar como alcançada')
      ?.dispatchEvent(new MouseEvent('click'));
    await app.settle();
    await vi.waitFor(() => expect(app.text()).toContain('Esta meta já tinha sido encerrada'));
  });

  it('survives twenty goals: every one listed, with its own actions', async () => {
    const subjects = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      name: `Disciplina ${i + 1}`,
    }));
    const backend = setupServer({
      subjects,
      goals: subjects.map((s, i) =>
        goalBody({
          id: `g${i}`,
          subjectId: s.id,
          priority: (i % 5) + 1,
          ...(i >= 10 ? { status: 'ABANDONED', closedAt: '2026-11-10T13:00:00Z' } : {}),
        }),
      ),
    });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/metas');
    expect(app.root().querySelectorAll('li.sn-goal')).toHaveLength(20);
    expect(
      [...app.root().querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Revisar'),
    ).toHaveLength(10);
  });

  describe('the four states', () => {
    it('empty: no goal yet, said with what a goal is', async () => {
      const backend = setupServer();
      server.use(stateServer(stateBody()).handler, ...backend.handlers);
      const app = await openApp('/conta/metas');
      expect(app.text()).toContain('Nenhuma meta ativa');
      expect(app.text()).toContain('Uma meta é uma disciplina inteira');
    });

    it('empty catalogue: no subject to set a goal for', async () => {
      const backend = setupServer({ subjects: [] });
      server.use(stateServer(stateBody()).handler, ...backend.handlers);
      const app = await openApp('/conta/metas');
      expect(app.text()).toContain('O catálogo ainda não tem disciplinas');
    });

    it('loading', async () => {
      const backend = setupServer();
      let seen = '';
      server.use(
        stateServer(stateBody()).handler,
        http.get(ApiRoutes.planning.goals, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          seen = document.querySelector('sn-loading-state')?.textContent?.trim() ?? '';
          return HttpResponse.json([]);
        }),
        ...backend.handlers,
      );
      await openApp('/conta/metas');
      expect(seen).toContain('Carregando suas metas');
    });

    it('error', async () => {
      const backend = setupServer();
      server.use(
        stateServer(stateBody()).handler,
        http.get(ApiRoutes.curriculum.subjects, () =>
          problemResponse('urn:sinapse:problem:internal-error'),
        ),
        ...backend.handlers,
      );
      const app = await openApp('/conta/metas');
      await vi.waitFor(() => expect(app.text()).toContain('Nenhuma meta foi alterada.'));
      expect(app.buttonNamed('Tentar de novo')).toBeDefined();
    });

    it('rate-limited: the wait, no retry', async () => {
      const backend = setupServer();
      server.use(
        stateServer(stateBody()).handler,
        http.get(ApiRoutes.planning.goals, () =>
          problemResponse('urn:sinapse:problem:rate-limit-exceeded', { retryAfterSeconds: 60 }),
        ),
        ...backend.handlers,
      );
      const app = await openApp('/conta/metas');
      await vi.waitFor(() => expect(app.text()).toContain('Aguarde 1 minuto'));
      expect(app.buttonNamed('Tentar de novo')).toBeUndefined();
    });
  });
});
