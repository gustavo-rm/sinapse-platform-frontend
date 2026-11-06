import { Component, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { StudentLayout } from './student-layout';

@Component({ template: '<h1>Página</h1>' })
class StubPage {}

describe('StudentLayout', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StudentLayout],
      providers: [
        provideRouter(
          ['hoje', 'agenda', 'plano', 'conta'].map((path) => ({ path, component: StubPage })),
        ),
      ],
    });
  });

  afterEach(() => TestBed.inject(DOCUMENT).documentElement.removeAttribute('data-theme'));

  async function render(url = '/hoje'): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(StudentLayout);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('has exactly four navigation items, in the order Hoje, Agenda, Plano, Conta', async () => {
    const host = await render();
    const links = [...host.querySelectorAll('nav a')];

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Hoje',
      'Agenda',
      'Plano',
      'Conta',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/hoje',
      '/agenda',
      '/plano',
      '/conta',
    ]);
  });

  it('exposes the <nav> and <main> landmarks, and the navigation is named', async () => {
    const host = await render();

    expect(host.querySelectorAll('nav')).toHaveLength(1);
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Navegação principal');
    expect(host.querySelectorAll('main')).toHaveLength(1);
  });

  it('renders no heading of its own, leaving the one <h1> to the page', async () => {
    const host = await render();
    expect(host.querySelectorAll('h1')).toHaveLength(1);
  });

  it('marks the current area with aria-current="page"', async () => {
    const host = await render('/plano');
    const current = host.querySelectorAll('nav a[aria-current="page"]');

    expect(current).toHaveLength(1);
    expect(current[0].textContent?.trim()).toBe('Plano');
  });

  it('keeps every navigation target a native link, reachable by keyboard', async () => {
    const host = await render();
    for (const link of host.querySelectorAll<HTMLAnchorElement>('nav a')) {
      expect(link.tabIndex).toBe(0);
      expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('moves focus to the content with the skip control', async () => {
    const host = await render();
    host.querySelector<HTMLButtonElement>('.skip-link')?.click();

    expect(TestBed.inject(DOCUMENT).activeElement).toBe(host.querySelector('main'));
  });

  it('applies the theme picked in the switch to <html>', async () => {
    const host = await render();
    const select = host.querySelector<HTMLSelectElement>('select');
    if (!select) throw new Error('theme switch missing');

    select.value = 'dark';
    select.dispatchEvent(new Event('change'));

    expect(TestBed.inject(DOCUMENT).documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
