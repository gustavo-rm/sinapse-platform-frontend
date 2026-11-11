import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/session/session-store';
import { AvailabilitySection } from './availability-section';

/**
 * `/conta/disponibilidade`: the routine, kept current after setup. The same section as step 1 of
 * `/configurar` — one component, not a second copy.
 *
 * After a write the person stays here and sees what they did; `/me/state` is read again, and if the
 * server now says setup is incomplete (the last window in force closed), the screen says so in
 * words, and the guard chain sends them to `/configurar` at their next navigation. This screen
 * decides nothing about setup itself.
 */
@Component({
  selector: 'sn-account-availability-page',
  imports: [AvailabilitySection, RouterLink],
  template: `
    <a class="sn-btn sn-btn--ghost back" routerLink="/conta">Voltar para Conta</a>
    <h1 class="display-md">Disponibilidade</h1>
    <p class="lead intro">
      Os horários da semana em que você costuma estudar. Para mudar um horário, encerre a janela e
      declare outra: a anterior continua registrada, porque o que foi planejado antes foi feito com
      ela.
    </p>
    @if (incomplete()) {
      <div class="sn-alert sn-alert--info" role="note">
        <div class="sn-alert__body">{{ incompleteText }}</div>
      </div>
    }
    <sn-availability-section target="app" />
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
export class AccountAvailabilityPage {
  private readonly session = inject(SessionStore);
  /** The server's word, after the last read of `/me/state`. */
  protected readonly incomplete = computed(() => this.session.state()?.setupComplete === false);
  protected readonly incompleteText = INCOMPLETE_TEXT;
}

/** Said on both account screens when the server reports setup incomplete. */
export const INCOMPLETE_TEXT =
  'Neste momento a configuração não está completa: é preciso ao menos uma janela que valha nas próximas semanas e ao menos uma meta ativa. Ao sair desta tela, o SINAPSE pede o que falta.';
