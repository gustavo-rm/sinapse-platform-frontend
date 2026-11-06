import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from '../../core/theme/theme.service';
import { ThemeSwitch } from '../../shared/ui/theme-switch/theme-switch';

/**
 * Shell of the public area: one centred column of `reading-max`, with no navigation
 * (`docs/DESIGN_SYSTEM.md` §7).
 */
@Component({
  selector: 'sn-public-layout',
  imports: [RouterOutlet, ThemeSwitch],
  template: `
    <main class="column">
      <router-outlet />
    </main>
    <footer class="column footer">
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
      padding-block: var(--space-10) var(--space-12);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayout {
  protected readonly theme = inject(ThemeService);
}
