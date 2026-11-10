import { ChangeDetectionStrategy, Component } from '@angular/core';

/*
 * The two gate screens that have no flow yet. The guard chain (`core/session/gate.ts`) sends a
 * person to each; each is a heading and one sentence, and no control: a control would promise a
 * path that does not exist. Signing out stays possible from the public layout around them.
 *
 * - guardian consent: no operation completes it, and registration refuses minors in this version
 *   (K-E). A dead end by necessity, and unreachable today (row 5, measured in FE-4.1);
 * - setup: `POST /api/v1/availability` and `POST /api/v1/goals` — FE-7.
 *
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

/** Row 8: `setupComplete` false. FE-7. */
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
