import { TestBed } from '@angular/core/testing';

import { useMswServer } from '../../../../testing/msw/server';
import {
  FAST_POLLING,
  type PlanServerOptions,
  planBody,
  planServer,
} from '../../../../testing/plan';
import { openApp } from '../../../../testing/privacy';

const server = useMswServer();

async function open(url: string, options: PlanServerOptions = {}) {
  TestBed.resetTestingModule();
  const backend = planServer(options);
  server.use(...backend.handlers);
  return { app: await openApp(url, FAST_POLLING), backend };
}

function headingLevels(root: HTMLElement): number[] {
  return [...root.querySelectorAll('main h1, main h2, main h3, main h4')].map((h) =>
    Number(h.tagName[1]),
  );
}

describe('accessibility of the plan screens (jsdom)', () => {
  for (const [url, options, ready] of [
    ['/hoje', {}, 'Você ainda não tem um plano'],
    ['/hoje', { runningJob: 'job-1', steps: [{ status: 'PENDING' }] }, 'Montando seu plano'],
    [
      '/hoje',
      { runningJob: 'job-1', steps: [{ status: 'FAILED', failureReason: 'CORE_REJECTED' }] },
      'O plano não foi gerado',
    ],
    ['/plano', { plans: [planBody()] }, 'Ver todas as sessões'],
    ['/plano', {}, 'Você ainda não tem um plano'],
    ['/plano/historico', { plans: [planBody()] }, 'Seus planos'],
  ] as const) {
    it(`${url} (${ready}): one h1, no skipped heading level, live regions in place, no fake controls`, async () => {
      const { app } = await open(url, options as PlanServerOptions);
      await vi.waitFor(() => expect(app.text()).toContain(ready));
      const main = app.root();
      expect(main.querySelectorAll('main h1')).toHaveLength(1);
      const levels = headingLevels(main);
      expect(levels[0]).toBe(1);
      levels.forEach((level, index) => {
        if (index > 0) {
          expect(level - levels[index - 1]).toBeLessThanOrEqual(1);
        }
      });
      if (url !== '/plano/historico') {
        expect(main.querySelectorAll('main [role="status"]').length).toBeGreaterThan(0);
      }
      expect(main.querySelectorAll('[onclick], div[tabindex], span[tabindex]')).toHaveLength(0);
      for (const labelled of main.querySelectorAll('[aria-labelledby]')) {
        expect(
          document.getElementById(labelled.getAttribute('aria-labelledby') ?? ''),
        ).not.toBeNull();
      }
    });
  }

  it('the wait announces its phase politely, and its clock in words, not every second', async () => {
    const { app } = await open('/hoje', { runningJob: 'job-1', steps: [{ status: 'PENDING' }] });
    await vi.waitFor(() => expect(app.text()).toContain('Montando seu plano'));
    const card = app.root().querySelector('sn-generation-progress') as HTMLElement;
    const live = card.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toContain('na fila do servidor');
    expect(live.textContent).not.toMatch(/\d+:\d{2}/);
    expect(card.querySelector('.clock__value')?.getAttribute('aria-hidden')).toBe('true');
    expect(card.querySelector('.visually-hidden')?.textContent).toMatch(/segundo/);
  });

  it('after asking, focus moves to the wait that replaced the button', async () => {
    const { app } = await open('/hoje', { steps: [{ status: 'PENDING' }] });
    await app.click('Gerar meu plano');
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('sn-generation-heading'));
  });

  it('the whole list opens from the keyboard: a native <details> with a <summary>', async () => {
    const { app } = await open('/plano', { plans: [planBody()] });
    await vi.waitFor(() => expect(app.text()).toContain('Ver todas as sessões'));
    const summary = app.root().querySelector('details > summary') as HTMLElement;
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain('Ver todas as sessões do plano');
  });
});
