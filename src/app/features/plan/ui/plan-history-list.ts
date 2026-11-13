import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { AccountTimeService } from '../../../core/time/account-time.service';
import { PLAN_STATUS_LABELS } from '../../../shared/labels/plan-status.labels';
import { type Plan, successorOf } from '../model/plan';

interface HistoryRow {
  readonly id: string;
  readonly span: string;
  readonly created: string;
  readonly replaced: string | null;
  readonly status: string;
  readonly active: boolean;
}

/**
 * The plans that have existed (Design System, `PlanHistoryList`), newest first as the server
 * returns them, none hidden behind "ver mais".
 *
 * A superseded plan is a RECORD, not rubbish: its sessions are preserved because executed sessions
 * reference them. It keeps the same ink and weight as the plan in force — no strike-through, no
 * fading (the lesson of F22 in FE-7) — and says when it was replaced and by which plan, which is the
 * supersession chain read in words (`supersededByPlanId`, `supersededAt`). The plan in force carries
 * the `primary` badge; a superseded one the neutral badge. Both are words.
 */
@Component({
  selector: 'sn-plan-history-list',
  template: `
    <ol class="list">
      @for (row of rows(); track row.id) {
        <li class="sn-plan-row">
          <div>
            <div class="sn-plan-row__span">{{ row.span }}</div>
            <div class="sub">{{ row.created }}</div>
            @if (row.replaced; as replaced) {
              <div class="sub">{{ replaced }}</div>
            }
          </div>
          <span class="sn-badge" [class.sn-badge--primary]="row.active">{{ row.status }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }
    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .sub {
      margin-top: var(--space-1);
      font-size: 13px;
      line-height: 18px;
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanHistoryList {
  private readonly time = inject(AccountTimeService);

  readonly plans = input.required<readonly Plan[]>();

  protected readonly rows = computed<HistoryRow[]>(() => {
    const plans = this.plans();
    return plans.map((plan) => {
      const successor = successorOf(plan, plans);
      let replaced: string | null = null;
      if (plan.status === 'SUPERSEDED') {
        const when =
          plan.supersededAt === null
            ? null
            : this.time.formatInstant(plan.supersededAt, 'dateTime');
        const by =
          successor === null
            ? 'por um plano mais novo'
            : `pelo plano gerado em ${this.time.formatInstant(successor.createdAt, 'dateTime')}`;
        replaced = when === null ? `Substituído ${by}.` : `Substituído em ${when}, ${by}.`;
      }
      return {
        id: plan.id,
        span: this.span(plan),
        created: `Gerado em ${this.time.formatInstant(plan.createdAt, 'dateTime')}`,
        replaced,
        status: PLAN_STATUS_LABELS[plan.status],
        active: plan.status === 'ACTIVE',
      };
    });
  });

  private span(plan: Plan): string {
    return `${this.time.formatLocalDate(plan.horizonStart, 'longDate')} a ${this.time.formatLocalDate(plan.horizonEnd, 'longDate')}`;
  }
}
