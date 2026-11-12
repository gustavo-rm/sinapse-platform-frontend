import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { AccountTimeService } from '../../../core/time/account-time.service';
import {
  type CatalogueMap,
  type PlanSummary,
  type PlannedSession,
  SERIES_SLOTS,
  coverageOf,
  formatMinutes,
  sessionCountText,
} from '../model/plan';

/** The eight categorical slots, by arrival order, never cycled (`docs/DESIGN_SYSTEM.md`, data). */
const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
] as const;

/** One row of the legend: a subject, its slot colour, its minutes and how much of it the plan holds. */
interface ShareRow {
  readonly key: string;
  readonly name: string;
  readonly colour: string;
  readonly minutes: number;
  readonly text: string;
  readonly coverage: string | null;
}

/**
 * What the plan asks for, before any list (Design System, `PlanSummary`): the total time, the
 * horizon, and how the time divides among the subjects — a segmented bar with a NAMED legend
 * (`series-3`…`series-5` are under 3:1 in the light theme, so identity never depends on colour), and
 * a table-equivalent in the legend itself, which is a list a screen reader reads.
 *
 * The horizon is the server's, fixed (decision F3): the dates are written, and a sentence says the
 * plan does not run to a goal's target date. How many of each subject's topics the plan holds is
 * said too, from the sessions and the catalogue — a goal is a whole subject, and a short plan may
 * hold only part of it.
 *
 * `fitness` is not an input: it never reaches this component (`model/plan.ts`).
 */
@Component({
  selector: 'sn-plan-overview',
  template: `
    <section class="sn-card overview" [attr.aria-labelledby]="headingId">
      <div class="sn-card__head">
        <h2 class="sn-card__title" [id]="headingId">O que este plano pede</h2>
      </div>
      <p class="sn-metric">{{ total() }} <span class="sn-metric__unit">de estudo marcadas</span></p>
      <p class="caption">{{ horizon() }} · {{ count() }}</p>
      <p class="body muted">
        O período do plano é fixo e começa no dia em que ele foi gerado. Ele não vai até a data-alvo
        das suas metas: quando este período acabar, ou quando você quiser, peça um plano novo.
      </p>

      <h3 class="h3">Por disciplina</h3>
      <div class="sn-split" aria-hidden="true">
        @for (row of rows(); track row.key) {
          <div
            class="sn-split__seg"
            [style.flex]="row.minutes"
            [style.background]="row.colour"
          ></div>
        }
      </div>
      <ul class="sn-legend" role="list">
        @for (row of rows(); track row.key) {
          <li>
            <div class="sn-legend__row">
              <span
                class="sn-legend__swatch"
                aria-hidden="true"
                [style.background]="row.colour"
              ></span>
              <span class="sn-legend__name">{{ row.name }}</span>
              <span class="sn-legend__val">{{ row.text }}</span>
            </div>
            @if (row.coverage; as coverage) {
              <p class="coverage">{{ coverage }}</p>
            }
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .overview {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .overview .sn-card__head {
      margin-bottom: 0;
    }
    .sn-metric,
    .caption,
    .body,
    .h3 {
      margin: 0;
    }
    .caption {
      font-size: 12px;
      line-height: 16px;
      color: var(--ink-subtle);
    }
    .muted {
      color: var(--ink-muted);
    }
    .h3 {
      margin-top: var(--space-4);
      font-size: 16px;
      font-weight: 600;
      line-height: 22px;
    }
    .sn-legend {
      margin: var(--space-3) 0 0;
      padding: 0;
      list-style: none;
    }
    .sn-legend__name {
      white-space: normal;
    }
    .coverage {
      margin: var(--space-1) 0 0 var(--space-5);
      font-size: 13px;
      line-height: 18px;
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanOverview {
  private readonly time = inject(AccountTimeService);

  readonly summary = input.required<PlanSummary>();
  readonly sessions = input<readonly PlannedSession[] | undefined>(undefined);
  readonly catalogue = input<CatalogueMap | undefined>(undefined);

  protected readonly headingId = 'sn-plan-overview-heading';

  protected readonly total = computed(() => formatMinutes(this.summary().totalPlannedMinutes));
  protected readonly count = computed(() =>
    sessionCountText(this.summary().bySubject.reduce((sum, share) => sum + share.sessionCount, 0)),
  );
  protected readonly horizon = computed(() => {
    const summary = this.summary();
    return `De ${this.time.formatLocalDate(summary.horizonStart, 'longDate')} a ${this.time.formatLocalDate(summary.horizonEnd, 'longDate')}`;
  });

  protected readonly rows = computed<ShareRow[]>(() => {
    const shares = this.summary().bySubject;
    const sessions = this.sessions();
    const catalogue = this.catalogue();
    const named = shares.length <= SERIES_SLOTS ? shares : shares.slice(0, SERIES_SLOTS - 1);
    const rows: ShareRow[] = named.map((share, index) => {
      const coverage =
        sessions !== undefined && catalogue !== undefined
          ? coverageOf(share.subjectId, sessions, catalogue)
          : null;
      return {
        key: share.subjectId,
        name: share.subjectName,
        colour: SERIES[index],
        minutes: share.plannedMinutes,
        text: `${formatMinutes(share.plannedMinutes)} · ${sessionCountText(share.sessionCount)}`,
        coverage:
          coverage === null || coverage.total === 0
            ? null
            : `${coverage.scheduled} de ${coverage.total} tópicos de ${share.subjectName} estão neste plano.`,
      };
    });
    const rest = shares.slice(named.length);
    if (rest.length > 0) {
      const minutes = rest.reduce((sum, share) => sum + share.plannedMinutes, 0);
      const count = rest.reduce((sum, share) => sum + share.sessionCount, 0);
      rows.push({
        key: 'outras',
        name: `Outras (${rest.length} disciplinas)`,
        colour: SERIES[SERIES_SLOTS - 1],
        minutes,
        text: `${formatMinutes(minutes)} · ${sessionCountText(count)}`,
        coverage: null,
      });
    }
    return rows;
  });
}
