import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SessionStore } from '../../core/session/session-store';
import { ThemeService } from '../../core/theme/theme.service';
import { ThemeSwitch } from '../../shared/ui/theme-switch/theme-switch';

/**
 * Shell of the public area: one centred column of `reading-max`, with no navigation
 * (`docs/DESIGN_SYSTEM.md` §7).
 *
 * It also holds the screens the guard chain sends a signed-in person to instead of the
 * application — a suspended account, the placeholders of FE-5. Those screens carry no control of
 * their own, so the layout offers "Sair" while a session is open: nobody is held on a screen they
 * cannot leave.
 */
@Component({
  selector: 'sn-public-layout',
  imports: [RouterOutlet, ThemeSwitch],
  template: `
    <main class="column">
      <router-outlet />
    </main>
    <footer class="column footer">
      @if (session.isSignedIn()) {
        <button
          type="button"
          class="sn-btn sn-btn--secondary sign-out"
          [disabled]="signingOut()"
          (click)="signOut()"
        >
          Sair
        </button>
      }
      <sn-theme-switch [value]="theme.choice()" (changed)="theme.choose($event)" />
    </footer>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
    .column {
      display: block;
      max-width: var(--reading-max);
      margin-inline: auto;
      padding: var(--space-12) var(--space-4) 0;
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
      padding-block: var(--space-10) var(--space-12);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayout {
  protected readonly theme = inject(ThemeService);
  protected readonly session = inject(SessionStore);
  protected readonly signingOut = signal(false);

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    await this.session.signOut();
    this.signingOut.set(false);
  }
}
