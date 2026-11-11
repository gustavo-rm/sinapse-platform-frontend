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

  /**
   * `zone`: only where there is no account yet — the registration form passes the zone the person
   * is declaring (FE-6). Everywhere else, leave it out: the account's zone is the one.
   */
  transform(
    instant: string | Date | null | undefined,
    format: InstantFormat = 'dateTime',
    zone?: string | null,
  ): string {
    if (instant === null || instant === undefined) {
      return '';
    }
    return zone === null || zone === undefined || zone === ''
      ? this.time.formatInstant(instant, format)
      : this.time.formatInstant(instant, format, zone);
  }
}
