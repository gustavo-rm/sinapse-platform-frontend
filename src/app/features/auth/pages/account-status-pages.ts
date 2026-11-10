import { ChangeDetectionStrategy, Component } from '@angular/core';

/*
 * The account status that ends the application for good. The suspended screen, which has things a
 * holder can still do, is `features/privacy/pages/account-suspended-page.ts` (FE-5).
 */

const STYLES = `
  :host { display: block; }
  h1 { margin: 0 0 var(--space-4); }
  p { margin: 0; color: var(--ink-muted); }
`;

/**
 * Row 2: `accountStatus = ANONYMIZED`. Terminal: the store is cleared on arrival
 * (`gateGuard('anonymized')`), and the screen offers no way back — no link, no action.
 */
@Component({
  selector: 'sn-account-closed-page',
  template: `
    <h1 class="display-md">Conta encerrada</h1>
    <p class="body">
      Os dados pessoais desta conta foram anonimizados, e ela não pode mais ser usada.
    </p>
  `,
  styles: STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountClosedPage {}
