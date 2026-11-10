import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/session/session-store';

/**
 * The "Conta" area. Only what FE-4 needs of it: the way to the password change and signing out.
 * Availability, goals, classrooms, privacy and data live here too (`docs/DESIGN_SYSTEM.md` §7),
 * and are not built yet.
 */
@Component({
  selector: 'sn-account-page',
  imports: [RouterLink],
  template: `
    <h1 class="display-md">Conta</h1>
    <ul class="actions">
      <li><a class="sn-btn sn-btn--secondary" routerLink="/conta/senha">Trocar senha</a></li>
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

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    await this.session.signOut();
    this.signingOut.set(false);
  }
}
