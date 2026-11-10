import { ChangeDetectionStrategy, Component } from '@angular/core';

/*
 * The two account statuses that end the application for a person. Neither is FE-5's: they state
 * the situation, and that is the whole of what this client can honestly do.
 */

const STYLES = `
  :host { display: block; }
  h1 { margin: 0 0 var(--space-4); }
  p { margin: 0; color: var(--ink-muted); }
`;

/**
 * Row 3 of the chain: `accountStatus = SUSPENDED`. Decision D4 of FE-4: the screen states the
 * situation and promises nothing. A suspension follows the withdrawal of an essential consent or
 * an erasure request, and which consents are essential is not stated by the contract (K-G), so
 * no cause and no remedy is named here. What a suspended holder may still do — withdraw an erasure
 * request, take their data — is FE-5's to offer.
 */
@Component({
  selector: 'sn-account-suspended-page',
  template: `
    <h1 class="display-md">Conta suspensa</h1>
    <p class="body">
      Esta conta está suspensa. Enquanto estiver assim, as telas de estudo, agenda e plano não ficam
      disponíveis.
    </p>
  `,
  styles: STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSuspendedPage {}

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
