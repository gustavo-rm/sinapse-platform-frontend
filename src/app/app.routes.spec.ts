import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from './app.routes';

describe('app routes', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  it.each([
    ['/hoje', 'Hoje'],
    ['/agenda', 'Agenda'],
    ['/plano', 'Plano'],
    ['/conta', 'Conta'],
    ['/entrar', 'Entrar'],
  ])('%s loads its area lazily and renders one <h1>, "%s"', async (url, name) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const headings = (harness.routeNativeElement as HTMLElement).querySelectorAll('h1');

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent?.trim()).toBe(name);
    expect(document.title).toBe(`${name} · SINAPSE`);
  });

  it('opens the student area on Hoje', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/hoje');
  });

  it('places the student areas in the student layout and the public area outside it', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/agenda');
    expect(harness.fixture.nativeElement.querySelector('sn-student-layout nav')).not.toBeNull();

    await harness.navigateByUrl('/entrar');
    expect(harness.fixture.nativeElement.querySelector('sn-public-layout')).not.toBeNull();
    expect(harness.fixture.nativeElement.querySelector('nav')).toBeNull();
  });

  it('declares no teacher route', () => {
    const paths = JSON.stringify(routes, (key, value) =>
      key === 'loadChildren' ? undefined : value,
    );
    expect(paths).not.toMatch(/turma|professor|teacher|classroom/i);
  });
});
