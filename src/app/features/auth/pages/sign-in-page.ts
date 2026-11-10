import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import type { ApiFailure } from '../../../core/api/api-problem';
import { SessionStore } from '../../../core/session/session-store';
import { SIGN_IN_NOTICE_LABELS } from '../../../shared/labels/sign-in-notice.labels';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { SignIn } from '../data/sign-in';
import type { SignInField } from '../model/sign-in-outcome';

/** The one message for every refused credential. It names neither field, by design. */
export const REFUSED_MESSAGE =
  'Não foi possível entrar com esse e-mail e essa senha. Confira os dois e tente de novo.';

/** Field messages, written here: the server's `errors[].message` is English and never shown. */
const FIELD_MESSAGES = {
  email: 'Informe o e-mail da conta.',
  password: 'Confira a senha. Ela tem no máximo 256 caracteres.',
} as const satisfies { readonly email: string; readonly password: string };

const FORM_LEVEL_INVALID =
  'Os dados enviados não foram aceitos. Confira os campos e tente de novo.';

/**
 * The sign-in screen, `/entrar`: `POST /api/v1/sessions` with `LoginRequest`.
 *
 * - Every 401 gets the same message, which reveals nothing about which part was wrong.
 * - `validation-failed` points at each field it names (decision D3: handled although the
 *   snapshot declares no 400 here, K-D).
 * - `rate-limit-exceeded` shows `RateLimitNotice`, and the submit stays disabled for the wait:
 *   there is no control that retries.
 * - Any other failure shows `ErrorState`, by type or reason.
 *
 * The client-side checks are the contract's and nothing more: `email` has `minLength: 1`,
 * `password` has `maxLength: 256` (and `minLength: 0`, so an empty password is the server's to
 * refuse, not this form's). The password is never logged, never in a URL — the form submits by
 * script and Angular cancels the native submission — and never echoed in a message; the form is
 * emptied once the sign-in succeeds.
 */
@Component({
  selector: 'sn-sign-in-page',
  imports: [ReactiveFormsModule, ErrorState, RateLimitNotice],
  template: `
    <h1 class="display-lg">Entrar</h1>

    <!-- Always in the document, so a notice that appears after an attempt is announced. -->
    <div class="notice-region" role="status" aria-atomic="true">
      @if (notice(); as text) {
        <div class="sn-alert sn-alert--info notice">
          <div class="sn-alert__body">{{ text }}</div>
        </div>
      }
    </div>

    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="sn-field" [class.sn-field--invalid]="invalid('email')">
        <label class="sn-field__label" for="sign-in-email">E-mail</label>
        <input
          #email
          id="sign-in-email"
          class="sn-input"
          type="email"
          inputmode="email"
          autocomplete="username"
          formControlName="email"
          [attr.aria-invalid]="invalid('email') ? 'true' : null"
          [attr.aria-describedby]="invalid('email') ? 'sign-in-email-error' : null"
        />
        @if (invalid('email')) {
          <div id="sign-in-email-error" class="sn-field__error">{{ messages.email }}</div>
        }
      </div>

      <div class="sn-field" [class.sn-field--invalid]="invalid('password')">
        <label class="sn-field__label" for="sign-in-password">Senha</label>
        <input
          #password
          id="sign-in-password"
          class="sn-input"
          type="password"
          autocomplete="current-password"
          formControlName="password"
          [attr.aria-invalid]="invalid('password') ? 'true' : null"
          [attr.aria-describedby]="invalid('password') ? 'sign-in-password-error' : null"
        />
        @if (invalid('password')) {
          <div id="sign-in-password-error" class="sn-field__error">{{ messages.password }}</div>
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
      >
        {{ submitting() ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    h1 {
      margin: 0 0 var(--space-6);
    }
    .notice {
      margin-bottom: var(--space-6);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .announce:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInPage {
  private readonly signIn = inject(SignIn);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('email');
  private readonly passwordInput = viewChild.required<ElementRef<HTMLInputElement>>('password');

  protected readonly messages = FIELD_MESSAGES;
  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.minLength(1), Validators.required],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(256)] }),
  });

  protected readonly submitting = signal(false);
  /** Fields the last attempt found wrong, on this side or the server's. */
  private readonly invalidFields = signal<ReadonlySet<SignInField>>(new Set());
  protected readonly formError = signal<string | null>(null);
  protected readonly failure = signal<ApiFailure | null>(null);
  /** While rate-limited: the server's wait in seconds, or null when it gave none. */
  protected readonly waitSeconds = signal<number | null | undefined>(undefined);
  protected readonly notice = computed(() => {
    const notice = this.session.notice();
    return notice === null ? null : SIGN_IN_NOTICE_LABELS[notice];
  });

  private unblockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.unblockTimer));
    // Without a wait from the server, the block lifts when the person changes what they typed.
    this.form.valueChanges.subscribe(() => {
      if (this.waitSeconds() === null) {
        this.waitSeconds.set(undefined);
      }
    });
  }

  protected invalid(field: SignInField): boolean {
    return this.invalidFields().has(field);
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.waitSeconds() !== undefined) {
      return;
    }
    this.reset();
    const local = (['email', 'password'] as const).filter(
      (field) => this.form.controls[field].invalid,
    );
    if (local.length > 0) {
      this.showInvalid(new Set(local), false);
      return;
    }

    this.submitting.set(true);
    const result = await this.signIn.submit(this.form.getRawValue());
    this.submitting.set(false);

    switch (result.kind) {
      case 'signed-in':
        this.form.reset();
        await this.router.navigateByUrl(result.destination);
        return;
      case 'not-established':
        // The store's notice, in the status region above, says what happened. Nothing to retry.
        this.form.controls.password.reset('');
        return;
      case 'refused':
        this.formError.set(REFUSED_MESSAGE);
        this.passwordInput().nativeElement.focus();
        return;
      case 'invalid':
        this.showInvalid(result.fields, result.formLevel);
        return;
      case 'rate-limited':
        this.block(result.retryAfterSeconds);
        return;
      case 'failed':
        this.failure.set(result.failure);
        return;
    }
  }

  private reset(): void {
    this.invalidFields.set(new Set());
    this.formError.set(null);
    this.failure.set(null);
  }

  private showInvalid(fields: ReadonlySet<SignInField>, formLevel: boolean): void {
    this.invalidFields.set(fields);
    this.formError.set(formLevel || fields.size === 0 ? FORM_LEVEL_INVALID : null);
    if (fields.has('email')) {
      this.emailInput().nativeElement.focus();
    } else if (fields.has('password')) {
      this.passwordInput().nativeElement.focus();
    }
  }

  private block(seconds: number | null): void {
    this.waitSeconds.set(seconds);
    clearTimeout(this.unblockTimer);
    if (seconds !== null) {
      this.unblockTimer = setTimeout(() => this.waitSeconds.set(undefined), seconds * 1000);
    }
  }
}
