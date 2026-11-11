import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';

import { type ApiFailure, apiFailureOf, isRateLimitExceeded } from '../../../core/api/api-problem';
import type { ConsentPurpose } from '../../../core/api/contract/enums';
import { holdsOnConsentScreen } from '../../../core/session/gate';
import { SessionStore } from '../../../core/session/session-store';
import { CONSENT_PURPOSE_LABELS } from '../../../shared/labels/consent-purpose.labels';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PrivacyApi } from '../data/privacy-api';
import { grantableHere, inContractOrder } from '../model/consent';
import { ConsentDisclosure } from '../../../shared/ui/consent-disclosure/consent-disclosure';
import { currentWordings } from '../../../shared/ui/consent-disclosure/wording';

/** Said when the server answered 409 to a grant: the state or the wording moved under the page. */
export const CHANGED_MESSAGE =
  'A situação destes consentimentos mudou desde que a página foi aberta. Os textos abaixo são os que estão em vigor agora: leia-os de novo antes de decidir.';

/**
 * Row 7 of the guard chain, `/consentimentos`: a pending purpose that cannot be declined freely
 * (`holdsOnConsentScreen` — the essential one). `GET /api/v1/terms`, `POST /api/v1/consents`.
 *
 * - Each pending purpose shows its wording in full before its control (`ConsentDisclosure`), and
 *   the grant sends the `termsVersionId` of THAT wording, read on this screen, never a remembered
 *   one.
 * - A purpose that holds must be checked to continue; the screen says so when it is not, rather
 *   than disabling the button without saying what is missing.
 * - `ACADEMIC_RESEARCH`, when it is pending too, is offered on the same terms and never required:
 *   not pre-checked, not "recommended", no warning colour, and "Continuar" works without it. After
 *   that nothing asks again: the chain no longer holds on it (K-H).
 * - 409 on a grant (`conflict`: already in force, or the wording is no longer the one published):
 *   the wordings and the state are read again, and the screen says what changed.
 * - After the grants, `SessionStore.settle('consent')` re-reads the state and the chain decides
 *   where the person goes. Nothing here navigates by hand.
 *
 * UNREACHABLE TODAY (read, FE-5): the essential purpose is decided at registration, so it is never
 * pending. The screen exists because the row does (see `core/session/gate.ts`).
 */
@Component({
  selector: 'sn-consent-gate-page',
  imports: [ConsentDisclosure, EmptyState, ErrorState, LoadingState, RateLimitNotice],
  template: `
    <h1 class="display-md">Consentimentos pendentes</h1>
    <p class="lead intro">
      Antes de continuar, leia o texto de cada finalidade abaixo e marque as que você aceita.
    </p>

    @if (termsFailure(); as failure) {
      @if (termsRateLimited()) {
        <sn-rate-limit-notice [retryAfterSeconds]="termsRetryAfter()" />
      } @else {
        <sn-error-state
          [problem]="failure"
          description="Sem os textos, não há como consentir com eles."
          (retry)="terms.reload()"
        />
      }
    } @else if (terms.value() === undefined) {
      <sn-loading-state label="Carregando os textos dos consentimentos" shape="cards" [count]="2" />
    } @else if (missingRequired().length > 0) {
      <sn-empty-state
        title="O texto desta finalidade não está publicado"
        description="Sem o texto completo não há consentimento possível, e por isso não é possível continuar agora. Você pode sair e tentar mais tarde."
      />
    } @else {
      <form class="form" (submit)="$event.preventDefault(); submit()" novalidate>
        @for (item of shown(); track item.key) {
          <sn-consent-disclosure
            [wording]="item.wording"
            [choice]="true"
            [checked]="chosen().has(item.purpose)"
            [disabled]="submitting()"
            (toggled)="choose(item.purpose, $event)"
          />
        }

        @if (offersOptional()) {
          <p class="body optional">
            Você pode continuar sem marcar as finalidades opcionais. Recusar não muda nada no
            serviço.
          </p>
        }

        <!-- Always in the document, so a message put in it is announced. -->
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
          <sn-error-state [problem]="problem" (retry)="submit()" />
        }

        <button
          type="submit"
          class="sn-btn sn-btn--primary sn-btn--lg"
          [disabled]="submitting() || waitSeconds() !== undefined"
          [attr.aria-busy]="submitting() ? 'true' : null"
        >
          Continuar
        </button>
      </form>
    }
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
    .optional {
      margin: 0;
      color: var(--ink-muted);
    }
    .announce:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentGatePage {
  private readonly api = inject(PrivacyApi);
  private readonly store = inject(SessionStore);

  protected readonly terms = this.api.terms();
  private readonly wordings = computed(() => currentWordings(this.terms.value() ?? []));

  /** Bumped when the choices are cleared, so every control is rebuilt unchecked. */
  protected readonly round = signal(0);

  /** The pending purposes this screen can grant, in contract order. */
  private readonly pending = computed(() =>
    inContractOrder(this.store.state()?.pendingConsents ?? []).filter(grantableHere),
  );
  protected readonly shown = computed(() => {
    const round = this.round();
    return this.pending().flatMap((purpose) => {
      const wording = this.wordings().get(purpose);
      // The key changes with the wording and with each clearing: a new control, unchecked.
      return wording === undefined ? [] : [{ purpose, wording, key: `${wording.id}:${round}` }];
    });
  });
  protected readonly missingRequired = computed(() =>
    this.pending().filter(
      (purpose) => holdsOnConsentScreen(purpose) && !this.wordings().has(purpose),
    ),
  );
  protected readonly offersOptional = computed(() =>
    this.shown().some((item) => !holdsOnConsentScreen(item.purpose)),
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

  /** What the person checked. Starts EMPTY: nothing is ever pre-checked. */
  protected readonly chosen = signal<ReadonlySet<ConsentPurpose>>(new Set());

  protected readonly submitting = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly failure = signal<ApiFailure | null>(null);
  protected readonly waitSeconds = signal<number | null | undefined>(undefined);
  private unblockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.unblockTimer));
  }

  protected choose(purpose: ConsentPurpose, checked: boolean): void {
    const next = new Set(this.chosen());
    if (checked) {
      next.add(purpose);
    } else {
      next.delete(purpose);
    }
    this.chosen.set(next);
    if (this.waitSeconds() === null) {
      this.waitSeconds.set(undefined);
    }
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.waitSeconds() !== undefined) {
      return;
    }
    this.message.set(null);
    this.failure.set(null);

    const missing = this.shown().filter(
      (item) => holdsOnConsentScreen(item.purpose) && !this.chosen().has(item.purpose),
    );
    if (missing.length > 0) {
      const names = missing.map((item) => `"${CONSENT_PURPOSE_LABELS[item.purpose]}"`).join(', ');
      this.message.set(
        `Para continuar, marque "Li e concordo" em ${names}. Sem esse consentimento a plataforma não pode tratar seus dados de estudo. Se preferir não dar, você pode sair.`,
      );
      return;
    }

    this.submitting.set(true);
    let changed = false;
    for (const item of this.shown()) {
      if (!this.chosen().has(item.purpose)) {
        continue;
      }
      const outcome = await this.api.grant(item.purpose, item.wording.id);
      if (outcome.kind === 'changed') {
        changed = true;
      } else if (outcome.kind === 'rate-limited') {
        this.submitting.set(false);
        this.block(outcome.retryAfterSeconds);
        return;
      } else if (outcome.kind === 'failed') {
        this.submitting.set(false);
        this.failure.set(outcome.failure);
        return;
      }
    }

    if (changed) {
      this.chosen.set(new Set());
      this.round.update((round) => round + 1);
      this.terms.reload();
    }
    const outcome = await this.store.settle('consent');
    this.submitting.set(false);
    if (outcome.kind === 'failed') {
      this.failure.set(outcome.failure);
    } else if (changed) {
      // Still here: something is still pending, so the new wording must be read.
      this.message.set(CHANGED_MESSAGE);
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
