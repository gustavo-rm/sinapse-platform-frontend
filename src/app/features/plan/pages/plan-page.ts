import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { type ApiFailure, apiFailureOf } from '../../../core/api/api-problem';
import { AccountTimeService } from '../../../core/time/account-time.service';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PlanApi } from '../data/plan-api';
import { GENERATION_CLOCK } from '../model/generation';
import { currentPlanStateOf, nextSessionOf, sessionsBeforeCreation } from '../model/plan';
import { AdherenceNote } from '../ui/adherence-note';
import { NextSession } from '../ui/next-session';
import { PlanOverview } from '../ui/plan-overview';
import { SessionList } from '../ui/session-list';
import { PlanGenerationPanel } from './plan-generation-panel';

/**
 * `/plano` — "what does this plan ask of me, and where do I start", not "here are 112 sessions".
 *
 * The hierarchy, top to bottom:
 *
 * 1. what the plan asks for: the total time, the horizon, the division by subject — the whole plan
 *    in one card;
 * 2. where to start: ONE session, the next one;
 * 3. the rhythm (adherence), in words, with no judging colour, and absent said as absent;
 * 4. the whole sequence, closed, for consultation;
 * 5. asking for a new plan, with its consequence written before the button;
 * 6. the history of plans.
 *
 * The generation panel sits at the top and shows something only when there is something to follow
 * — a wait, a failure, a note — so a new plan being made is the first thing on the screen while the
 * plan in force stays readable below. The re-plan action is near the end, its consequence written
 * before the button. The order on screen is the order of the document (no CSS reordering).
 *
 * `GET /study-plans/current` names the plan; its summary and its sessions follow, and the catalogue
 * map is built once, from the subjects of the summary, for every list on the screen.
 */
@Component({
  selector: 'sn-plan-page',
  imports: [
    AdherenceNote,
    ErrorState,
    LoadingState,
    NextSession,
    PlanGenerationPanel,
    PlanOverview,
    RateLimitNotice,
    RouterLink,
    SessionList,
  ],
  template: `
    <h1 class="display-md">Plano</h1>

    @switch (state().kind) {
      @case ('loading') {
        <sn-loading-state label="Carregando seu plano" shape="cards" [count]="3" />
      }
      @case ('rate-limited') {
        <sn-rate-limit-notice [retryAfterSeconds]="retryAfter()" />
      }
      @case ('failed') {
        @if (failure(); as problem) {
          <sn-error-state
            [problem]="problem"
            description="O plano não pôde ser lido agora."
            (retry)="reload()"
          />
        }
      }
      @case ('none') {
        <sn-plan-generation-panel mode="start" (ready)="reload()" (changed)="reload()" />
      }
      @case ('plan') {
        @if (plan(); as current) {
          <p class="caption">Em vigor · gerado em {{ createdAt() }}</p>
          <div class="sections">
            <sn-plan-generation-panel
              mode="replan"
              (ready)="reload()"
              (changed)="reload()"
              (following)="generating.set($event)"
            />

            @if (summaryFailure(); as problem) {
              <sn-error-state
                [problem]="problem"
                description="O resumo do plano não pôde ser lido agora."
                (retry)="summary.reload()"
              />
            } @else if (summaryValue(); as s) {
              <div class="pair">
                <sn-plan-overview
                  [summary]="s"
                  [sessions]="sessionsValue()"
                  [catalogue]="catalogueValue()"
                />
                <div class="pair__side">
                  @if (sessionsFailure() ?? catalogueFailure(); as problem) {
                    <sn-error-state
                      [problem]="problem"
                      description="As sessões do plano não puderam ser lidas agora."
                      (retry)="reloadSessions()"
                    />
                  } @else if (listReady(); as ready) {
                    <sn-next-session [session]="ready.next" [catalogue]="ready.catalogue" />
                  } @else {
                    <sn-loading-state label="Carregando as sessões" [count]="2" />
                  }
                  <sn-adherence-note
                    [adherence]="s.adherence"
                    [beforeCreation]="beforeCreation()"
                  />
                </div>
              </div>
            } @else {
              <sn-loading-state label="Carregando o resumo do plano" shape="cards" [count]="2" />
            }

            @if (listReady(); as ready) {
              <sn-session-list [sessions]="ready.sessions" [catalogue]="ready.catalogue" />
            }

            <section class="sn-card replan" aria-labelledby="sn-replan-heading">
              <h2 class="sn-card__title" id="sn-replan-heading">Pedir um plano novo</h2>
              <p class="body">
                Um plano novo substitui o atual. O plano atual deixa de valer, e as sessões dele que
                ainda não chegaram saem do caminho. Nada é apagado: o plano atual fica no histórico,
                com todas as sessões dele, e o que você já estudou continua registrado.
              </p>
              <p class="body muted">
                Vale a pena quando sua disponibilidade ou suas metas mudaram, ou quando o ritmo do
                plano não cabe mais na sua semana.
              </p>
              @if (generating()) {
                <p class="body muted">
                  Um plano novo já está sendo montado; acompanhe no alto da página.
                </p>
              } @else {
                <button
                  type="button"
                  class="sn-btn sn-btn--secondary"
                  [disabled]="panel()?.blocked() ?? false"
                  (click)="panel()?.askToReplan()"
                >
                  Gerar um plano novo
                </button>
              }
            </section>

            <p class="history">
              <a routerLink="/plano/historico">Ver o histórico de planos</a>
            </p>
          </div>
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    h1,
    .caption,
    .history {
      margin: 0;
    }
    .caption {
      color: var(--ink-muted);
    }
    .sections {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }
    .pair {
      display: grid;
      gap: var(--space-6);
    }
    .pair__side {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }
    .replan {
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
    .replan .sn-btn {
      align-self: flex-start;
      min-height: var(--target-min);
    }
    @media (min-width: 1024px) {
      .pair {
        grid-template-columns: 1fr 1fr;
        align-items: start;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanPage {
  private readonly api = inject(PlanApi);
  private readonly time = inject(AccountTimeService);
  private readonly clock = inject(GENERATION_CLOCK);

  protected readonly current = this.api.current();
  protected readonly state = computed(() =>
    currentPlanStateOf(
      this.current.hasValue() ? this.current.value() : undefined,
      this.current.error(),
    ),
  );
  protected readonly plan = computed(() => {
    const state = this.state();
    return state.kind === 'plan' ? state.plan : null;
  });
  private readonly planId = computed(() => this.plan()?.id ?? null);

  protected readonly summary = this.api.summary(this.planId);
  protected readonly sessions = this.api.sessions(this.planId);
  private readonly subjectIds = computed(() => {
    const summary = this.summaryValue();
    return summary === undefined ? null : summary.bySubject.map((share) => share.subjectId);
  });
  protected readonly catalogue = this.api.catalogue(this.subjectIds);

  protected readonly generating = signal(false);
  protected readonly panel = viewChild(PlanGenerationPanel);

  protected readonly summaryValue = computed(() =>
    this.summary.hasValue() ? this.summary.value() : undefined,
  );
  protected readonly sessionsValue = computed(() =>
    this.sessions.hasValue() ? this.sessions.value() : undefined,
  );
  protected readonly catalogueValue = computed(() =>
    this.catalogue.hasValue() ? this.catalogue.value() : undefined,
  );
  protected readonly summaryFailure = computed(() => failureOf(this.summary.error()));
  protected readonly sessionsFailure = computed(() => failureOf(this.sessions.error()));
  protected readonly catalogueFailure = computed(() => failureOf(this.catalogue.error()));

  /** Sessions and catalogue together: neither list renders an identifier while names load. */
  protected readonly listReady = computed(() => {
    const sessions = this.sessionsValue();
    const catalogue = this.catalogueValue();
    if (sessions === undefined || catalogue === undefined) {
      return null;
    }
    return { sessions, catalogue, next: nextSessionOf(sessions, this.clock()) };
  });

  protected readonly beforeCreation = computed(() => {
    const sessions = this.sessionsValue();
    const plan = this.plan();
    return sessions === undefined || plan === null
      ? 0
      : sessionsBeforeCreation(sessions, plan.createdAt);
  });

  protected readonly createdAt = computed(() => {
    const plan = this.plan();
    return plan === null ? '' : this.time.formatInstant(plan.createdAt, 'dateTime');
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? state.failure : null;
  });
  protected readonly retryAfter = computed(() => {
    const state = this.state();
    return state.kind === 'rate-limited' ? state.retryAfterSeconds : null;
  });

  /**
   * After a new plan, or anything that may have moved the plan in force: read `current` again. The
   * summary, the sessions and the catalogue follow its identifier, so a new plan reads them anew.
   */
  protected reload(): void {
    this.current.reload();
  }

  protected reloadSessions(): void {
    this.sessions.reload();
    this.catalogue.reload();
  }
}

function failureOf(error: unknown): ApiFailure | null {
  return error === undefined ? null : apiFailureOf(error);
}
