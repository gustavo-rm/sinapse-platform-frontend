import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { apiFailureOf, isRateLimitExceeded } from '../../../core/api/api-problem';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PlanApi } from '../data/plan-api';
import { PlanHistoryList } from '../ui/plan-history-list';

/**
 * `/plano/historico` — every plan this account has had (`GET /api/v1/study-plans`), returned whole
 * with a ceiling on the server: re-planning is manual, so the list grows in single figures and
 * needs neither a window nor pagination. Superseded plans are a record, with the chain readable.
 */
@Component({
  selector: 'sn-plan-history-page',
  imports: [EmptyState, ErrorState, LoadingState, PlanHistoryList, RateLimitNotice, RouterLink],
  template: `
    <h1 class="display-md">Histórico de planos</h1>
    <p class="body muted">
      Cada vez que você pede um plano novo, o anterior deixa de valer e fica registrado aqui, com as
      sessões dele: um plano novo nunca apaga o anterior, e o que você estudou continua ligado a
      ele.
    </p>

    @if (failure(); as problem) {
      @if (retryAfter() !== undefined) {
        <sn-rate-limit-notice [retryAfterSeconds]="retryAfter() ?? null" />
      } @else {
        <sn-error-state
          [problem]="problem"
          description="O histórico não pôde ser lido agora."
          (retry)="history.reload()"
        />
      }
    } @else if (plans(); as list) {
      @if (list.length === 0) {
        <sn-empty-state
          title="Nenhum plano ainda"
          description="Quando você pedir seu primeiro plano, ele aparece aqui; e cada plano novo que você pedir depois também."
          actionLabel="Ir para o plano"
          (action)="goToPlan()"
        />
      } @else {
        <section class="sn-card" aria-labelledby="sn-history-heading">
          <h2 class="sn-card__title" id="sn-history-heading">
            Seus planos, do mais novo ao mais antigo
          </h2>
          <sn-plan-history-list [plans]="list" />
        </section>
      }
    } @else {
      <sn-loading-state label="Carregando o histórico de planos" [count]="3" />
    }

    <p class="body"><a routerLink="/plano">Voltar para o plano</a></p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    h1,
    .body {
      margin: 0;
    }
    .muted {
      max-width: var(--reading-max);
      color: var(--ink-muted);
    }
    .sn-card__title {
      margin-bottom: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanHistoryPage {
  private readonly api = inject(PlanApi);
  private readonly router = inject(Router);

  protected readonly history = this.api.history();
  protected readonly plans = computed(() =>
    this.history.hasValue() ? this.history.value() : undefined,
  );
  protected readonly failure = computed(() => {
    const error = this.history.error();
    return error === undefined ? null : apiFailureOf(error);
  });
  protected readonly retryAfter = computed<number | null | undefined>(() => {
    const failure = this.failure();
    return failure !== null && isRateLimitExceeded(failure) ? failure.retryAfterSeconds : undefined;
  });

  protected goToPlan(): void {
    void this.router.navigateByUrl('/plano');
  }
}
