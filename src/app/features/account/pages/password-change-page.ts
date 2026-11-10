import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import type { ApiFailure } from '../../../core/api/api-problem';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PasswordChange } from '../data/password-change';
import type { PasswordField } from '../model/password-change-outcome';

const WRONG_CURRENT = 'A senha atual não confere.';
const FIELD_MESSAGES = {
  currentPassword: 'Confira a senha atual. Ela tem no máximo 256 caracteres.',
  newPassword: 'A nova senha precisa ter de 12 a 256 caracteres.',
} as const satisfies { readonly currentPassword: string; readonly newPassword: string };
const FORM_LEVEL_INVALID =
  'Os dados enviados não foram aceitos. Confira os campos e tente de novo.';

/**
 * Changing the password, `/conta/senha`. Minimal on purpose: the rest of the account area is not
 * built yet. On success the session ends here and the person signs in again; a 401 is resolved by
 * the probe of decision D2 (`PasswordChange`).
 *
 * Client-side checks are the contract's: `currentPassword` `maxLength: 256`; `newPassword`
 * `minLength: 12`, `maxLength: 256`. No password is logged, put in a URL or echoed.
 */
@Component({
  selector: 'sn-password-change-page',
  imports: [ReactiveFormsModule, ErrorState, RateLimitNotice],
  template: `
    <h1 class="display-md">Trocar senha</h1>
    <p class="body lead-in">Ao trocar a senha, todas as sessões desta conta são encerradas.</p>

    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="sn-field" [class.sn-field--invalid]="errorOf('currentPassword')">
        <label class="sn-field__label" for="current-password">Senha atual</label>
        <input
          #current
          id="current-password"
          class="sn-input"
          type="password"
          autocomplete="current-password"
          formControlName="currentPassword"
          [attr.aria-invalid]="errorOf('currentPassword') ? 'true' : null"
          [attr.aria-describedby]="errorOf('currentPassword') ? 'current-password-error' : null"
        />
        @if (errorOf('currentPassword'); as text) {
          <div id="current-password-error" class="sn-field__error">{{ text }}</div>
        }
      </div>

      <div class="sn-field" [class.sn-field--invalid]="errorOf('newPassword')">
        <label class="sn-field__label" for="new-password">Nova senha</label>
        <input
          #fresh
          id="new-password"
          class="sn-input"
          type="password"
          autocomplete="new-password"
          formControlName="newPassword"
          [attr.aria-invalid]="errorOf('newPassword') ? 'true' : null"
          [attr.aria-describedby]="
            errorOf('newPassword') ? 'new-password-hint new-password-error' : 'new-password-hint'
          "
        />
        <div id="new-password-hint" class="sn-field__hint">De 12 a 256 caracteres.</div>
        @if (errorOf('newPassword'); as text) {
          <div id="new-password-error" class="sn-field__error">{{ text }}</div>
        }
      </div>

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
        <sn-error-state
          [problem]="problem"
          description="A senha não foi trocada, e a sessão continua aberta."
          (retry)="submit()"
        />
      }

      <button
        type="submit"
        class="sn-btn sn-btn--primary"
        [disabled]="submitting() || waitSeconds() !== undefined"
      >
        {{ submitting() ? 'Trocando…' : 'Trocar senha' }}
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
      max-width: var(--reading-max);
    }
    h1 {
      margin: 0 0 var(--space-2);
    }
    .lead-in {
      margin: 0 0 var(--space-6);
      color: var(--ink-muted);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      align-items: stretch;
    }
    .form > button {
      align-self: flex-start;
    }
    .announce:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordChangePage {
  private readonly change = inject(PasswordChange);
  private readonly currentInput = viewChild.required<ElementRef<HTMLInputElement>>('current');
  private readonly newInput = viewChild.required<ElementRef<HTMLInputElement>>('fresh');

  protected readonly form = new FormGroup({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(256)],
    }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12), Validators.maxLength(256)],
    }),
  });

  protected readonly submitting = signal(false);
  private readonly fieldErrors = signal<ReadonlyMap<PasswordField, string>>(new Map());
  protected readonly formError = signal<string | null>(null);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly waitSeconds = signal<number | null | undefined>(undefined);
  private unblockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.unblockTimer));
    this.form.valueChanges.subscribe(() => {
      if (this.waitSeconds() === null) {
        this.waitSeconds.set(undefined);
      }
    });
  }

  protected errorOf(field: PasswordField): string | null {
    return this.fieldErrors().get(field) ?? null;
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.waitSeconds() !== undefined) {
      return;
    }
    this.fieldErrors.set(new Map());
    this.formError.set(null);
    this.failure.set(null);
    const local = (['currentPassword', 'newPassword'] as const).filter(
      (field) => this.form.controls[field].invalid,
    );
    if (local.length > 0) {
      this.showFields(new Map(local.map((field) => [field, FIELD_MESSAGES[field]])));
      return;
    }

    this.submitting.set(true);
    const outcome = await this.change.submit(this.form.getRawValue());
    this.submitting.set(false);

    switch (outcome.kind) {
      case 'changed':
      case 'session-gone':
        // The store has ended the session and is on its way to sign in.
        this.form.reset();
        return;
      case 'wrong-current-password':
        this.showFields(new Map([['currentPassword', WRONG_CURRENT]]));
        return;
      case 'invalid':
        this.showFields(
          new Map([...outcome.fields].map((field) => [field, FIELD_MESSAGES[field]])),
        );
        if (outcome.formLevel || outcome.fields.size === 0) {
          this.formError.set(FORM_LEVEL_INVALID);
        }
        return;
      case 'rate-limited':
        this.waitSeconds.set(outcome.retryAfterSeconds);
        clearTimeout(this.unblockTimer);
        if (outcome.retryAfterSeconds !== null) {
          this.unblockTimer = setTimeout(
            () => this.waitSeconds.set(undefined),
            outcome.retryAfterSeconds * 1000,
          );
        }
        return;
      case 'undetermined':
      case 'failed':
        this.failure.set(outcome.failure);
        return;
    }
  }

  private showFields(errors: ReadonlyMap<PasswordField, string>): void {
    this.fieldErrors.set(errors);
    if (errors.has('currentPassword')) {
      this.currentInput().nativeElement.focus();
    } else if (errors.has('newPassword')) {
      this.newInput().nativeElement.focus();
    }
  }
}
