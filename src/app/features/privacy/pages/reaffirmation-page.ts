import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { type ApiFailure, apiFailureOf } from '../../../core/api/api-problem';
import { APP_HOME_PATH, holdsOnConsentScreen } from '../../../core/session/gate';
import { SessionStore } from '../../../core/session/session-store';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PrivacyApi } from '../data/privacy-api';
import { inContractOrder } from '../model/consent';
import { ConsentDisclosure } from '../../../shared/ui/consent-disclosure/consent-disclosure';
import { currentWordings } from '../../../shared/ui/consent-disclosure/wording';

export const REFUSED_MESSAGE =
  'A reafirmação não foi aceita no estado atual da conta. A situação foi atualizada.';

/**
 * Row 6 of the chain, `/reafirmar-consentimento`: `POST /api/v1/consents/reaffirmation`.
 *
 * - Says what is asked: a consent a guardian gave is reaffirmed in the person's own name.
 * - Shows, in full, the wording in force of each essential purpose: reaffirming records consent to
 *   it. The route takes no `termsVersionId` — the server picks the wording in force at that moment
 *   — so the record is not tied to the text displayed, unlike `POST /consents` (K-M).
 * - Invents no deadline. The grace period is 30 days by configuration and ends in suspension, but
 *   the contract exposes neither the deadline nor the date of birth (K-K): the screen says the
 *   reaffirmation is needed and that the account stays usable meanwhile, which backend ADR 0004 states.
 * - And makes that true: "Agora não" defers it for this session (`SessionStore.deferReaffirmation`)
 *   and the chain lets the person into the application. backend ADR 0004: the account is not blocked.
 * - The body is `{}`: its one member, `token`, is only for a caller who is not signed in.
 * - After success, `settle('reaffirmation')`: the chain decides where the person goes.
 *
 * UNREACHABLE TODAY (read, FE-5): only a holder who consented before reaching the consent age owes
 * a reaffirmation, and registration refuses anyone below it (K-E).
 */
@Component({
  selector: 'sn-reaffirmation-page',
  imports: [ConsentDisclosure, ErrorState, LoadingState, RateLimitNotice],
  template: `
    <h1 class="display-md">Reafirme seu consentimento</h1>
    <p class="lead">
      Quando esta conta foi criada, quem consentiu com o tratamento dos seus dados foi um
      responsável. Agora que você tem idade para consentir, esse consentimento precisa ser
      reafirmado em seu próprio nome.
    </p>
    <p class="body muted">Enquanto isso, a conta continua funcionando normalmente.</p>

    @if (termsFailure(); as failure) {
      <sn-error-state
        [problem]="failure"
        description="Sem os textos, não há como reafirmar. A conta continua funcionando."
        (retry)="terms.reload()"
      />
    } @else if (terms.value() === undefined) {
      <sn-loading-state label="Carregando o texto em vigor" shape="cards" [count]="1" />
    } @else {
      <p class="body">Ao reafirmar, você consente, em seu nome, com o texto em vigor:</p>
      <div class="list">
        @for (wording of essential(); track wording.id) {
          <sn-consent-disclosure [wording]="wording" />
        }
      </div>
    }

    <div class="announce" role="alert" aria-atomic="true">
      @if (message(); as text) {
        <div class="sn-alert sn-alert--info">
          <div class="sn-alert__body">{{ text }}</div>
        </div>
      }
    </div>
    @if (waitSeconds() !== undefined) {
      <sn-rate-limit-notice [retryAfterSeconds]="waitSeconds() ?? null" />
    }
    @if (failure(); as problem) {
      <sn-error-state [problem]="problem" (retry)="reaffirm()" />
    }

    <div class="actions">
      <button
        type="button"
        class="sn-btn sn-btn--primary sn-btn--lg"
        [disabled]="submitting() || waitSeconds() !== undefined || essential().length === 0"
        [attr.aria-busy]="submitting() ? 'true' : null"
        (click)="reaffirm()"
      >
        Reafirmar em meu nome
      </button>
      <button
        type="button"
        class="sn-btn sn-btn--secondary sn-btn--lg"
        [disabled]="submitting()"
        (click)="later()"
      >
        Agora não
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    h1,
    p {
      margin: 0;
    }
    .muted {
      color: var(--ink-muted);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .announce:empty {
      display: none;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaffirmationPage {
  private readonly api = inject(PrivacyApi);
  private readonly store = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly terms = this.api.terms();
  /** The wordings of the purposes the reaffirmation rewrites: the essential ones. */
  protected readonly essential = computed(() => {
    const wordings = currentWordings(this.terms.value() ?? []);
    return inContractOrder(wordings.keys())
      .filter(holdsOnConsentScreen)
      .flatMap((purpose) => {
        const wording = wordings.get(purpose);
        return wording === undefined ? [] : [wording];
      });
  });
  protected readonly termsFailure = computed(() => {
    const error = this.terms.error();
    return error === undefined ? null : apiFailureOf(error);
  });

  protected readonly submitting = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly waitSeconds = signal<number | null | undefined>(undefined);
  private unblockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.unblockTimer));
  }

  protected async reaffirm(): Promise<void> {
    if (this.submitting() || this.waitSeconds() !== undefined) {
      return;
    }
    this.message.set(null);
    this.failure.set(null);
    this.submitting.set(true);
    const outcome = await this.api.reaffirm();
    switch (outcome.kind) {
      case 'reaffirmed':
      case 'refused': {
        const state = await this.store.settle('reaffirmation');
        this.submitting.set(false);
        if (state.kind === 'failed') {
          this.failure.set(state.failure);
        } else if (outcome.kind === 'refused') {
          this.message.set(REFUSED_MESSAGE);
        }
        return;
      }
      case 'rate-limited':
        this.submitting.set(false);
        this.waitSeconds.set(outcome.retryAfterSeconds);
        clearTimeout(this.unblockTimer);
        if (outcome.retryAfterSeconds !== null) {
          this.unblockTimer = setTimeout(
            () => this.waitSeconds.set(undefined),
            outcome.retryAfterSeconds * 1000,
          );
        }
        return;
      case 'failed':
        this.submitting.set(false);
        this.failure.set(outcome.failure);
        return;
    }
  }

  /** Keep using the account; the chain lets the person in, and asks again next session. */
  protected async later(): Promise<void> {
    this.store.deferReaffirmation();
    await this.router.navigateByUrl(APP_HOME_PATH);
  }
}
