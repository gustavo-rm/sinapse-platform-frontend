import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/session/session-store';

/**
 * The "Conta" area: availability and goals (FE-7), the password change, the consents (FE-5), the
 * reaffirmation while it is owed and was deferred, and signing out.
 * Classrooms, privacy and data live here too (`docs/DESIGN_SYSTEM.md` §7), and are not built yet.
 */
@Component({
  selector: 'sn-account-page',
  imports: [RouterLink],
  template: `
    <h1 class="display-md">Conta</h1>
    <ul class="actions">
      <li>
        <a class="sn-btn sn-btn--secondary" routerLink="/conta/disponibilidade">Disponibilidade</a>
      </li>
      <li><a class="sn-btn sn-btn--secondary" routerLink="/conta/metas">Metas</a></li>
      <li><a class="sn-btn sn-btn--secondary" routerLink="/conta/senha">Trocar senha</a></li>
      <li>
        <a class="sn-btn sn-btn--secondary" routerLink="/conta/consentimentos">Consentimentos</a>
      </li>
      @if (reaffirmationOwed()) {
        <li>
          <a class="sn-btn sn-btn--secondary" routerLink="/reafirmar-consentimento">
            Reafirmar consentimento
          </a>
        </li>
      }
      <li>
        <button
          type="button"
          class="sn-btn sn-btn--secondary"
          [disabled]="signingOut()"
          (click)="signOut()"
        >
          Sair
        </button>
      </li>
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    h1 {
      margin: 0 0 var(--space-6);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  private readonly session = inject(SessionStore);
  protected readonly signingOut = signal(false);
  /** A reaffirmation the person deferred (backend ADR 0004: the account is not blocked meanwhile). */
  protected readonly reaffirmationOwed = computed(() => {
    const state = this.session.state();
    return state?.accountStatus === 'ACTIVE' && state.requiresMajorityReaffirmation;
  });

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    await this.session.signOut();
    this.signingOut.set(false);
  }
}
