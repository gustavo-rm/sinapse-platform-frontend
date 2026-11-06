import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AccountTimeService } from '../../core/time/account-time.service';
import { AccountDatePipe } from './account-date.pipe';

@Component({
  imports: [AccountDatePipe],
  template: `<span>{{ instant | accountDate: 'time' }}</span
    ><b>{{ missing | accountDate }}</b>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  instant = '2026-11-06T22:00:00Z';
  missing: string | null = null;
}

describe('AccountDatePipe', () => {
  it('formats through AccountTimeService, in the account zone, and follows a zone set later', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const time = TestBed.inject(AccountTimeService);
    const format = vi.spyOn(time, 'formatInstant');
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const span = (fixture.nativeElement as HTMLElement).querySelector('span');

    expect(span?.textContent).toBe('22:00');
    expect(format).toHaveBeenCalledWith('2026-11-06T22:00:00Z', 'time');

    time.setAccountZone('America/Sao_Paulo');
    await fixture.whenStable();
    expect(span?.textContent).toBe('19:00');
    vi.restoreAllMocks();
  });

  it('renders nothing for an absent instant', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('b')?.textContent).toBe('');
  });
});
