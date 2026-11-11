import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/session/session-store';
import { INCOMPLETE_TEXT } from './account-availability-page';
import { GoalsSection } from './goals-section';

/**
 * `/conta/metas`: the goals, kept current after setup — the same section as step 2 of
 * `/configurar`, in its `account` mode: revision, achievement, abandonment, and the closed goals.
 */
@Component({
  selector: 'sn-account-goals-page',
  imports: [GoalsSection, RouterLink],
  template: `
    <a class="sn-btn sn-btn--ghost back" routerLink="/conta">Voltar para Conta</a>
    <h1 class="display-md">Metas</h1>
    <p class="lead intro">
      Cada meta é uma disciplina inteira, com todos os tópicos dela. A data-alvo pesa na decisão do
      que estudar primeiro; ela não define até quando o estudo é planejado.
    </p>
    @if (incomplete()) {
      <div class="sn-alert sn-alert--info" role="note">
        <div class="sn-alert__body">{{ incompleteText }}</div>
      </div>
    }
    <sn-goals-section mode="account" target="app" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      max-width: var(--reading-max);
    }
    .back {
      align-self: flex-start;
      padding-inline: 0;
    }
    h1,
    .intro {
      margin: 0;
    }
    .intro {
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountGoalsPage {
  private readonly session = inject(SessionStore);
  protected readonly incomplete = computed(() => this.session.state()?.setupComplete === false);
  protected readonly incompleteText = INCOMPLETE_TEXT;
}
