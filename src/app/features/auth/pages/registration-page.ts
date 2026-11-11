import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { type ApiFailure, apiFailureOf, isRateLimitExceeded } from '../../../core/api/api-problem';
import type { RegistrationRequest } from '../../../core/api/contract/models';
import { PASSWORD_RESET_REQUEST_PATH, SIGN_IN_PATH, pathOf } from '../../../core/session/gate';
import { AccountTimeService } from '../../../core/time/account-time.service';
import { SubmitBlock } from '../../../shared/forms/submit-block';
import { CONSENT_PURPOSE_LABELS } from '../../../shared/labels/consent-purpose.labels';
import { ConsentDisclosure } from '../../../shared/ui/consent-disclosure/consent-disclosure';
import { currentWordings } from '../../../shared/ui/consent-disclosure/wording';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { Registration } from '../data/registration';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REGISTERED_STATE_KEY,
  REGISTRATION_PURPOSES,
  type RegistrationField,
  type RegistrationPurpose,
  conflictCauseOf,
  isLocalDate,
} from '../model/registration-outcome';

/** Field messages, written here: the server's `errors[].message` is English and never shown. */
export const REGISTRATION_MESSAGES = {
  emailEmpty: 'Informe seu e-mail.',
  email: 'Confira o endereço de e-mail.',
  password: `A senha precisa ter de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.`,
  dateOfBirthEmpty: 'Informe a data de nascimento.',
  dateOfBirth: 'Confira a data de nascimento.',
  timeZoneEmpty: 'Escolha o fuso horário.',
  timeZone: 'Este fuso horário não foi aceito. Escolha outro da lista.',
  essential: 'Para criar a conta, é preciso aceitar esta finalidade.',
  terms: 'As finalidades enviadas não foram aceitas. Leia os textos e marque sua escolha de novo.',
  formLevel: 'Os dados enviados não foram aceitos. Confira os campos e tente de novo.',
  addressField: 'Este endereço não pode ser usado para criar uma conta.',
} as const;

/** 422: said plainly, blaming nobody, and offering nothing that does not exist. */
export const UNDER_AGE_TITLE = 'Não é possível criar a conta nesta versão';
export const UNDER_AGE_MESSAGE =
  'Por enquanto, só é possível criar uma conta a partir da idade mínima para consentir em nome próprio. O cadastro com o consentimento de um responsável ainda não existe, e por isso não há outro caminho por aqui agora. Nenhum dado deste formulário foi guardado.';

/** 409 with every submitted wording still in force: the address. Asserts no account. */
export const ADDRESS_UNAVAILABLE_MESSAGE =
  'Este endereço de e-mail não pode ser usado para criar uma conta. Se você já tem uma conta com ele, entre ou redefina a senha.';

/** 409 with a submitted wording superseded: the text moved under the page. */
export function wordingChangedMessage(purposes: readonly RegistrationPurpose[]): string {
  const names = purposes.map((purpose) => `"${CONSENT_PURPOSE_LABELS[purpose]}"`).join(' e ');
  return `O texto de ${names} mudou desde que esta página foi aberta. Leia a versão em vigor abaixo e marque sua escolha de novo.`;
}

/** What the screen says after a refusal that is not about one field. */
type Notice =
  | { readonly kind: 'under-age' }
  | { readonly kind: 'address-unavailable' }
  | { readonly kind: 'wording-changed'; readonly text: string }
  | { readonly kind: 'form'; readonly text: string };

/**
 * `/criar-conta`, public: `GET /api/v1/terms`, then `POST /api/v1/accounts` with
 * `RegistrationRequest` — `email`, `password`, `dateOfBirth`, `timeZone`, `acceptedTerms`.
 *
 * - The terms are read FIRST and each purpose's full text is shown before its control
 *   (`ConsentDisclosure`). `acceptedTerms` carries the `id` of the wording on screen, never a
 *   remembered one.
 * - Two purposes only. `LEARNING_DATA_PROCESSING` is essential and must be checked to submit.
 *   `ACADEMIC_RESEARCH` is optional and costs NOTHING to refuse: not pre-checked, not
 *   recommended, the same component and colour as the essential one, no extra step, no second ask
 *   (backend ADR 0004: if the product degrades on refusal, the consent is not free and the data is
 *   unusable in a publication). `INSTITUTION_SHARING` is never offered here: it is consented to
 *   when an invite is redeemed (F1), and the server refuses it at registration (K-I).
 * - The password policy of the contract (12 to 256 characters) is stated before the person types.
 *   The e-mail's `format: email` is a hint, not a validator: the server decides.
 * - The date of birth is a local date, sent exactly as typed (`yyyy-MM-dd`), never through a
 *   `Date`. Its age is the server's to judge: the threshold is configuration, not contract.
 * - The time zone is SUGGESTED from the browser and the person can change it; the server does not
 *   guess it, and it is required.
 * - 201: no session is opened. The person goes to `/verificar-email`, which says what happens next.
 * - 400: per field. 422: under the consent age, plainly, and nothing to offer instead (no guardian
 *   flow exists; no route would receive a guardian's address). 409: decision G2, `conflictCauseOf`.
 *   429: the notice says how long, and the submit stays disabled for it.
 */
@Component({
  selector: 'sn-registration-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ConsentDisclosure,
    EmptyState,
    ErrorState,
    LoadingState,
    RateLimitNotice,
  ],
  template: `
    <h1 class="display-md">Criar conta</h1>
    <p class="lead intro">
      Informe seus dados e leia os termos de consentimento. Depois de criar a conta, é preciso
      confirmar o endereço de e-mail para ativá-la.
    </p>

    @if (termsFailure(); as failure) {
      @if (termsRateLimited()) {
        <sn-rate-limit-notice [retryAfterSeconds]="termsRetryAfter()" />
      } @else {
        <sn-error-state
          [problem]="failure"
          description="Sem os textos dos termos não é possível criar a conta, porque não há como consentir com eles."
          (retry)="terms.reload()"
        />
      }
    } @else if (terms.value() === undefined) {
      <sn-loading-state label="Carregando os termos de consentimento" shape="cards" [count]="2" />
    } @else if (essential() === undefined) {
      <sn-empty-state
        title="O cadastro não está disponível agora"
        description="O texto do consentimento necessário para usar a plataforma não está publicado. Sem ele não há consentimento possível, e por isso não é possível criar a conta. Tente mais tarde."
      />
    } @else {
      <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="sn-field" [class.sn-field--invalid]="errorOf('email') !== null">
          <label class="sn-field__label" for="registration-email">E-mail</label>
          <input
            #email
            id="registration-email"
            class="sn-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            formControlName="email"
            [attr.aria-invalid]="errorOf('email') !== null ? 'true' : null"
            [attr.aria-describedby]="errorOf('email') !== null ? 'registration-email-error' : null"
          />
          @if (errorOf('email'); as text) {
            <div id="registration-email-error" class="sn-field__error">{{ text }}</div>
          }
        </div>

        <div class="sn-field" [class.sn-field--invalid]="errorOf('password') !== null">
          <label class="sn-field__label" for="registration-password">Senha</label>
          <input
            #password
            id="registration-password"
            class="sn-input"
            type="password"
            autocomplete="new-password"
            formControlName="password"
            [attr.aria-invalid]="errorOf('password') !== null ? 'true' : null"
            [attr.aria-describedby]="
              errorOf('password') !== null
                ? 'registration-password-hint registration-password-error'
                : 'registration-password-hint'
            "
          />
          <div id="registration-password-hint" class="sn-field__hint">
            De {{ minLength }} a {{ maxLength }} caracteres.
          </div>
          @if (errorOf('password'); as text) {
            <div id="registration-password-error" class="sn-field__error">{{ text }}</div>
          }
        </div>

        <div class="sn-field" [class.sn-field--invalid]="errorOf('dateOfBirth') !== null">
          <label class="sn-field__label" for="registration-birth">Data de nascimento</label>
          <input
            #birth
            id="registration-birth"
            class="sn-input"
            type="date"
            autocomplete="bday"
            formControlName="dateOfBirth"
            [attr.aria-invalid]="errorOf('dateOfBirth') !== null ? 'true' : null"
            [attr.aria-describedby]="
              errorOf('dateOfBirth') !== null ? 'registration-birth-error' : null
            "
          />
          @if (errorOf('dateOfBirth'); as text) {
            <div id="registration-birth-error" class="sn-field__error">{{ text }}</div>
          }
        </div>

        <div class="sn-field" [class.sn-field--invalid]="errorOf('timeZone') !== null">
          <label class="sn-field__label" for="registration-zone">Fuso horário</label>
          <div class="sn-select-wrap">
            <select
              #zone
              id="registration-zone"
              class="sn-select"
              formControlName="timeZone"
              [attr.aria-invalid]="errorOf('timeZone') !== null ? 'true' : null"
              [attr.aria-describedby]="
                errorOf('timeZone') !== null
                  ? 'registration-zone-hint registration-zone-error'
                  : 'registration-zone-hint'
              "
            >
              @if (suggested === null) {
                <option value="">Escolha um fuso horário</option>
              }
              @for (option of zones; track option) {
                <option [value]="option">{{ zoneName(option) }}</option>
              }
            </select>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </div>
          <div id="registration-zone-hint" class="sn-field__hint">
            {{ zoneHint }} Os horários dos seus estudos são interpretados neste fuso.
          </div>
          @if (errorOf('timeZone'); as text) {
            <div id="registration-zone-error" class="sn-field__error">{{ text }}</div>
          }
        </div>

        <p class="body terms-intro">
          Leia o texto de cada finalidade antes de decidir. Cada uma é aceita separadamente.
        </p>

        @for (item of offered(); track item.wording.id) {
          <sn-consent-disclosure
            [wording]="item.wording"
            [choice]="true"
            [checked]="chosen().has(item.purpose)"
            [disabled]="submitting()"
            [zone]="declaredZone()"
            [error]="item.purpose === 'LEARNING_DATA_PROCESSING' ? essentialError() : null"
            (toggled)="choose(item.purpose, $event)"
          />
        }

        <!-- Always in the document, so a message put in it is announced. -->
        <div class="announce" role="alert" aria-atomic="true">
          @switch (notice()?.kind) {
            @case ('under-age') {
              <div class="sn-alert sn-alert--info">
                <div>
                  <div class="sn-alert__title">{{ underAgeTitle }}</div>
                  <div class="sn-alert__body">{{ underAgeMessage }}</div>
                </div>
              </div>
            }
            @case ('address-unavailable') {
              <div class="sn-alert sn-alert--info">
                <div class="sn-alert__body">
                  {{ addressMessage }}
                  <span class="paths">
                    <a [routerLink]="signInPath">Entrar</a>
                    <a [routerLink]="resetPath">Redefinir a senha</a>
                  </span>
                </div>
              </div>
            }
            @case ('wording-changed') {
              <div class="sn-alert sn-alert--info">
                <div class="sn-alert__body">{{ noticeText() }}</div>
              </div>
            }
            @case ('form') {
              <div class="sn-alert sn-alert--error">
                <div class="sn-alert__body">{{ noticeText() }}</div>
              </div>
            }
          }
        </div>

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
          {{ submitting() ? 'Criando conta…' : 'Criar conta' }}
        </button>
      </form>
    }

    <p class="body elsewhere">Já tem uma conta? <a [routerLink]="signInPath">Entrar</a></p>
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
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .terms-intro {
      margin: var(--space-2) 0 0;
      color: var(--ink-muted);
    }
    .announce:empty {
      display: none;
    }
    .paths {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      margin-top: var(--space-2);
    }
    .elsewhere {
      margin: var(--space-8) 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationPage {
  private readonly registration = inject(Registration);
  private readonly router = inject(Router);
  private readonly time = inject(AccountTimeService);

  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('email');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('password');
  private readonly birthInput = viewChild<ElementRef<HTMLInputElement>>('birth');
  private readonly zoneInput = viewChild<ElementRef<HTMLSelectElement>>('zone');
  private readonly disclosures = viewChildren(ConsentDisclosure);

  protected readonly minLength = PASSWORD_MIN_LENGTH;
  protected readonly maxLength = PASSWORD_MAX_LENGTH;
  protected readonly signInPath = SIGN_IN_PATH;
  protected readonly resetPath = PASSWORD_RESET_REQUEST_PATH;
  protected readonly underAgeTitle = UNDER_AGE_TITLE;
  protected readonly underAgeMessage = UNDER_AGE_MESSAGE;
  protected readonly addressMessage = ADDRESS_UNAVAILABLE_MESSAGE;

  /** The browser's zone, proposed and never imposed. */
  protected readonly suggested = this.time.suggestedZone();
  protected readonly zones = this.time.knownZones([this.suggested]);
  protected readonly zoneHint =
    this.suggested === null
      ? 'Escolha o fuso em que você vive.'
      : 'Sugerido a partir deste navegador; altere se você vive em outro fuso.';

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
    dateOfBirth: new FormControl('', { nonNullable: true }),
    timeZone: new FormControl(this.suggested ?? '', { nonNullable: true }),
  });
  /** The zone being declared: the publication dates of the terms are shown in it. */
  protected readonly declaredZone = toSignal(this.form.controls.timeZone.valueChanges, {
    initialValue: this.form.controls.timeZone.value,
  });

  protected readonly terms = this.registration.terms();
  private readonly wordings = computed(() => currentWordings(this.terms.value() ?? []));
  protected readonly essential = computed(() => this.wordings().get('LEARNING_DATA_PROCESSING'));
  /** The purposes this screen offers, with the wording in force for each, in contract order. */
  protected readonly offered = computed(() =>
    REGISTRATION_PURPOSES.flatMap((purpose) => {
      const wording = this.wordings().get(purpose);
      return wording === undefined ? [] : [{ purpose, wording }];
    }),
  );

  protected readonly termsFailure = computed(() => {
    const error = this.terms.error();
    return error === undefined ? null : apiFailureOf(error);
  });
  protected readonly termsRateLimited = computed(() => {
    const failure = this.termsFailure();
    return failure !== null && isRateLimitExceeded(failure);
  });
  protected readonly termsRetryAfter = computed(() => {
    const failure = this.termsFailure();
    return failure !== null && isRateLimitExceeded(failure) ? failure.retryAfterSeconds : null;
  });

  /** What the person accepted. Starts EMPTY: nothing is ever pre-checked. */
  protected readonly chosen = signal<ReadonlySet<RegistrationPurpose>>(new Set());

  protected readonly submitting = signal(false);
  private readonly fieldErrors = signal<ReadonlyMap<RegistrationField, string>>(new Map());
  protected readonly essentialError = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly noticeText = computed(() => {
    const notice = this.notice();
    return notice !== null && (notice.kind === 'wording-changed' || notice.kind === 'form')
      ? notice.text
      : '';
  });
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly block = new SubmitBlock();

  constructor() {
    this.form.valueChanges.subscribe(() => this.block.edited());
  }

  protected errorOf(field: RegistrationField): string | null {
    return this.fieldErrors().get(field) ?? null;
  }

  protected zoneName(zone: string): string {
    return zone.replace(/_/g, ' ');
  }

  protected choose(purpose: RegistrationPurpose, accepted: boolean): void {
    const next = new Set(this.chosen());
    if (accepted) {
      next.add(purpose);
    } else {
      next.delete(purpose);
    }
    this.chosen.set(next);
    if (purpose === 'LEARNING_DATA_PROCESSING' && accepted) {
      this.essentialError.set(null);
    }
    this.block.edited();
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.block.blocked()) {
      return;
    }
    this.reset();
    const value = this.form.getRawValue();

    const local = new Map<RegistrationField, string>();
    if (value.email.trim() === '') {
      local.set('email', REGISTRATION_MESSAGES.emailEmpty);
    }
    if (
      value.password.length < PASSWORD_MIN_LENGTH ||
      value.password.length > PASSWORD_MAX_LENGTH
    ) {
      local.set('password', REGISTRATION_MESSAGES.password);
    }
    if (value.dateOfBirth === '') {
      local.set('dateOfBirth', REGISTRATION_MESSAGES.dateOfBirthEmpty);
    } else if (!isLocalDate(value.dateOfBirth)) {
      local.set('dateOfBirth', REGISTRATION_MESSAGES.dateOfBirth);
    }
    if (value.timeZone === '') {
      local.set('timeZone', REGISTRATION_MESSAGES.timeZoneEmpty);
    }
    const essentialMissing = !this.chosen().has('LEARNING_DATA_PROCESSING');
    if (local.size > 0 || essentialMissing) {
      this.fieldErrors.set(local);
      this.essentialError.set(essentialMissing ? REGISTRATION_MESSAGES.essential : null);
      this.focusFirst(local, essentialMissing);
      return;
    }

    // The ids of the wordings ON SCREEN now, for exactly the purposes the person checked.
    const submitted = new Map<RegistrationPurpose, string>();
    for (const { purpose, wording } of this.offered()) {
      if (this.chosen().has(purpose)) {
        submitted.set(purpose, wording.id);
      }
    }
    const request: RegistrationRequest = {
      email: value.email.trim(),
      password: value.password,
      dateOfBirth: value.dateOfBirth,
      timeZone: value.timeZone,
      acceptedTerms: [...submitted].map(([purpose, termsVersionId]) => ({
        purpose,
        termsVersionId,
      })),
    };

    this.submitting.set(true);
    const result = await this.registration.register(request);
    if (result.kind === 'conflict') {
      await this.resolveConflict(submitted);
      this.submitting.set(false);
      return;
    }
    this.submitting.set(false);

    switch (result.kind) {
      case 'registered':
        this.form.reset({ timeZone: value.timeZone });
        await this.router.navigateByUrl(pathOf('verify-email'), {
          state: { [REGISTERED_STATE_KEY]: true },
        });
        return;
      case 'invalid': {
        const errors = new Map<RegistrationField, string>();
        for (const field of result.fields) {
          errors.set(field, REGISTRATION_MESSAGES[field]);
        }
        this.fieldErrors.set(errors);
        if (result.terms) {
          this.essentialError.set(REGISTRATION_MESSAGES.terms);
        }
        if (result.formLevel || (errors.size === 0 && !result.terms)) {
          this.notice.set({ kind: 'form', text: REGISTRATION_MESSAGES.formLevel });
        }
        this.focusFirst(errors, result.terms);
        return;
      }
      case 'under-age':
        this.notice.set({ kind: 'under-age' });
        return;
      case 'rate-limited':
        this.block.block(result.retryAfterSeconds);
        return;
      case 'failed':
        this.failure.set(result.failure);
        return;
    }
  }

  /**
   * Decision G2: a 409 is either the address or a superseded wording. Read the terms again; a
   * submitted id no longer in force means the text moved — show the new one, uncheck what was
   * accepted against the old, and say so. Otherwise the address is the cause.
   */
  private async resolveConflict(
    submitted: ReadonlyMap<RegistrationPurpose, string>,
  ): Promise<void> {
    const read = await this.registration.termsNow();
    if (read.kind === 'failed') {
      this.failure.set(read.failure);
      return;
    }
    const cause = conflictCauseOf(submitted, currentWordings(read.terms));
    // The page shows what is in force now, whichever the cause.
    this.terms.set(read.terms);
    if (cause.kind === 'wording-changed') {
      const next = new Set(this.chosen());
      for (const purpose of cause.changed) {
        next.delete(purpose);
      }
      this.chosen.set(next);
      this.notice.set({ kind: 'wording-changed', text: wordingChangedMessage(cause.changed) });
      return;
    }
    this.fieldErrors.set(new Map([['email', REGISTRATION_MESSAGES.addressField]]));
    this.notice.set({ kind: 'address-unavailable' });
  }

  private reset(): void {
    this.fieldErrors.set(new Map());
    this.essentialError.set(null);
    this.notice.set(null);
    this.failure.set(null);
  }

  private focusFirst(errors: ReadonlyMap<RegistrationField, string>, essential: boolean): void {
    const order: [RegistrationField, ElementRef<HTMLElement> | undefined][] = [
      ['email', this.emailInput()],
      ['password', this.passwordInput()],
      ['dateOfBirth', this.birthInput()],
      ['timeZone', this.zoneInput()],
    ];
    const first = order.find(([field]) => errors.has(field));
    if (first !== undefined) {
      first[1]?.nativeElement.focus();
      return;
    }
    if (essential) {
      this.disclosures()
        .find((disclosure) => disclosure.wording().purpose === 'LEARNING_DATA_PROCESSING')
        ?.focusChoice();
    }
  }
}
