import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { type ApiFailure, apiFailureOf, isRateLimitExceeded } from '../../../core/api/api-problem';
import { CONSENT_PURPOSES, type ConsentPurpose } from '../../../core/api/contract/enums';
import { SessionStore } from '../../../core/session/session-store';
import { AccountTimeService } from '../../../core/time/account-time.service';
import { CONSENT_PURPOSE_KIND_LABELS } from '../../../shared/labels/consent-purpose-kind.labels';
import { CONSENT_PURPOSE_NOTE_LABELS } from '../../../shared/labels/consent-purpose-note.labels';
import { CONSENT_PURPOSE_LABELS } from '../../../shared/labels/consent-purpose.labels';
import { CONSENT_WITHDRAWAL_LABELS } from '../../../shared/labels/consent-withdrawal.labels';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PrivacyApi } from '../data/privacy-api';
import {
  type ConsentInForce,
  SUSPENSION_CONFIRM_WORD,
  type WithdrawalEffect,
  consentsInForce,
  grantableHere,
  withdrawalEffectOf,
} from '../model/consent';
import { ConsentDisclosure } from '../../../shared/ui/consent-disclosure/consent-disclosure';
import { currentWordings } from '../../../shared/ui/consent-disclosure/wording';

/** What the screen says after an act, in the status region. */
const DONE = {
  granted: 'Consentimento registrado.',
  withdrawn: 'Consentimento retirado.',
  notInForce: 'Este consentimento já não estava em vigor. A lista abaixo foi atualizada.',
  changed:
    'A situação deste consentimento mudou desde que a página foi aberta. A lista e os textos abaixo foram atualizados: leia-os de novo antes de decidir.',
} as const;

/**
 * "Consentimentos", `/conta/consentimentos`, in the account area: every purpose, what is in force,
 * and the acts that exist — `POST /api/v1/consents` and `DELETE /api/v1/consents/{purpose}`.
 *
 * Where a student who declined research can still find it: offered here with its full wording,
 * never pre-checked, never "recommended", and never asked for again anywhere else.
 *
 * Withdrawal, by what it does (`withdrawalEffectOf`), said BEFORE the act:
 * - the essential purpose suspends the account and ends the session: a warning on the screen, then
 *   a destructive confirmation by typed word. After the 204 the session is already dead, and the
 *   screen only re-reads the state: the 401 takes the expiry path, which it does not race;
 * - institution sharing ends the teachers' access at once: an ordinary confirmation, and no word
 *   about suspension;
 * - research: no confirmation and no warning. Withdrawing is no harder than granting.
 */
@Component({
  selector: 'sn-consent-settings-page',
  imports: [
    ConfirmDialog,
    ConsentDisclosure,
    ErrorState,
    LoadingState,
    NgTemplateOutlet,
    RateLimitNotice,
    RouterLink,
  ],
  template: `
    <a class="sn-btn sn-btn--ghost back" routerLink="/conta">Voltar para Conta</a>
    <h1 class="display-md">Consentimentos</h1>
    <p class="lead intro">
      Cada finalidade é consentida separadamente. Aqui você vê o que está em vigor e pode dar ou
      retirar cada consentimento.
    </p>

    <!-- Always in the document, so what happened after an act is announced. -->
    <div class="announce" role="status" aria-atomic="true">
      @if (done(); as text) {
        <div class="sn-alert sn-alert--info">
          <div class="sn-alert__body">{{ text }}</div>
        </div>
      }
    </div>

    @if (waitSeconds() !== undefined) {
      <sn-rate-limit-notice [retryAfterSeconds]="waitSeconds() ?? null" />
    }
    @if (actionFailure(); as problem) {
      <sn-error-state [problem]="problem" />
    }

    @if (readFailure(); as failure) {
      @if (readRateLimited()) {
        <sn-rate-limit-notice [retryAfterSeconds]="readRetryAfter()" />
      } @else {
        <sn-error-state
          [problem]="failure"
          description="Nenhum consentimento foi alterado."
          (retry)="reload()"
        />
      }
    } @else if (history.value() === undefined || terms.value() === undefined) {
      <sn-loading-state label="Carregando seus consentimentos" shape="cards" [count]="3" />
    } @else {
      <div class="list">
        @for (item of items(); track item.purpose) {
          @if (item.wording; as wording) {
            <sn-consent-disclosure [wording]="wording">
              <ng-container *ngTemplateOutlet="status; context: { $implicit: item }" />
            </sn-consent-disclosure>
          } @else {
            <section class="sn-card" [attr.aria-label]="item.name">
              <div class="sn-card__head">
                <h2 class="sn-card__title">{{ item.name }}</h2>
                <span class="sn-badge">{{ item.kind }}</span>
              </div>
              <p class="body unpublished">
                O texto desta finalidade não está publicado, e sem ele não há como consentir.
              </p>
              <p class="sn-choice__note">{{ item.note }}</p>
              <ng-container *ngTemplateOutlet="status; context: { $implicit: item }" />
            </section>
          }
        }
      </div>
    }

    <ng-template #status let-item>
      <div class="state">
        @if (item.inForce; as consent) {
          <p class="body-strong">{{ inForceText(consent) }}</p>
          @switch (item.effect) {
            @case ('suspends-account') {
              <div class="sn-alert sn-alert--warning" role="note">
                <div class="sn-alert__body">
                  <strong>Atenção: isto suspende a conta.</strong> {{ item.withdrawal }}
                </div>
              </div>
              <button
                type="button"
                class="sn-btn sn-btn--danger"
                [disabled]="busy()"
                (click)="ask(item.purpose)"
              >
                Retirar consentimento
              </button>
            }
            @case ('ends-teacher-access') {
              <p class="body">{{ item.withdrawal }}</p>
              <button
                type="button"
                class="sn-btn sn-btn--secondary"
                [disabled]="busy()"
                (click)="ask(item.purpose)"
              >
                Retirar consentimento
              </button>
            }
            @default {
              <p class="body">{{ item.withdrawal }}</p>
              <button
                type="button"
                class="sn-btn sn-btn--secondary"
                [disabled]="busy()"
                [attr.aria-busy]="acting() === item.purpose ? 'true' : null"
                (click)="withdraw(item.purpose)"
              >
                Retirar consentimento
              </button>
            }
          }
        } @else {
          <p class="body-strong">Sem consentimento em vigor</p>
          @if (item.grantable && item.wording) {
            <button
              type="button"
              class="sn-btn sn-btn--secondary"
              [disabled]="busy()"
              [attr.aria-busy]="acting() === item.purpose ? 'true' : null"
              (click)="grant(item.purpose, item.wording.id)"
            >
              Dar consentimento
            </button>
          }
        }
      </div>
    </ng-template>

    @if (asking(); as purpose) {
      <sn-confirm-dialog
        [heading]="dialogHeading(purpose)"
        [confirmLabel]="dialogAction(purpose)"
        [confirmWord]="dialogWord(purpose)"
        [busy]="acting() !== null"
        (cancelled)="asking.set(null)"
        (confirmed)="withdraw(purpose)"
      >
        <p class="dialog-text">{{ withdrawalText(purpose) }}</p>
      </sn-confirm-dialog>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .back {
      margin-bottom: var(--space-4);
      padding-inline: 0;
    }
    h1 {
      margin: 0 0 var(--space-4);
    }
    .intro {
      margin: 0 0 var(--space-6);
      color: var(--ink-muted);
    }
    .announce:empty {
      display: none;
    }
    .announce,
    sn-rate-limit-notice,
    sn-error-state {
      display: block;
      margin-bottom: var(--space-5);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .state {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-3);
      margin-top: var(--space-5);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }
    .state p {
      margin: 0;
    }
    .unpublished {
      margin: 0 0 var(--space-3);
    }
    .dialog-text {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentSettingsPage {
  private readonly api = inject(PrivacyApi);
  private readonly store = inject(SessionStore);
  private readonly time = inject(AccountTimeService);

  protected readonly history = this.api.consentHistory();
  protected readonly terms = this.api.terms();

  protected readonly items = computed(() => {
    const wordings = currentWordings(this.terms.value() ?? []);
    const inForce = consentsInForce(this.history.value() ?? []);
    return CONSENT_PURPOSES.map((purpose) => ({
      purpose,
      name: CONSENT_PURPOSE_LABELS[purpose],
      kind: CONSENT_PURPOSE_KIND_LABELS[purpose],
      note: CONSENT_PURPOSE_NOTE_LABELS[purpose],
      withdrawal: CONSENT_WITHDRAWAL_LABELS[purpose],
      effect: withdrawalEffectOf(purpose),
      grantable: grantableHere(purpose),
      wording: wordings.get(purpose) ?? null,
      inForce: inForce.get(purpose) ?? null,
    }));
  });

  protected readonly readFailure = computed(() => {
    const error = this.history.error() ?? this.terms.error();
    return error === undefined ? null : apiFailureOf(error);
  });
  protected readonly readRateLimited = computed(() => {
    const failure = this.readFailure();
    return failure !== null && isRateLimitExceeded(failure);
  });
  protected readonly readRetryAfter = computed(() => {
    const failure = this.readFailure();
    return failure !== null && isRateLimitExceeded(failure) ? failure.retryAfterSeconds : null;
  });

  /** The purpose whose withdrawal is being confirmed. */
  protected readonly asking = signal<ConsentPurpose | null>(null);
  /** The purpose whose request is in flight. */
  protected readonly acting = signal<ConsentPurpose | null>(null);
  protected readonly busy = computed(
    () => this.acting() !== null || this.waitSeconds() !== undefined,
  );
  protected readonly done = signal<string | null>(null);
  protected readonly actionFailure = signal<ApiFailure | null>(null);
  protected readonly waitSeconds = signal<number | null | undefined>(undefined);
  private unblockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.unblockTimer));
  }

  protected reload(): void {
    this.history.reload();
    this.terms.reload();
  }

  protected ask(purpose: ConsentPurpose): void {
    this.done.set(null);
    this.actionFailure.set(null);
    this.asking.set(purpose);
  }

  protected inForceText(consent: ConsentInForce): string {
    const since =
      consent.grantedAt === null
        ? ''
        : ` desde ${this.time.formatInstant(consent.grantedAt, 'longDate')}`;
    const version = consent.termsVersion === null ? '' : `, na versão ${consent.termsVersion}`;
    return `Em vigor${since}${version}`;
  }

  protected withdrawalText(purpose: ConsentPurpose): string {
    return CONSENT_WITHDRAWAL_LABELS[purpose];
  }

  protected dialogHeading(purpose: ConsentPurpose): string {
    return this.effect(purpose) === 'suspends-account'
      ? 'Retirar o consentimento essencial e suspender a conta?'
      : `Retirar o consentimento de ${CONSENT_PURPOSE_LABELS[purpose].toLocaleLowerCase('pt-BR')}?`;
  }

  protected dialogAction(purpose: ConsentPurpose): string {
    return this.effect(purpose) === 'suspends-account'
      ? 'Retirar e suspender a conta'
      : 'Retirar consentimento';
  }

  protected dialogWord(purpose: ConsentPurpose): string | null {
    return this.effect(purpose) === 'suspends-account' ? SUSPENSION_CONFIRM_WORD : null;
  }

  protected async grant(purpose: ConsentPurpose, termsVersionId: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.start(purpose);
    const outcome = await this.api.grant(purpose, termsVersionId);
    switch (outcome.kind) {
      case 'granted':
        await this.finish(DONE.granted);
        return;
      case 'changed':
        await this.finish(DONE.changed);
        return;
      case 'rate-limited':
        this.acting.set(null);
        this.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.acting.set(null);
        this.actionFailure.set(outcome.failure);
        return;
    }
  }

  protected async withdraw(purpose: ConsentPurpose): Promise<void> {
    if (this.acting() !== null) {
      return;
    }
    this.start(purpose);
    const outcome = await this.api.withdraw(purpose);
    switch (outcome.kind) {
      case 'withdrawn':
        this.asking.set(null);
        if (this.effect(purpose) === 'suspends-account') {
          // The account is suspended and every session revoked, this one included. The re-read
          // gets the 401, and the expiry path takes the person to sign in. Nothing races it.
          await this.store.settle('app');
          this.acting.set(null);
          return;
        }
        await this.finish(DONE.withdrawn);
        return;
      case 'not-in-force':
        this.asking.set(null);
        await this.finish(DONE.notInForce);
        return;
      case 'rate-limited':
        this.acting.set(null);
        this.asking.set(null);
        this.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.acting.set(null);
        this.asking.set(null);
        this.actionFailure.set(outcome.failure);
        return;
    }
  }

  private effect(purpose: ConsentPurpose): WithdrawalEffect {
    return withdrawalEffectOf(purpose);
  }

  private start(purpose: ConsentPurpose): void {
    this.done.set(null);
    this.actionFailure.set(null);
    this.acting.set(purpose);
  }

  /** After a write: read the lists and the state again, and let the chain decide. */
  private async finish(message: string): Promise<void> {
    this.reload();
    const outcome = await this.store.settle('app');
    this.acting.set(null);
    if (outcome.kind === 'failed') {
      this.actionFailure.set(outcome.failure);
    }
    this.done.set(message);
  }

  private block(seconds: number | null): void {
    this.waitSeconds.set(seconds);
    clearTimeout(this.unblockTimer);
    if (seconds !== null) {
      this.unblockTimer = setTimeout(() => this.waitSeconds.set(undefined), seconds * 1000);
    }
  }
}
