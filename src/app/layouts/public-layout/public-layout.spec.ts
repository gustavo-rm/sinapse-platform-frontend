import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PublicLayout } from './public-layout';

describe('PublicLayout', () => {
  it('is one <main> column with no navigation', async () => {
    TestBed.configureTestingModule({
      imports: [PublicLayout],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(PublicLayout);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('main')).toHaveLength(1);
    expect(host.querySelector('nav')).toBeNull();
    expect(host.querySelectorAll('a')).toHaveLength(0);
  });

  it('offers no sign-out to a person with no session', async () => {
    TestBed.configureTestingModule({
      imports: [PublicLayout],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(PublicLayout);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('button.sign-out')).toBeNull();
  });
});
