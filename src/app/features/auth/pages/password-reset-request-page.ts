import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { ApiFailure } from '../../../core/api/api-problem';
import { PASSWORD_RESET_PATH, SIGN_IN_PATH } from '../../../core/session/gate';
import { SubmitBlock } from '../../../shared/forms/submit-block';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PasswordReset } from '../data/password-reset';
import { DevTokenNote } from '../ui/dev-token-note';

/**
 * The ONE confirmation of a reset request, for every 204. Worded so that it is true whether or not
 * the address belongs to an account, and interpolating nothing — not even the address typed — so
 * that two requests can never render differently. Do not "improve" it into a message that says an
 * account was found: the server answers the same way on purpose, and a helpful-looking sentence
 * here would turn this screen into the membership test the server refuses to be
 * (`password-reset-request-page.spec.ts` asserts the two renders are identical).
 */
export const RESET_REQUESTED_TITLE = 'Pedido recebido';
export const RESET_REQUESTED_MESSAGE =
  'Se o endereço informado for de uma conta, ele recebe uma mensagem com um código para escolher uma nova senha. A mensagem pode levar alguns minutos para chegar.';

const EMAIL_MESSAGE = 'Informe o e-mail da conta.';

/**
 * `/esqueci-senha`, public: `POST /api/v1/password-resets` with `{email}`.
 *
 * - 204 is the only success and it means nothing about the address: one confirmation, always the
 *   same (`RESET_REQUESTED_MESSAGE`), with a path to the screen that takes the code.
 * - 400 (`validation-failed`, not declared — K-D): about what was typed, on the field.
 * - 429: 5 requests per hour; the notice says how long and the submit stays disabled for it.
 * - The address is not kept after the request, nor shown back.
 */
@Component({
  selector: 'sn-password-reset-request-page',
  imports: [ReactiveFormsModule, RouterLink, DevTokenNote, ErrorState, RateLimitNotice],
  template: `
    <h1 class="display-md">Redefinir a senha</h1>

    @if (requested()) {
      <div #done class="requested" role="status" tabindex="-1">
        <div class="sn-alert sn-alert--info">
          <div>
            <div class="sn-alert__title">{{ requestedTitle }}</div>
            <div class="sn-alert__body">{{ requestedMessage }}</div>
          </div>
        </div>
      </div>
      <sn-dev-token-note kind="reset" class="dev" />
      <p class="body next">
        <a [routerLink]="resetPath">Já tenho o código</a>
      </p>
    } @else {
      <p class="lead intro">
        Informe o e-mail da conta. Se ele for de uma conta, recebe um código para escolher uma nova
        senha.
      </p>

      <form class="form" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="sn-field" [class.sn-field--invalid]="fieldError() !== null">
          <label class="sn-field__label" for="reset-email">E-mail</label>
          <input
            #field
            id="reset-email"
            class="sn-input"
            type="email"
            inputmode="email"
            autocomplete="username"
            [formControl]="email"
            [attr.aria-invalid]="fieldError() !== null ? 'true' : null"
            [attr.aria-describedby]="fieldError() !== null ? 'reset-email-error' : null"
          />
          @if (fieldError(); as text) {
            <div id="reset-email-error" class="sn-field__error">{{ text }}</div>
          }
        </div>

        <!-- Always in the document: the field's error is announced even when focus is already
             on the field, where moving focus to it would say nothing. -->
        <div class="sn-sr" role="alert" aria-atomic="true">{{ fieldError() ?? '' }}</div>

        @if (block.blocked()) {
          <sn-rate-limit-notice [retryAfterSeconds]="block.seconds() ?? null" />
        }
        @if (failure(); as problem) {
          <sn-error-state [problem]="problem" (retry)="submit()" />
        }

        <button
          type="submit"
          class="sn-btn sn-btn--primary sn-btn--block"
          [disabled]="submitting() || block.blocked()"
          [attr.aria-busy]="submitting() ? 'true' : null"
        >
          {{ submitting() ? 'Enviando…' : 'Pedir redefinição' }}
        </button>
      </form>
    }

    <p class="body elsewhere"><a [routerLink]="signInPath">Voltar para Entrar</a></p>
  `,
  styles: `
    :host {
      display: block;
    }
    h1 {
      margin: 0 0 var(--space-4);
    }
    .intro {
      margin: 0 0 var(--space-6);
      color: var(--ink-muted);
    }
    .dev {
      margin-top: var(--space-5);
    }
    .next {
      margin: var(--space-5) 0 0;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .elsewhere {
      margin: var(--space-8) 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordResetRequestPage {
  private readonly reset = inject(PasswordReset);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly done = viewChild<ElementRef<HTMLElement>>('done');

  protected readonly requestedTitle = RESET_REQUESTED_TITLE;
  protected readonly requestedMessage = RESET_REQUESTED_MESSAGE;
  protected readonly resetPath = PASSWORD_RESET_PATH;
  protected readonly signInPath = SIGN_IN_PATH;

  protected readonly email = new FormControl('', { nonNullable: true });
  protected readonly submitting = signal(false);
  protected readonly requested = signal(false);
  protected readonly fieldError = signal<string | null>(null);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly block = new SubmitBlock();

  constructor() {
    this.email.valueChanges.subscribe(() => {
      this.fieldError.set(null);
      this.block.edited();
    });
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.block.blocked()) {
      return;
    }
    this.fieldError.set(null);
    this.failure.set(null);
    const email = this.email.value.trim();
    if (email === '') {
      this.markField();
      return;
    }

    this.submitting.set(true);
    const outcome = await this.reset.request(email);
    this.submitting.set(false);
    switch (outcome.kind) {
      case 'accepted':
        // Nothing of the address stays: not in the control, not on the screen.
        this.email.reset('');
        this.requested.set(true);
        // The form is gone; focus goes to what replaced it, so it is not lost to <body>.
        setTimeout(() => this.done()?.nativeElement.focus());
        return;
      case 'invalid':
        this.markField();
        return;
      case 'rate-limited':
        this.block.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.failure.set(outcome.failure);
        return;
    }
  }

  private markField(): void {
    this.fieldError.set(EMAIL_MESSAGE);
    this.field()?.nativeElement.focus();
  }
}
