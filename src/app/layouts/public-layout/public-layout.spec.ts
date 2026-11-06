import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PublicLayout } from './public-layout';

describe('PublicLayout', () => {
  it('is one <main> column with no navigation', async () => {
    TestBed.configureTestingModule({ imports: [PublicLayout], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PublicLayout);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('main')).toHaveLength(1);
    expect(host.querySelector('nav')).toBeNull();
    expect(host.querySelectorAll('a')).toHaveLength(0);
  });
});
