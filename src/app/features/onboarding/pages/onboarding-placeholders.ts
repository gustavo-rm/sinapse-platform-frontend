import { ChangeDetectionStrategy, Component } from '@angular/core';

/*
 * PLACEHOLDERS, FE-5's. The guard chain (`core/session/gate.ts`) sends a person to each of these
 * screens; the flow behind each is built in FE-5, and nothing here anticipates it. Each is a
 * heading and one sentence, and no control: a control would promise a path that does not exist
 * yet. Signing out stays possible from the public layout around them.
 *
 * What exists behind them in the backend (snapshot of `sinapse-platform@46b5b3c`):
 * - verify e-mail: `POST /api/v1/email-verifications` consumes a token; no operation re-sends it (K-F);
 * - guardian consent: no operation completes it, and registration refuses minors in this version (K-E);
 * - reaffirmation: `POST /api/v1/consents/reaffirmation`;
 * - pending consents: `GET /api/v1/terms` and `POST /api/v1/consents`;
 * - setup: `POST /api/v1/availability` and `POST /api/v1/goals`.
 */

const STYLES = `
  :host { display: block; }
  h1 { margin: 0 0 var(--space-4); }
  p { margin: 0; color: var(--ink-muted); }
`;

/** FE-5. Row 4 of the chain: `accountStatus = PENDING_VERIFICATION`. */
@Component({
  selector: 'sn-verify-email-page',
  template: `
    <h1 class="display-md">Confirme seu e-mail</h1>
    <p class="body">Esta conta aguarda a confirmação do endereço de e-mail.</p>
  `,
  styles: STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage {}

/**
 * FE-5. Row 5: `accountStatus = PENDING_GUARDIAN_CONSENT`. A dead end by necessity: no backend
 * operation completes a guardian's consent (K-E), so this screen says so and promises nothing.
 */
@Component({
  selector: 'sn-guardian-consent-page',
  template: `
    <h1 class="display-md">Consentimento do responsável</h1>
    <p class="body">
      Esta conta aguarda o consentimento de um responsável, e esse passo ainda não está disponível
      nesta versão.
    </p>
  `,
  styles: STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuardianConsentPage {}

/** FE-5. Row 6: `requiresMajorityReaffirmation`. */
@Component({
  selector: 'sn-reaffirmation-page',
  template: `
    <h1 class="display-md">Reafirme seu consentimento</h1>
    <p class="body">
      O consentimento desta conta foi dado por um responsável e agora precisa ser reafirmado em seu
      próprio nome.
    </p>
  `,
  styles: STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaffirmationPage {}

/** FE-5. Row 7: `pendingConsents` not empty. */
@Component({
  selector: 'sn-pending-consents-page',
  template: `
    <h1 class="display-md">Consentimentos pendentes</h1>
    <p class="body">Há consentimentos desta conta que ainda precisam de uma resposta sua.</p>
  `,
  styles: STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingConsentsPage {}

/** FE-5. Row 8: `setupComplete` false. */
@Component({
  selector: 'sn-setup-page',
  template: `
    <h1 class="display-md">Configure seus estudos</h1>
    <p class="body">Falta dizer quando você estuda e o que você quer vencer.</p>
  `,
  styles: STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupPage {}
