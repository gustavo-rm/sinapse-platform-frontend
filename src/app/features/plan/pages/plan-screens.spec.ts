import { TestBed } from '@angular/core/testing';

import { useMswServer } from '../../../../testing/msw/server';
import {
  FAST_SCHEDULE,
  type JobStep,
  type PlanServerOptions,
  planBody,
  planServer,
  sessionsOf,
} from '../../../../testing/plan';
import { openApp } from '../../../../testing/privacy';
import { ANATOMY, setupServer } from '../../../../testing/setup';
import { POLL_SCHEDULE } from '../model/generation';

const server = useMswServer();

/** Every class or inline colour that would judge: semantic colour describes the system, never the student. */
const JUDGING =
  '.sn-badge--success, .sn-badge--error, .sn-badge--warning, .sn-alert--success, .sn-alert--error, .sn-alert--warning, .sn-btn--danger, [style*="--error"], [style*="--success"], [style*="--warning"]';
/** Anything that would suggest a proportion of a wait. */
const PROPORTION = 'progress, [role="progressbar"], .sn-adh__track, .sn-adh__fill, meter';

async function open(url: string, options: PlanServerOptions = {}) {
  TestBed.resetTestingModule();
  const backend = planServer(options);
  server.use(...backend.handlers);
  const app = await openApp(url, [{ provide: POLL_SCHEDULE, useValue: FAST_SCHEDULE }]);
  return { app, backend };
}

function generationCard(root: HTMLElement): HTMLElement | null {
  return root.querySelector('sn-generation-progress');
}

describe('/hoje with no plan', () => {
  it('says what a plan is, offers to make one, and nothing else — no error, no call to `current`', async () => {
    const { app, backend } = await open('/hoje');
    expect(app.router.url).toBe('/hoje');
    expect(app.root().querySelectorAll('h1')).toHaveLength(1);
    expect(app.text()).toContain('Você ainda não tem um plano');
    expect(app.text()).toContain('Um plano distribui os tópicos das suas metas');
    expect(app.buttonNamed('Gerar meu plano')).toBeDefined();
    expect(app.root().querySelector('sn-error-state')).toBeNull();
    expect(app.root().querySelectorAll('sn-plan-start-page button')).toHaveLength(1);
    // The plan screen of /hoje is decided by /me/state, not by a 404.
    expect(backend.count('GET', '/study-plans/current')).toBe(0);
  });

  it('with a plan in force and nothing being made, /hoje is the day (FE-9), not the plan', async () => {
    const { app } = await open('/hoje', { plans: [planBody()] });
    expect(app.text()).not.toContain('Você ainda não tem um plano');
    expect(app.root().querySelector('sn-plan-start-page')).toBeNull();
    expect(app.root().querySelector('sn-today-page')).not.toBeNull();
  });
});

describe('asking for a plan, and waiting for it', () => {
  it('asks once, shows elapsed time and what is happening — nothing that implies a proportion — then opens the plan', async () => {
    const steps: JobStep[] = [
      { status: 'PENDING', attemptCount: 0 },
      { status: 'PENDING', attemptCount: 0 },
      { status: 'READY', planId: 'plan-9' },
    ];
    const { app, backend } = await open('/hoje', {
      steps,
      posts: [{ status: 'PENDING', attemptCount: 0, progress: 0.34 }],
    });
    await app.click('Gerar meu plano');

    await vi.waitFor(() => expect(generationCard(app.root())).not.toBeNull());
    const card = generationCard(app.root()) as HTMLElement;
    expect(card.textContent).toContain('Montando seu plano');
    expect(card.textContent).toContain('na fila do servidor');
    expect(card.textContent).toContain('Tempo desde o pedido');
    expect(card.textContent).toMatch(/\d+:\d{2}/);
    expect(card.textContent).toContain('Você pode sair desta tela');
    // No bar, no percentage, no estimate — and the 0.34 the server sent is not read.
    expect(card.querySelector(PROPORTION)).toBeNull();
    expect(card.textContent).not.toMatch(/%|34|falta|restam|estimad/i);
    expect(app.text()).not.toMatch(/cancelar/i);

    await vi.waitFor(() => expect(app.router.url).toBe('/plano'));
    expect(backend.count('POST', '/generation-requests')).toBe(1);
    await vi.waitFor(() => expect(app.text()).toContain('O que este plano pede'));
  });

  it('a request already under way (activeGenerationJobId) is followed, never asked for again', async () => {
    const { app, backend } = await open('/hoje', {
      runningJob: 'job-7',
      steps: [{ status: 'RUNNING' }],
    });
    await vi.waitFor(() => expect(generationCard(app.root())).not.toBeNull());
    expect(app.text()).toContain('montando o plano agora');
    expect(backend.count('POST', '/generation-requests')).toBe(0);
    expect(backend.hits.some((hit) => hit.path.endsWith('/generation-requests/job-7'))).toBe(true);
    expect(app.buttonNamed('Gerar meu plano')).toBeUndefined();
  });

  it('says "trying again" with the attempts when PENDING comes back after an attempt', async () => {
    const { app } = await open('/hoje', {
      runningJob: 'job-1',
      steps: [{ status: 'PENDING', attemptCount: 2 }],
    });
    await vi.waitFor(() => expect(app.text()).toContain('Tentativas feitas até agora: 2.'));
    expect(app.text()).toContain('O servidor tenta de novo sozinho');
    expect(app.text()).not.toMatch(/falhou|não foi gerado/i);
  });

  it('stops asking when the student leaves the screen', async () => {
    const { app, backend } = await open('/hoje', {
      runningJob: 'job-1',
      steps: [{ status: 'PENDING' }],
    });
    await vi.waitFor(() =>
      expect(backend.count('GET', '/generation-requests/')).toBeGreaterThan(2),
    );
    await app.router.navigateByUrl('/conta');
    await app.settle();
    const asked = backend.count('GET', '/generation-requests/');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(backend.count('GET', '/generation-requests/')).toBe(asked);
  });
});

describe('the four failure reasons, and CANCELLED', () => {
  const CASES = [
    {
      reason: 'CORE_UNAVAILABLE',
      says: 'não respondeu, nem nas novas tentativas',
      askAgain: true,
      setup: false,
    },
    { reason: 'CORE_REJECTED', says: 'recusou o pedido', askAgain: false, setup: true },
    { reason: 'NOTHING_TO_PLAN', says: 'Não havia o que planejar', askAgain: false, setup: true },
    { reason: 'INTERNAL', says: 'Uma falha do próprio SINAPSE', askAgain: false, setup: false },
  ] as const;

  for (const { reason, says, askAgain, setup } of CASES) {
    it(`${reason}: its own message; ${askAgain ? 'the one that offers to ask again now' : 'no offer to ask again now'}`, async () => {
      const { app } = await open('/hoje', {
        runningJob: 'job-1',
        steps: [{ status: 'FAILED', failureReason: reason }],
      });
      await vi.waitFor(() => expect(app.text()).toContain('O plano não foi gerado'));
      expect(app.text()).toContain(says);
      expect(app.text()).not.toContain(reason);
      expect(app.buttonNamed('Pedir de novo') !== undefined).toBe(askAgain);
      const links = [...app.root().querySelectorAll('sn-generation-failure a')].map((a) =>
        a.getAttribute('href'),
      );
      expect(links).toEqual(setup ? ['/conta/disponibilidade', '/conta/metas'] : []);
      // A failed request says something about a request, never about the student.
      expect(app.root().querySelector(JUDGING)).toBeNull();
    });
  }

  it('the four messages are four different texts', async () => {
    const texts = new Set<string>();
    for (const { reason } of CASES) {
      const { app } = await open('/hoje', {
        runningJob: 'job-1',
        steps: [{ status: 'FAILED', failureReason: reason }],
      });
      await vi.waitFor(() => expect(app.text()).toContain('O plano não foi gerado'));
      texts.add(app.root().querySelector('sn-generation-failure')?.textContent ?? '');
      server.resetHandlers();
    }
    expect(texts.size).toBe(4);
  });

  it('CANCELLED is handled, and no cancel control exists — before or after', async () => {
    const { app } = await open('/hoje', {
      runningJob: 'job-1',
      steps: [{ status: 'PENDING' }, { status: 'PENDING' }, { status: 'CANCELLED' }],
    });
    await vi.waitFor(() => expect(generationCard(app.root())).not.toBeNull());
    expect(app.root().textContent).not.toMatch(/cancelar|cancele/i);
    await vi.waitFor(() =>
      expect(app.text()).toContain('O pedido foi encerrado antes de produzir um plano'),
    );
    expect(app.root().textContent).not.toMatch(/cancelar|cancele/i);
    expect(app.buttonNamed(/cancel/i)).toBeUndefined();
  });

  it('a failure with a plan in force says that plan still holds', async () => {
    const { app } = await open('/plano', {
      plans: [planBody()],
      runningJob: 'job-1',
      steps: [{ status: 'FAILED', failureReason: 'CORE_UNAVAILABLE' }],
    });
    await vi.waitFor(() => expect(app.text()).toContain('O plano não foi gerado'));
    expect(app.text()).toContain('O plano em vigor continua valendo');
    expect(app.text()).toContain('O que este plano pede');
  });
});

describe('the two meanings of the 409, resolved by type and the session state', () => {
  it('`conflict`: /me/state names the running job, which is followed — no second request', async () => {
    const { app, backend } = await open('/hoje', {
      posts: [{ problem: 'urn:sinapse:problem:conflict' }],
      steps: [{ status: 'PENDING' }],
    });
    // Another tab asked a moment ago: the store does not know yet, the server does.
    backend.startRunning('job-other');
    await app.click('Gerar meu plano');
    await vi.waitFor(() =>
      expect(app.text()).toContain('Já havia um pedido de plano em andamento'),
    );
    await vi.waitFor(() =>
      expect(backend.hits.some((hit) => hit.path.endsWith('/generation-requests/job-other'))).toBe(
        true,
      ),
    );
    expect(backend.count('POST', '/generation-requests')).toBe(1);
    expect(generationCard(app.root())).not.toBeNull();
  });

  it('`setup-incomplete`: the state is read again and the guard chain takes the person to setup', async () => {
    const { app, backend } = await open('/hoje', {
      posts: [{ problem: 'urn:sinapse:problem:setup-incomplete' }],
    });
    server.use(...setupServer().handlers);
    backend.setState({ setupComplete: false });
    await app.click('Gerar meu plano');
    await vi.waitFor(() => expect(app.router.url).toBe('/configurar'));
    expect(backend.count('POST', '/generation-requests')).toBe(1);
  });
});

describe('403 and 429 on the request', () => {
  it('429: the wait is told, no action is offered while it holds, nothing is asked again', async () => {
    const { app, backend } = await open('/hoje', {
      posts: [{ problem: 'urn:sinapse:problem:rate-limit-exceeded', retryAfterSeconds: 1200 }],
    });
    await app.click('Gerar meu plano');
    await vi.waitFor(() => expect(app.text()).toContain('Aguarde 20 minutos'));
    expect(app.buttonNamed('Gerar meu plano')).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.count('POST', '/generation-requests')).toBe(1);
  });

  it('403: the state is read again and the chain decides (here, suspended)', async () => {
    const { app, backend } = await open('/hoje', {
      posts: [{ problem: 'urn:sinapse:problem:access-denied' }],
    });
    backend.setState({ accountStatus: 'SUSPENDED', setupComplete: false });
    await app.click('Gerar meu plano');
    await vi.waitFor(() => expect(app.router.url).toBe('/conta-suspensa'));
  });
});

describe('/plano', () => {
  it('a 404 on `current` is the no-plan state, not the error screen', async () => {
    const { app, backend } = await open('/plano');
    await vi.waitFor(() => expect(app.text()).toContain('Você ainda não tem um plano'));
    expect(backend.count('GET', '/study-plans/current')).toBe(1);
    expect(app.root().querySelector('sn-error-state')).toBeNull();
    expect(app.text()).not.toMatch(/não encontrad|erro|problema/i);
    expect(app.buttonNamed('Gerar meu plano')).toBeDefined();
  });

  it('negative control: a 500 on `current` IS the error screen', async () => {
    const { app } = await open('/plano', {
      currentProblem: { type: 'urn:sinapse:problem:internal-error' },
    });
    await vi.waitFor(() => expect(app.root().querySelector('sn-error-state')).not.toBeNull());
    expect(app.text()).not.toContain('Você ainda não tem um plano');
  });

  it('429 on `current`: the wait, no retry control', async () => {
    const { app } = await open('/plano', {
      currentProblem: { type: 'urn:sinapse:problem:rate-limit-exceeded', retryAfterSeconds: 90 },
    });
    await vi.waitFor(() => expect(app.text()).toContain('Aguarde 2 minutos'));
    expect(app.root().querySelector('sn-rate-limit-notice button')).toBeNull();
  });

  it('shows what the plan asks for before any list, where to start, and the list closed', async () => {
    const { app } = await open('/plano', { plans: [planBody()] });
    await vi.waitFor(() => expect(app.text()).toContain('Por onde começar'));
    const text = app.text();
    expect(text).toContain('O que este plano pede');
    expect(text).toContain('3 h 45 min de estudo marcadas');
    expect(text).toContain('De 12 de novembro de 2026 a 10 de dezembro de 2026');
    expect(text).toContain('Ele não vai até a data-alvo das suas metas');
    expect(text).toContain('Anatomia Humana');
    expect(text).toContain('4 de 35 tópicos de Anatomia Humana estão neste plano.');
    // The order of the document is the order of the screen.
    const order = [
      'O que este plano pede',
      'Por onde começar',
      'Seu ritmo',
      'Ver todas as sessões',
      'Pedir um plano novo',
      'Ver o histórico',
    ];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // The whole sequence is consultation: closed.
    const details = app.root().querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain('(4 sessões)');
  });

  it('names every topic from the catalogue, and never shows an identifier', async () => {
    const id = '3922fcb1-cf4f-4932-baac-9727f778f4b4';
    const { app } = await open('/plano', {
      plans: [planBody()],
      sessionsFor: (planId) =>
        sessionsOf(planId, 4).map((s, i) => (i === 3 ? { ...s, topicId: id } : s)),
    });
    await vi.waitFor(() => expect(app.text()).toContain('Ver todas as sessões'));
    (app.root().querySelector('details') as HTMLDetailsElement).open = true;
    expect(app.text()).toContain('Tópico 1');
    expect(app.text()).toContain('Tópico que não está mais no catálogo');
    expect(app.root().innerHTML).not.toContain(id);
    // No identifier anywhere in the markup: not a topic's, a session's, the plan's or a subject's.
    expect(app.root().innerHTML).not.toMatch(/plan-1|topic-\d|job-\d/);
    expect(app.root().innerHTML).not.toContain(ANATOMY.id);
  });

  it('groups the sessions by the ACCOUNT’s day: 22:00Z on Monday is Monday 19:00 in São Paulo', async () => {
    const { app } = await open('/plano', { plans: [planBody()] });
    await vi.waitFor(() => expect(app.text()).toContain('Ver todas as sessões'));
    const headings = [...app.root().querySelectorAll('.day__heading')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual([
      'quinta-feira, 12 de novembro',
      'segunda-feira, 16 de novembro',
      'quinta-feira, 19 de novembro',
    ]);
    expect(app.text()).toContain('19:00');
    expect(app.text()).toContain('Revisão');
  });
});

describe('adherence', () => {
  it('absent: "nothing fell due yet", in words — no 0, no bar', async () => {
    const { app } = await open('/plano', { plans: [planBody()] });
    await vi.waitFor(() => expect(app.text()).toContain('Seu ritmo'));
    const note = app.root().querySelector('sn-adherence-note') as HTMLElement;
    expect(note.textContent).toContain('Nenhuma sessão deste plano venceu ainda');
    expect(note.textContent).not.toMatch(/\b0\b|0%|zero/);
    expect(note.querySelector('.sn-adh__track')).toBeNull();
  });

  it('present: the two numbers in a sentence, a bar only as support, never a percentage', async () => {
    const { app } = await open('/plano', {
      plans: [planBody()],
      adherenceFor: () => ({ plannedElapsed: 9, executed: 6, ratio: 0.6667 }),
    });
    await vi.waitFor(() => expect(app.text()).toContain('Você concluiu 6 de 9 sessões previstas'));
    const note = app.root().querySelector('sn-adherence-note') as HTMLElement;
    expect(note.textContent).not.toContain('%');
    expect(note.querySelector('.sn-adh__fill')).not.toBeNull();
  });

  it('carries no judging colour, low or high: the same classes for 0 of 9 and 9 of 9', async () => {
    const classes: string[] = [];
    for (const adherence of [
      { plannedElapsed: 9, executed: 0, ratio: 0 },
      { plannedElapsed: 9, executed: 9, ratio: 1 },
    ]) {
      const { app } = await open('/plano', { plans: [planBody()], adherenceFor: () => adherence });
      await vi.waitFor(() => expect(app.text()).toContain('Você concluiu'));
      const note = app.root().querySelector('sn-adherence-note') as HTMLElement;
      expect(note.querySelector(JUDGING)).toBeNull();
      expect(note.innerHTML).not.toMatch(/--(error|success|warning)|sn-badge/);
      expect(note.textContent).not.toMatch(/parab|ótimo|baix|ruim|atrasad|falhou/i);
      classes.push(
        [...note.querySelectorAll('*')].map((el) => el.getAttribute('class') ?? '').join('|'),
      );
      server.resetHandlers();
    }
    expect(classes[0]).toBe(classes[1]);
  });

  it('says when sessions were scheduled before the plan existed (observed: 0 of 2 at once)', async () => {
    const { app } = await open('/plano', {
      plans: [planBody({ createdAt: '2026-11-12T20:41:50Z' })],
      adherenceFor: () => ({ plannedElapsed: 2, executed: 0, ratio: 0 }),
    });
    await vi.waitFor(() => expect(app.text()).toContain('Você concluiu 0 de 2 sessões previstas'));
    expect(app.text()).toContain(
      '2 delas estavam marcadas para horários anteriores à criação do plano',
    );
  });
});

describe('re-planning', () => {
  it('says what will happen before asking, confirms with an ordinary dialog, and supersedes the plan', async () => {
    const { app, backend } = await open('/plano', {
      plans: [planBody()],
      steps: [{ status: 'PENDING' }, { status: 'READY', planId: 'plan-2' }],
    });
    await vi.waitFor(() => expect(app.text()).toContain('Pedir um plano novo'));
    expect(app.text()).toContain('O plano atual deixa de valer');
    expect(app.text()).toContain('o que você já estudou continua registrado');
    expect(backend.count('POST', '/generation-requests')).toBe(0);

    await app.click('Gerar um plano novo');
    const dialog = app.root().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('O plano atual deixa de valer');
    expect(dialog.textContent).toContain('continua registrado');
    // Ordinary, not the typed-word confirmation: nothing is deleted, and asking again is possible.
    expect(dialog.querySelector('input')).toBeNull();
    expect(dialog.querySelector('.sn-btn--danger')).toBeNull();
    expect(backend.count('POST', '/generation-requests')).toBe(0);

    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Gerar plano novo')
      ?.click();
    await vi.waitFor(() => expect(app.text()).toContain('Seu plano está pronto'));
    expect(app.text()).toContain('O plano anterior está no histórico');
    expect(backend.count('POST', '/generation-requests')).toBe(1);
    expect(backend.plans().map((p) => [p.id, p.status, p.supersededByPlanId])).toEqual([
      ['plan-2', 'ACTIVE', undefined],
      ['plan-1', 'SUPERSEDED', 'plan-2'],
    ]);
    await vi.waitFor(() => expect(backend.count('GET', '/study-plans/plan-2/summary')).toBe(1));
    expect(app.text()).toContain('Em vigor');
  });

  it('cancelling the dialog asks for nothing', async () => {
    const { app, backend } = await open('/plano', { plans: [planBody()] });
    await vi.waitFor(() => expect(app.text()).toContain('Pedir um plano novo'));
    await app.click('Gerar um plano novo');
    const dialog = app.root().querySelector('[role="dialog"]') as HTMLElement;
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Cancelar')
      ?.click();
    await app.settle();
    expect(app.root().querySelector('[role="dialog"]')).toBeNull();
    expect(backend.count('POST', '/generation-requests')).toBe(0);
  });
});

describe('/plano/historico', () => {
  const HISTORY = [
    planBody({ id: 'plan-2', createdAt: '2026-11-12T20:55:00Z' }),
    planBody({
      id: 'plan-1',
      status: 'SUPERSEDED',
      createdAt: '2026-11-12T20:41:50Z',
      supersededAt: '2026-11-12T20:55:00Z',
      supersededByPlanId: 'plan-2',
    }),
  ];

  it('shows a superseded plan as a record: the chain in words, the same ink, no strike-through', async () => {
    const { app } = await open('/plano/historico', { plans: HISTORY });
    await vi.waitFor(() => expect(app.text()).toContain('Substituído em'));
    const rows = [...app.root().querySelectorAll('.sn-plan-row')] as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Em vigor');
    expect(rows[1].textContent).toContain(
      'Substituído em 12/11/2026, 17:55, pelo plano gerado em 12/11/2026, 17:55.',
    );
    expect(rows[0].querySelector('.sn-badge--primary')).not.toBeNull();
    expect(rows[1].querySelector('.sn-badge')?.className).toBe('sn-badge');
    for (const row of rows) {
      const style = getComputedStyle(row);
      expect(style.textDecorationLine ?? '').not.toContain('line-through');
      expect(row.innerHTML).not.toMatch(/line-through|<s>|<del>|opacity/);
    }
    expect(app.root().querySelector(JUDGING)).toBeNull();
  });

  it('empty: says what will appear there', async () => {
    const { app } = await open('/plano/historico');
    await vi.waitFor(() => expect(app.text()).toContain('Nenhum plano ainda'));
  });

  it('error and rate limit are their own states', async () => {
    const { app } = await open('/plano/historico', {
      currentProblem: { type: 'urn:sinapse:problem:internal-error' },
    });
    await vi.waitFor(() => expect(app.root().querySelector('sn-error-state')).not.toBeNull());
    server.resetHandlers();
    const limited = await open('/plano/historico', {
      currentProblem: { type: 'urn:sinapse:problem:rate-limit-exceeded', retryAfterSeconds: 30 },
    });
    await vi.waitFor(() => expect(limited.app.text()).toContain('Aguarde 30 segundos'));
  });
});
