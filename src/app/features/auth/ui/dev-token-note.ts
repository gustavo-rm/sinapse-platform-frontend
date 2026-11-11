import { ChangeDetectionStrategy, Component, input, isDevMode } from '@angular/core';

/**
 * DEVELOPMENT ONLY: where a single-use token is today. This version has no e-mail transport — the
 * backend's `LoggingAccountNotifier` records that there was a message and discards it — and under
 * its `local` profile only, `DevOnlyLoggingAccountNotifier` writes the token to the SERVER console,
 * marked `DEV ONLY`. So a token reaches a person only by reading that console, and a developer
 * walking the flow needs to be told so. Rendered only by a development build (`isDevMode()`); a
 * production build shows nothing.
 */
@Component({
  selector: 'sn-dev-token-note',
  template: `
    @if (dev) {
      <div class="sn-alert sn-alert--info" role="note">
        <div class="sn-alert__body">
          <strong>Ambiente de desenvolvimento.</strong> Esta versão ainda não envia e-mail. O código
          {{ subject[kind()] }} aparece no console do servidor, numa linha marcada
          <code>DEV ONLY</code>: copie o valor de <code>token</code> e cole-o abaixo.
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    :host:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevTokenNote {
  readonly kind = input.required<'verification' | 'reset'>();
  protected readonly dev = isDevMode();
  protected readonly subject = {
    verification: 'de confirmação de e-mail',
    reset: 'de redefinição de senha',
  } as const;
}
