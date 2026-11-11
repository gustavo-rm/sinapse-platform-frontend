import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  type OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { ApiFailure } from '../../../core/api/api-problem';
import { PASSWORD_RESET_REQUEST_PATH } from '../../../core/session/gate';
import { SessionStore } from '../../../core/session/session-store';
import { SubmitBlock } from '../../../shared/forms/submit-block';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PasswordReset } from '../data/password-reset';
import type { ResetConfirmationField } from '../model/password-reset-outcome';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../model/registration-outcome';
import { DevTokenNote } from '../ui/dev-token-note';
import { takeTokenFromUrl } from './single-use-token';

/** 404, unknown, expired or already used, conflated by the server: one message, no guess. */
export const RESET_NOT_ACCEPTED_MESSAGE =
  'Este código de redefinição não foi aceito. Ele pode ter expirado, já ter sido usado ou estar incompleto. Você pode pedir um novo.';

const MESSAGES = {
  tokenEmpty: 'Cole o código de redefinição que você recebeu.',
  newPassword: `A nova senha precisa ter de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.`,
  formLevel: 'Os dados enviados não foram aceitos. Confira os campos e tente de novo.',
} as const;

/**
 * `/redefinir-senha`, public: `POST /api/v1/password-resets/confirmation` with
 * `{token, newPassword}`. This path and its `token` query parameter are the CONTRACT the backend
 * needs for the link of its reset e-mail (`docs/ai/CONTEXT.md`).
 *
 * Mirrors `/verificar-email` (FE-5), with the same token handling (`takeTokenFromUrl`):
 *
 * - With `?token=`: the token is taken and the URL is REPLACED at once, before anything else. It
 *   cannot be consumed on arrival — a new password is needed — so it is held in memory, in a
 *   private field: never in a form control, the page, the title, a log or any storage. The field
 *   for a token is not shown while one is held.
 * - Without one, or after a held token was refused: a field to paste it, which is today the path
 *   that works (the token is in the server console only, under `local`).
 * - The new password's policy (12 to 256 characters) is stated before the person types.
 * - 204 ends EVERY session of the account, in the same transaction. Whatever this browser held is
 *   cleared locally at once (`SessionStore.end`, as after a password change — no 401 is awaited),
 *   and the person goes to sign in, told what happened. The public guard keeps a signed-in person
 *   from landing here, but another tab may have signed in since.
 * - 404: one message, and the way to ask for a new code. 429: 10 per 5 minutes, the wait told.
 */
@Component({
  selector: 'sn-password-reset-page',
  imports: [ReactiveFormsModule, RouterLink, DevTokenNote, ErrorState, RateLimitNotice],
  template: `
    <h1 class="display-md">Escolha uma nova senha</h1>
    <p class="lead intro">
      Ao redefinir a senha, todas as sessões abertas desta conta são encerradas, em qualquer
      aparelho.
    </p>

    <!-- Always in the document, so the arrival of a link's code is announced. -->
    <div class="status" role="status" aria-atomic="true">
      @if (holdsLinkToken()) {
        <p class="body">O código do link foi recebido. Agora escolha a nova senha.</p>
      }
    </div>

    @if (!holdsLinkToken()) {
      <sn-dev-token-note kind="reset" class="dev" />
    }

    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (!holdsLinkToken()) {
        <div class="sn-field" [class.sn-field--invalid]="errorOf('token') !== null">
          <label class="sn-field__label" for="reset-token">Código de redefinição</label>
          <input
            #token
            id="reset-token"
            class="sn-input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            formControlName="token"
            [attr.aria-invalid]="errorOf('token') !== null ? 'true' : null"
            [attr.aria-describedby]="
              errorOf('token') !== null ? 'reset-token-error' : 'reset-token-hint'
            "
          />
          @if (errorOf('token'); as text) {
            <div id="reset-token-error" class="sn-field__error">{{ text }}</div>
          } @else {
            <div id="reset-token-hint" class="sn-field__hint">
              Se o link da mensagem não abrir esta página com o código, copie o código dela e cole
              aqui.
            </div>
          }
        </div>
      }

      <div class="sn-field" [class.sn-field--invalid]="errorOf('newPassword') !== null">
        <label class="sn-field__label" for="reset-new-password">Nova senha</label>
        <input
          #password
          id="reset-new-password"
          class="sn-input"
          type="password"
          autocomplete="new-password"
          formControlName="newPassword"
          [attr.aria-invalid]="errorOf('newPassword') !== null ? 'true' : null"
          [attr.aria-describedby]="
            errorOf('newPassword') !== null
              ? 'reset-new-password-hint reset-new-password-error'
              : 'reset-new-password-hint'
          "
        />
        <div id="reset-new-password-hint" class="sn-field__hint">
          De {{ minLength }} a {{ maxLength }} caracteres.
        </div>
        @if (errorOf('newPassword'); as text) {
          <div id="reset-new-password-error" class="sn-field__error">{{ text }}</div>
        }
      </div>

      <!-- Always in the document, so a message put in it is announced. -->
      <div class="announce" role="alert" aria-atomic="true">
        @if (formError(); as text) {
          <div class="sn-alert sn-alert--error">
            <div class="sn-alert__body">{{ text }}</div>
          </div>
        }
      </div>
      @if (offerNewRequest()) {
        <p class="body again"><a [routerLink]="requestPath">Pedir um novo código</a></p>
      }

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
        {{ submitting() ? 'Redefinindo…' : 'Redefinir senha' }}
      </button>
    </form>
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
    .status:empty,
    .announce:empty {
      display: none;
    }
    .status p {
      margin: 0 0 var(--space-5);
    }
    .dev {
      margin-bottom: var(--space-6);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .again {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordResetPage implements OnInit {
  private readonly reset = inject(PasswordReset);
  private readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly tokenInput = viewChild<ElementRef<HTMLInputElement>>('token');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('password');

  protected readonly minLength = PASSWORD_MIN_LENGTH;
  protected readonly maxLength = PASSWORD_MAX_LENGTH;
  protected readonly requestPath = PASSWORD_RESET_REQUEST_PATH;

  protected readonly form = new FormGroup({
    token: new FormControl('', { nonNullable: true }),
    newPassword: new FormControl('', { nonNullable: true }),
  });

  /** The token of the link, in memory only, until it is used or refused. */
  private linkToken: string | null = null;
  protected readonly holdsLinkToken = signal(false);

  protected readonly submitting = signal(false);
  private readonly fieldErrors = signal<ReadonlyMap<ResetConfirmationField, string>>(new Map());
  protected readonly formError = signal<string | null>(null);
  protected readonly offerNewRequest = signal(false);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly block = new SubmitBlock();

  constructor() {
    this.form.valueChanges.subscribe(() => this.block.edited());
  }

  async ngOnInit(): Promise<void> {
    // Out of the address bar and the history entry first, whatever happens next.
    const token = await takeTokenFromUrl(this.router, this.route);
    if (token === null) {
      return;
    }
    if (token === '') {
      this.refuseToken('form');
      return;
    }
    this.linkToken = token;
    this.holdsLinkToken.set(true);
  }

  protected errorOf(field: ResetConfirmationField): string | null {
    return this.fieldErrors().get(field) ?? null;
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.block.blocked()) {
      return;
    }
    this.clearMessages();
    const value = this.form.getRawValue();
    const token = this.linkToken ?? value.token.trim();

    const local = new Map<ResetConfirmationField, string>();
    if (token === '') {
      local.set('token', MESSAGES.tokenEmpty);
    }
    if (
      value.newPassword.length < PASSWORD_MIN_LENGTH ||
      value.newPassword.length > PASSWORD_MAX_LENGTH
    ) {
      local.set('newPassword', MESSAGES.newPassword);
    }
    if (local.size > 0) {
      this.fieldErrors.set(local);
      this.focusFirst(local);
      return;
    }

    this.submitting.set(true);
    const outcome = await this.reset.confirm(token, value.newPassword);
    this.submitting.set(false);
    switch (outcome.kind) {
      case 'reset':
        this.linkToken = null;
        this.form.reset();
        // Every session of the account ended with the 204: clear this browser's now.
        this.store.end('password-reset');
        return;
      case 'not-accepted':
        this.refuseToken(this.linkToken !== null ? 'form' : 'field');
        return;
      case 'invalid': {
        if (outcome.fields.has('token')) {
          this.refuseToken(this.linkToken !== null ? 'form' : 'field');
        }
        if (outcome.fields.has('newPassword')) {
          this.fieldErrors.set(
            new Map([...this.fieldErrors(), ['newPassword', MESSAGES.newPassword]]),
          );
          if (!outcome.fields.has('token')) {
            this.passwordInput()?.nativeElement.focus();
          }
        }
        if (outcome.formLevel && outcome.fields.size === 0) {
          this.formError.set(MESSAGES.formLevel);
        }
        return;
      }
      case 'rate-limited':
        this.block.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.failure.set(outcome.failure);
        return;
    }
  }

  /**
   * The token was refused. A held one is dropped and the field to paste another appears, with the
   * message on the form; a pasted one gets the message on its field, and focus.
   */
  private refuseToken(where: 'form' | 'field'): void {
    this.linkToken = null;
    this.holdsLinkToken.set(false);
    this.offerNewRequest.set(true);
    if (where === 'form') {
      this.formError.set(RESET_NOT_ACCEPTED_MESSAGE);
      return;
    }
    this.fieldErrors.set(new Map([['token', RESET_NOT_ACCEPTED_MESSAGE]]));
    this.formError.set(null);
    setTimeout(() => this.tokenInput()?.nativeElement.focus());
  }

  private clearMessages(): void {
    this.fieldErrors.set(new Map());
    this.formError.set(null);
    this.offerNewRequest.set(false);
    this.failure.set(null);
  }

  private focusFirst(errors: ReadonlyMap<ResetConfirmationField, string>): void {
    if (errors.has('token')) {
      this.tokenInput()?.nativeElement.focus();
    } else if (errors.has('newPassword')) {
      this.passwordInput()?.nativeElement.focus();
    }
  }
}
