import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';

import { type ApiFailure, apiFailureOf, isRateLimitExceeded } from '../../../core/api/api-problem';
import { SessionStore } from '../../../core/session/session-store';
import { AccountTimeService } from '../../../core/time/account-time.service';
import { AccountDatePipe } from '../../../shared/pipes/account-date.pipe';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { PrivacyApi } from '../data/privacy-api';
import { exportFileName, suspensionCauseOf } from '../model/suspension';
import { JsonFileSaver } from './json-file-saver';

const CANCEL_REFUSED =
  'O pedido não pôde ser cancelado. Ele pode já ter sido concluído, cancelado ou ter falhado; ou o consentimento para o processamento dos dados de aprendizagem não está em vigor, e sem ele a conta não pode voltar a funcionar. A situação abaixo foi atualizada.';
const CANCEL_GONE = 'Este pedido não foi encontrado nesta conta. A situação abaixo foi atualizada.';

/**
 * Row 3 of the chain, `/conta-suspensa`. A suspended account can sign in and hold a session
 * (observed, FE-4.1), but the bootstrap cannot tell the two causes apart — both produced the same
 * body — so the screen reads `GET /api/v1/me/erasure-requests` and `GET /api/v1/consents` and
 * decides by `suspensionCauseOf`:
 *
 * - an erasure request in its window: when it was made, when the erasure happens and how long the
 *   window is (both from the request itself), and the two things that exist — withdraw it
 *   (`POST /api/v1/me/erasure-requests/{requestId}/cancellation`, then `settle`: the chain takes
 *   the person back into the application) and take the data (closes F17);
 * - the essential consent withdrawn: said plainly, and NO grant is offered, because granting it
 *   again was MEASURED in FE-5 to leave the account SUSPENDED (201, status unchanged, also after a
 *   new sign-in). No operation of the contract reactivates such an account (K-L);
 * - neither: the situation, and no promise (D4).
 *
 * The data export (`GET /api/v1/me/data-export`, 120 s in `ApiClient`) is offered in every case:
 * the holder's rights over their data do not depend on the suspension. It takes as long as it
 * takes: a status text while it runs, never a progress bar the server cannot feed.
 */
@Component({
  selector: 'sn-account-suspended-page',
  imports: [AccountDatePipe, ErrorState, LoadingState, RateLimitNotice],
  template: `
    <h1 class="display-md">Conta suspensa</h1>

    @if (readFailure(); as failure) {
      <p class="lead">
        Esta conta está suspensa. Enquanto estiver assim, as telas de estudo, agenda e plano não
        ficam disponíveis.
      </p>
      @if (readRateLimited()) {
        <sn-rate-limit-notice [retryAfterSeconds]="readRetryAfter()" />
      } @else {
        <sn-error-state
          [problem]="failure"
          description="Não foi possível saber o motivo da suspensão agora."
          (retry)="reload()"
        />
      }
    } @else if (cause(); as cause) {
      @switch (cause.kind) {
        @case ('erasure') {
          <p class="lead">{{ erasureLead(cause.request.requestedAt) }}</p>
          <p class="body">
            @if (cause.request.effectiveAt; as effective) {
              A eliminação acontece em {{ effective | accountDate: 'dateTime' }}.
            }
            @if (cause.request.windowDays; as days) {
              O prazo para cancelar é de {{ days }} dias a partir do pedido.
            }
            Até lá, você pode cancelar o pedido, e a conta volta a funcionar, ou baixar uma cópia
            dos seus dados. Depois disso, os dados pessoais da conta são anonimizados e não há como
            desfazer.
          </p>

          <div class="announce" role="alert" aria-atomic="true">
            @if (cancelMessage(); as text) {
              <div class="sn-alert sn-alert--info">
                <div class="sn-alert__body">{{ text }}</div>
              </div>
            }
          </div>
          @if (cancelWait() !== undefined) {
            <sn-rate-limit-notice [retryAfterSeconds]="cancelWait() ?? null" />
          }
          @if (cancelFailure(); as problem) {
            <sn-error-state [problem]="problem" (retry)="cancel(cause.request.id)" />
          }

          <div class="actions">
            <button
              type="button"
              class="sn-btn sn-btn--primary sn-btn--lg"
              [disabled]="cancelling() || exporting() || cancelWait() !== undefined"
              [attr.aria-busy]="cancelling() ? 'true' : null"
              (click)="cancel(cause.request.id)"
            >
              Cancelar o pedido de eliminação
            </button>
          </div>
        }
        @case ('consent-withdrawn') {
          <p class="lead">
            Esta conta está suspensa porque o consentimento para o processamento dos dados de
            aprendizagem foi retirado. Enquanto estiver assim, as telas de estudo, agenda e plano
            não ficam disponíveis.
          </p>
          <p class="body">
            Nesta versão, não há como reativar a conta por aqui: dar esse consentimento de novo fica
            registrado, mas a conta continua suspensa.
          </p>
        }
        @default {
          <p class="lead">
            Esta conta está suspensa. Enquanto estiver assim, as telas de estudo, agenda e plano não
            ficam disponíveis.
          </p>
        }
      }

      <section class="export" aria-labelledby="export-title">
        <h2 class="h3" id="export-title">Seus dados</h2>
        <p class="body">
          Você pode baixar tudo o que a plataforma guarda sobre você, em um arquivo.
        </p>
        <!-- Always in the document, so the wait and its end are announced. -->
        <div class="status" role="status" aria-atomic="true">
          @if (exporting()) {
            <p class="body">
              Preparando seus dados. Isso pode levar algum tempo; mantenha esta página aberta.
            </p>
          } @else if (exported(); as name) {
            <p class="body">Seus dados foram entregues ao navegador no arquivo {{ name }}.</p>
          }
        </div>
        @if (exportWait() !== undefined) {
          <sn-rate-limit-notice [retryAfterSeconds]="exportWait() ?? null" />
        }
        @if (exportFailure(); as problem) {
          <sn-error-state
            [problem]="problem"
            description="Nada foi alterado na conta."
            (retry)="exportData()"
          />
        }
        <button
          type="button"
          class="sn-btn sn-btn--secondary"
          [disabled]="exporting() || cancelling() || exportWait() !== undefined"
          [attr.aria-busy]="exporting() ? 'true' : null"
          (click)="exportData()"
        >
          Baixar meus dados
        </button>
      </section>
    } @else {
      <sn-loading-state label="Verificando a situação da conta" [count]="3" />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    h1,
    h2,
    p {
      margin: 0;
    }
    .announce:empty,
    .status:empty {
      display: none;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .export {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-3);
      padding-top: var(--space-5);
      border-top: 1px solid var(--border-subtle);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSuspendedPage {
  private readonly api = inject(PrivacyApi);
  private readonly store = inject(SessionStore);
  private readonly time = inject(AccountTimeService);
  private readonly saver = inject(JsonFileSaver);

  protected readonly requests = this.api.erasureRequests();
  protected readonly history = this.api.consentHistory();

  protected readonly cause = computed(() => {
    const requests = this.requests.value();
    const history = this.history.value();
    return requests === undefined || history === undefined
      ? null
      : suspensionCauseOf(requests, history);
  });

  protected readonly readFailure = computed(() => {
    const error = this.requests.error() ?? this.history.error();
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

  protected readonly cancelling = signal(false);
  protected readonly cancelMessage = signal<string | null>(null);
  protected readonly cancelFailure = signal<ApiFailure | null>(null);
  protected readonly cancelWait = signal<number | null | undefined>(undefined);

  protected readonly exporting = signal(false);
  protected readonly exported = signal<string | null>(null);
  protected readonly exportFailure = signal<ApiFailure | null>(null);
  protected readonly exportWait = signal<number | null | undefined>(undefined);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach(clearTimeout));
  }

  protected erasureLead(requestedAt: string | null): string {
    const when =
      requestedAt === null ? '' : ` em ${this.time.formatInstant(requestedAt, 'longDate')}`;
    return `Esta conta está suspensa porque você pediu a eliminação dos seus dados${when}.`;
  }

  /** Blocks an action for the server's `Retry-After`; without one, until the page is reloaded. */
  private wait(block: WritableSignal<number | null | undefined>, seconds: number | null): void {
    block.set(seconds);
    if (seconds !== null) {
      this.timers.push(setTimeout(() => block.set(undefined), seconds * 1000));
    }
  }

  protected reload(): void {
    this.requests.reload();
    this.history.reload();
  }

  protected async cancel(requestId: string): Promise<void> {
    if (this.cancelling()) {
      return;
    }
    this.cancelMessage.set(null);
    this.cancelFailure.set(null);
    this.cancelling.set(true);
    const outcome = await this.api.cancelErasure(requestId);
    switch (outcome.kind) {
      case 'cancelled': {
        // The account is ACTIVE again: the chain takes the person on from here.
        const state = await this.store.settle('suspended');
        this.cancelling.set(false);
        if (state.kind === 'failed') {
          this.cancelFailure.set(state.failure);
        }
        return;
      }
      case 'refused':
      case 'gone':
        this.cancelling.set(false);
        this.cancelMessage.set(outcome.kind === 'refused' ? CANCEL_REFUSED : CANCEL_GONE);
        this.reload();
        return;
      case 'rate-limited':
        this.cancelling.set(false);
        this.wait(this.cancelWait, outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.cancelling.set(false);
        this.cancelFailure.set(outcome.failure);
        return;
    }
  }

  protected async exportData(): Promise<void> {
    if (this.exporting() || this.exportWait() !== undefined) {
      return;
    }
    this.exported.set(null);
    this.exportFailure.set(null);
    this.exporting.set(true);
    const outcome = await this.api.exportData();
    this.exporting.set(false);
    switch (outcome.kind) {
      case 'exported': {
        const name = exportFileName(this.time.today());
        this.saver.save(name, outcome.body);
        this.exported.set(name);
        return;
      }
      case 'rate-limited':
        this.wait(this.exportWait, outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.exportFailure.set(outcome.failure);
        return;
    }
  }
}
