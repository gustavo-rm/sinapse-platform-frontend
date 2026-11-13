import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { PlanGenerationFailure } from '../../../core/api/contract/enums';
import { PLAN_GENERATION_FAILURE_NEXT_LABELS } from '../../../shared/labels/plan-generation-failure-next.labels';
import { PLAN_GENERATION_FAILURE_LABELS } from '../../../shared/labels/plan-generation-failure.labels';
import { pointsToSetup, suggestsAskingAgainNow } from '../model/generation';

/**
 * How a generation ended without a plan: `FAILED` with one of four reasons, or `CANCELLED`.
 *
 * Four reasons, four messages, and ONE action that asks again: only after `CORE_UNAVAILABLE`
 * (`suggestsAskingAgainNow`). A refused request or "nothing to plan" links to availability and
 * goals, where the remedy is; a defect of the platform says so and offers nothing to repeat.
 *
 * `CANCELLED` exists in the contract and no route cancels: no code of the backend assigns it today
 * (READ, `sinapse-platform@44f3d1f`). It is handled — the server may send it — and NO cancel
 * control exists anywhere, because there is no route behind one.
 *
 * A failure is about a request, not about the student: an informational alert, never `error`
 * colour, and the plan in force, if any, is said to still hold ("A failed run leaves the previous
 * plan in force", backend).
 */
@Component({
  selector: 'sn-generation-failure',
  imports: [RouterLink],
  template: `
    <section class="sn-card fail" [attr.aria-labelledby]="headingId">
      <h2 class="sn-card__title" [id]="headingId">{{ heading() }}</h2>
      <p class="body">{{ what() }}</p>
      @if (hasPlan()) {
        <p class="body">O plano em vigor continua valendo, sem nenhuma mudança.</p>
      }
      <p class="body muted">{{ next() }}</p>
      <div class="actions">
        @if (askAgain()) {
          <button
            type="button"
            class="sn-btn sn-btn--primary"
            [disabled]="busy()"
            (click)="retry.emit()"
          >
            Pedir de novo
          </button>
        }
        @if (setup()) {
          <a class="sn-btn sn-btn--secondary" routerLink="/conta/disponibilidade">
            Rever disponibilidade
          </a>
          <a class="sn-btn sn-btn--secondary" routerLink="/conta/metas">Rever metas</a>
        }
        <button type="button" class="sn-btn sn-btn--ghost" (click)="dismiss.emit()">Entendi</button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .fail {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .body {
      margin: 0;
    }
    .muted {
      color: var(--ink-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .actions .sn-btn {
      min-height: var(--target-min);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationFailure {
  /** The reason of a FAILED job, or `cancelled`. */
  readonly reason = input.required<PlanGenerationFailure | 'cancelled'>();
  /** A plan is in force, and stays so. */
  readonly hasPlan = input(false);
  readonly busy = input(false);
  readonly retry = output<void>();
  readonly dismiss = output<void>();

  protected readonly headingId = 'sn-generation-failure-heading';

  protected readonly heading = computed(() =>
    this.reason() === 'cancelled'
      ? 'O pedido foi encerrado antes de produzir um plano'
      : 'O plano não foi gerado',
  );
  protected readonly what = computed(() => {
    const reason = this.reason();
    return reason === 'cancelled'
      ? 'O servidor encerrou este pedido antes de ele produzir um plano. Nenhum plano novo foi criado.'
      : PLAN_GENERATION_FAILURE_LABELS[reason];
  });
  protected readonly next = computed(() => {
    const reason = this.reason();
    return reason === 'cancelled'
      ? 'Se ainda quiser um plano novo, você pode pedi-lo.'
      : PLAN_GENERATION_FAILURE_NEXT_LABELS[reason];
  });
  protected readonly askAgain = computed(() => {
    const reason = this.reason();
    return reason !== 'cancelled' && suggestsAskingAgainNow(reason);
  });
  protected readonly setup = computed(() => {
    const reason = this.reason();
    return reason !== 'cancelled' && pointsToSetup(reason);
  });
}
