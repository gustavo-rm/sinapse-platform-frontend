import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { AccountTimeService } from '../../../core/time/account-time.service';
import type { CatalogueMap, PlannedSession } from '../model/plan';
import { rowOf } from './session-list';

/**
 * "Where do I start": the first session of the plan, in sequence, whose time has not come yet.
 * One session, not a list — the answer to the question the plan screen exists for. The day of the
 * agenda is FE-9's; this is the plan's view of what comes next.
 */
@Component({
  selector: 'sn-next-session',
  template: `
    <section class="sn-card next" [attr.aria-labelledby]="headingId">
      <h2 class="sn-card__title" [id]="headingId">Por onde começar</h2>
      @if (row(); as r) {
        <p class="when">{{ day() }}, às {{ r.time }}</p>
        <p class="topic">{{ r.topic }}</p>
        <p class="detail">{{ r.detail }}</p>
      } @else {
        <p class="detail">
          O horário de todas as sessões deste plano já passou. Para seguir estudando com um plano,
          peça um plano novo.
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .next {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .next .sn-card__title {
      margin-bottom: var(--space-2);
    }
    .when,
    .topic,
    .detail {
      margin: 0;
    }
    .when {
      color: var(--ink-muted);
    }
    .when::first-letter {
      text-transform: uppercase;
    }
    .topic {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .detail {
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextSession {
  private readonly time = inject(AccountTimeService);

  readonly session = input.required<PlannedSession | null>();
  readonly catalogue = input.required<CatalogueMap>();

  protected readonly headingId = 'sn-next-session-heading';

  protected readonly row = computed(() => {
    const session = this.session();
    return session === null ? null : rowOf(session, this.catalogue(), this.time);
  });
  protected readonly day = computed(() => {
    const session = this.session();
    return session === null ? '' : this.time.formatInstant(session.scheduledStart, 'weekdayDate');
  });
}
