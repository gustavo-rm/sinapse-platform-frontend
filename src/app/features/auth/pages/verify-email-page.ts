import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  type OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import type { ApiFailure } from '../../../core/api/api-problem';
import { SIGN_IN_PATH } from '../../../core/session/gate';
import { SessionStore } from '../../../core/session/session-store';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { EmailVerification } from '../data/email-verification';
import { DevTokenNote } from '../ui/dev-token-note';
import { REGISTERED_STATE_KEY } from '../model/registration-outcome';
import { TOKEN_PARAM, takeTokenFromUrl } from './single-use-token';

/**
 * The query parameter that carries the token: `/verificar-email?token=<token>`. This path and this
 * parameter are the CONTRACT the backend needs to build the link of its verification e-mail —
 * its own documentation says it does not know the frontend's address nor its verification route
 * (F18). Recorded in `docs/ai/CONTEXT.md`. The same parameter as the reset link's (FE-6).
 */
export const VERIFICATION_TOKEN_PARAM = TOKEN_PARAM;

export const NOT_ACCEPTED_MESSAGE =
  'Este código de confirmação não foi aceito. Ele pode ter expirado, já ter sido usado ou estar incompleto. Nesta versão não há como pedir um novo código por aqui.';
const EMPTY_MESSAGE = 'Cole o código de confirmação que você recebeu.';

/**
 * `/verificar-email`, a PUBLIC route, not a gate screen: an account that is not verified cannot
 * sign in (`POST /api/v1/sessions` refuses it, FE-4.1), so this screen can never be behind a
 * session. `POST /api/v1/email-verifications` with `{token}`.
 *
 * - With `?token=` in the URL: the token is taken from it and the URL is replaced AT ONCE, before
 *   the request, by a navigation with `replaceUrl` — so the credential is not left in the address
 *   bar or in the history entry, whatever the answer. Then it is consumed.
 * - Without one: a field to paste it. There is no e-mail transport in this version (the backend's
 *   `LoggingAccountNotifier` discards the message; under `local` only, the token is written to the
 *   server console marked DEV ONLY), so pasting is the path that works today, and it stays useful
 *   when a mail client mangles a link.
 * - The token is never logged, put in a message, the title or any storage, and is not rendered:
 *   a token from the URL is never copied into the field (`no-leak.spec.ts`).
 * - 204: the person is sent to sign in, and the sign-in screen says the address was confirmed.
 * - 404 (unknown, expired or already used, deliberately conflated): one message, no guess.
 * - 429: the wait is told, and the submit stays disabled for it (C6).
 */
@Component({
  selector: 'sn-verify-email-page',
  imports: [ReactiveFormsModule, DevTokenNote, ErrorState, RateLimitNotice],
  template: `
    <h1 class="display-md">Confirme seu e-mail</h1>
    @if (registered) {
      <!-- The handoff from /criar-conta (FE-6): what happened, and what has to happen next. -->
      <div class="sn-alert sn-alert--success registered" role="status">
        <div>
          <div class="sn-alert__title">Conta criada.</div>
          <div class="sn-alert__body">
            Falta confirmar o endereço de e-mail: a conta só fica ativa depois disso, e até lá não é
            possível entrar. Use o código de confirmação enviado para o endereço informado.
          </div>
        </div>
      </div>
    }
    <p class="lead intro">
      Para ativar a conta, confirme o endereço de e-mail com o código que você recebeu.
    </p>
    <sn-dev-token-note kind="verification" class="dev" />

    <!-- Always in the document, so the wait of a link's code is announced. -->
    <div class="status" role="status" aria-atomic="true">
      @if (submitting()) {
        <p class="body">Confirmando seu e-mail…</p>
      }
    </div>

    <form class="form" (submit)="$event.preventDefault(); submit()" novalidate>
      <div class="sn-field" [class.sn-field--invalid]="fieldError() !== null">
        <label class="sn-field__label" for="verification-token">Código de confirmação</label>
        <input
          #field
          id="verification-token"
          class="sn-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          [formControl]="token"
          [attr.aria-invalid]="fieldError() !== null ? 'true' : null"
          [attr.aria-describedby]="
            fieldError() !== null ? 'verification-token-error' : 'verification-token-hint'
          "
        />
        @if (fieldError(); as text) {
          <div id="verification-token-error" class="sn-field__error">{{ text }}</div>
        } @else {
          <div id="verification-token-hint" class="sn-field__hint">
            Se o link da mensagem não abrir esta página já confirmando, copie o código dela e cole
            aqui.
          </div>
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

      @if (waitSeconds() !== undefined) {
        <sn-rate-limit-notice [retryAfterSeconds]="waitSeconds() ?? null" />
      }
      @if (failure(); as problem) {
        <sn-error-state [problem]="problem" (retry)="submit()" />
      }

      <button
        type="submit"
        class="sn-btn sn-btn--primary sn-btn--block"
        [disabled]="submitting() || waitSeconds() !== undefined"
        [attr.aria-busy]="submitting() ? 'true' : null"
      >
        Confirmar e-mail
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
    .registered,
    .dev {
      margin-bottom: var(--space-6);
    }
    .status:empty,
    .announce:empty {
      display: none;
    }
    .status p {
      margin: 0 0 var(--space-5);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage implements OnInit {
  private readonly verification = inject(EmailVerification);
  private readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  /**
   * Arrived from `/criar-conta` with a 201 (FE-6): the navigation state says so, nothing else. Read
   * from the navigation under way, or — after a reload — from the history entry that kept it.
   */
  protected readonly registered = [
    this.router.currentNavigation()?.extras.state,
    inject(Location).getState(),
  ].some(
    (state) =>
      (state as Record<string, unknown> | null | undefined)?.[REGISTERED_STATE_KEY] === true,
  );

  protected readonly token = new FormControl('', { nonNullable: true });
  protected readonly submitting = signal(false);
  protected readonly fieldError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly waitSeconds = signal<number | null | undefined>(undefined);
  private unblockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.unblockTimer));
    this.token.valueChanges.subscribe(() => {
      this.fieldError.set(null);
      if (this.waitSeconds() === null) {
        this.waitSeconds.set(undefined);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    // Out of the address bar and the history entry first, whatever happens next.
    const token = await takeTokenFromUrl(this.router, this.route);
    if (token === null) {
      return;
    }
    if (token !== '') {
      await this.consume(token, 'link');
    } else {
      this.formError.set(NOT_ACCEPTED_MESSAGE);
    }
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.waitSeconds() !== undefined) {
      return;
    }
    const token = this.token.value.trim();
    if (token === '') {
      this.reset();
      this.fieldError.set(EMPTY_MESSAGE);
      this.field().nativeElement.focus();
      return;
    }
    await this.consume(token, 'field');
  }

  private async consume(token: string, from: 'link' | 'field'): Promise<void> {
    this.reset();
    this.submitting.set(true);
    const outcome = await this.verification.submit(token);
    this.submitting.set(false);
    switch (outcome.kind) {
      case 'verified':
        this.token.reset('');
        this.store.announce('email-verified');
        await this.router.navigateByUrl(SIGN_IN_PATH, { replaceUrl: true });
        return;
      case 'not-accepted':
      case 'invalid':
        if (from === 'field') {
          this.fieldError.set(NOT_ACCEPTED_MESSAGE);
          this.field().nativeElement.focus();
        } else {
          this.formError.set(NOT_ACCEPTED_MESSAGE);
        }
        return;
      case 'rate-limited':
        this.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.failure.set(outcome.failure);
        return;
    }
  }

  private reset(): void {
    this.fieldError.set(null);
    this.formError.set(null);
    this.failure.set(null);
  }

  private block(seconds: number | null): void {
    this.waitSeconds.set(seconds);
    clearTimeout(this.unblockTimer);
    if (seconds !== null) {
      this.unblockTimer = setTimeout(() => this.waitSeconds.set(undefined), seconds * 1000);
    }
  }
}
