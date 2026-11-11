import { ChangeDetectionStrategy, Component } from '@angular/core';

/*
 * The gate screen that has no flow: guardian consent. The guard chain (`core/session/gate.ts`)
 * sends a person here; it is a heading and one sentence, and no control: a control would promise a
 * path that does not exist. Signing out stays possible from the public layout around it. No
 * operation completes a guardian's consent, and registration refuses minors in this version (K-E):
 * a dead end by necessity, and unreachable today (row 5, measured in FE-4.1).
 *
 * The setup screen (row 8) is `features/setup/pages/setup-page.ts` (FE-7).
 * The consent, reaffirmation and suspended screens are `features/privacy/pages/` (FE-5); the
 * e-mail verification screen is the public `features/auth/pages/verify-email-page.ts`.
 */

const STYLES = `
  :host { display: block; }
  h1 { margin: 0 0 var(--space-4); }
  p { margin: 0; color: var(--ink-muted); }
`;

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
