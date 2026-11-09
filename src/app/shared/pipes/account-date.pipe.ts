import { Pipe, PipeTransform, inject } from '@angular/core';

import { AccountTimeService, type InstantFormat } from '../../core/time/account-time.service';

/**
 * `{{ instant | accountDate: 'date' }}` — formats an instant in the account's zone, through
 * `AccountTimeService` and nothing else (`CLAUDE.md` R4). Use it instead of Angular's `date` pipe,
 * which formats in the browser's zone.
 *
 * Impure on purpose: the account zone is a signal that can arrive after the first render, and a
 * pure pipe would keep the text it computed in the fallback zone.
 */
@Pipe({ name: 'accountDate', pure: false })
export class AccountDatePipe implements PipeTransform {
  private readonly time = inject(AccountTimeService);

  transform(instant: string | Date | null | undefined, format: InstantFormat = 'dateTime'): string {
    return instant === null || instant === undefined
      ? ''
      : this.time.formatInstant(instant, format);
  }
}
