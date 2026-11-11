import { useMswServer } from '../../../../testing/msw/server';
import { openApp, stateBody, stateServer } from '../../../../testing/privacy';
import { goalBody, setupServer, windowBody } from '../../../../testing/setup';

const server = useMswServer();

/** Every form control has a name a screen reader can say: a label, or an enclosing label. */
function unnamedControls(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLInputElement>('input, select, textarea')]
    .filter((control) => control.type !== 'hidden')
    .filter((control) => (control.labels?.length ?? 0) === 0 && !control.getAttribute('aria-label'))
    .map((control) => control.outerHTML.slice(0, 80));
}

/** Every `aria-describedby` points at elements that exist. */
function danglingDescriptions(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[aria-describedby]')].flatMap((element) =>
    (element.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id !== '' && document.getElementById(id) === null),
  );
}

describe('accessibility of the setup and account-area screens (jsdom)', () => {
  for (const [url, state] of [
    ['/configurar', stateBody({ setupComplete: false })],
    ['/conta/disponibilidade', stateBody()],
    ['/conta/metas', stateBody()],
  ] as const) {
    it(`${url}: one h1, no skipped heading level, every control named, live regions in place`, async () => {
      const backend = setupServer({
        windows: [
          windowBody(),
          windowBody({ id: 'c', dayOfWeek: 'MONDAY', effectiveUntil: '2026-11-05' }),
        ],
        goals: [goalBody({ id: 'a', targetDate: '2027-06-30' })],
      });
      server.use(stateServer(state).handler, ...backend.handlers);
      const app = await openApp(url);
      const main = app.root();

      expect(main.querySelectorAll('h1')).toHaveLength(1);
      const levels = [...main.querySelectorAll('h1, h2, h3, h4')].map((h) => Number(h.tagName[1]));
      levels.forEach((level, index) => {
        if (index > 0) {
          expect(level - levels[index - 1]).toBeLessThanOrEqual(1);
        }
      });
      expect(unnamedControls(main)).toEqual([]);
      expect(danglingDescriptions(main)).toEqual([]);
      // Present before anything is said in them, so what happens after an act is announced.
      expect(main.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
      expect(main.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0);
      // Every action is a real button or link: reachable by keyboard.
      expect(main.querySelectorAll('[onclick], div[tabindex], span[tabindex]')).toHaveLength(0);
    });
  }

  it('the priority control is one radio group with a legend, its direction said in words', async () => {
    const backend = setupServer();
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/metas');
    const fieldset = app.root().querySelector('fieldset.sn-prio-field') as HTMLFieldSetElement;
    expect(fieldset.querySelector('legend')?.textContent?.trim()).toBe('Prioridade');
    const names = new Set(
      [...fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => r.name),
    );
    expect(names.size).toBe(1);
    expect(fieldset.textContent).toContain('a maior prioridade');
    expect(
      document.getElementById(fieldset.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('Quanto maior o número');
  });

  it('opening a closing panel moves focus to its date; cancelling returns it to "Encerrar"', async () => {
    const backend = setupServer({ windows: [windowBody({ id: 'w' })] });
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/disponibilidade');
    await app.click('Encerrar');
    await app.settle();
    expect(document.activeElement?.getAttribute('type')).toBe('date');
    await app.click('Cancelar');
    await app.settle();
    expect(document.activeElement?.textContent?.trim()).toBe('Encerrar');
  });

  it('a refused declaration moves focus to the first invalid field', async () => {
    const backend = setupServer();
    server.use(stateServer(stateBody()).handler, ...backend.handlers);
    const app = await openApp('/conta/disponibilidade');
    await app.click('Adicionar janela');
    await app.settle();
    expect(document.activeElement?.tagName).toBe('SELECT');
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
  });
});
