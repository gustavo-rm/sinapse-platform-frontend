import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { AccountTimeService } from '../../../core/time/account-time.service';
import { GENERATION_REQUEST_STATUS_LABELS } from '../../../shared/labels/generation-request-status.labels';
import {
  type GenerationJob,
  describeElapsed,
  formatElapsed,
  waitingPhaseOf,
} from '../model/generation';

const PHASE_TEXT = {
  queued:
    'O pedido está na fila do servidor, que pega um pedido por vez, a intervalos de alguns segundos.',
  running: 'O servidor está montando o plano agora.',
  retrying:
    'O serviço que monta os planos não respondeu na última tentativa. O servidor tenta de novo sozinho, algumas vezes, antes de desistir.',
} as const;

/**
 * The wait for a plan (Design System, `GenerationProgress`), WITHOUT anything that implies a
 * proportion: no bar, no percentage, no estimate of what is left. The server reports no progress
 * (`progress` is always absent, backend K14) and this component invents none. The artifact's
 * preview draws a filled track at 34%; that reads as two-fifths done and is not used (STATE, F25).
 *
 * What it shows: what is happening now, in words; the time since the request, as a clock; how
 * many attempts the server made when it is retrying; and that the person may leave. A clock that
 * advances is the sign of life a spinner would otherwise be. The phase is announced in a polite
 * live region when it changes; the clock is not announced every second — its accessible text is in
 * minutes.
 *
 * After the polling ceiling (ADR 0005) the clock stops, the screen says the request is still on
 * the server, and one manual check is offered.
 */
@Component({
  selector: 'sn-generation-progress',
  template: `
    <section class="sn-card gen" [attr.aria-labelledby]="headingId" aria-busy="true">
      <div class="sn-card__head">
        <h2 class="sn-card__title" [id]="headingId">Montando seu plano</h2>
        <span class="sn-badge">{{ statusLabel() }}</span>
      </div>
      <p class="body phase" role="status" aria-live="polite" aria-atomic="true">
        {{ phaseText() }}
      </p>
      @if (attemptsText(); as text) {
        <p class="body muted">{{ text }}</p>
      }
      <p class="body clock">
        <span class="clock__label">Tempo desde o pedido</span>
        <span class="clock__value" aria-hidden="true">{{ clock() }}</span>
        <span class="visually-hidden">{{ clockWords() }}</span>
      </p>

      @if (stopped()) {
        <div class="sn-alert sn-alert--info" role="status">
          <div>
            <div class="sn-alert__title">Isto está levando mais do que o normal.</div>
            <div class="sn-alert__body">
              O pedido, feito às {{ requestedAt() }}, continua no servidor. Esta tela parou de
              consultar sozinha; você pode sair e voltar depois, ou consultar agora.
            </div>
          </div>
        </div>
        <button
          type="button"
          class="sn-btn sn-btn--secondary"
          [disabled]="busy()"
          [attr.aria-busy]="busy() ? 'true' : null"
          (click)="checkNow.emit()"
        >
          Consultar agora
        </button>
      } @else {
        <p class="body muted">
          Você pode sair desta tela: o pedido continua no servidor, e esta tela volta a acompanhá-lo
          quando você voltar.
        </p>
      }
      @if (checkFailed()) {
        <p class="body muted" role="status">
          A última consulta não teve resposta. A próxima é feita sozinha, em instantes.
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .gen {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .gen .sn-card__head {
      margin-bottom: 0;
    }
    .body {
      margin: 0;
    }
    .muted {
      color: var(--ink-muted);
    }
    .clock {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }
    .clock__label {
      color: var(--ink-muted);
    }
    .clock__value {
      font-size: 22px;
      font-weight: 600;
      line-height: 28px;
      font-variant-numeric: tabular-nums;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .sn-btn {
      align-self: flex-start;
      min-height: var(--target-min);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationProgress {
  private readonly time = inject(AccountTimeService);

  readonly job = input.required<GenerationJob>();
  readonly elapsedMs = input.required<number>();
  /** The polling ceiling passed: the screen no longer asks on its own. */
  readonly stopped = input(false);
  /** The last check got no usable answer; the next one is on schedule. */
  readonly checkFailed = input(false);
  readonly busy = input(false);
  readonly checkNow = output<void>();

  protected readonly headingId = 'sn-generation-heading';

  protected readonly statusLabel = computed(
    () => GENERATION_REQUEST_STATUS_LABELS[this.job().status],
  );
  protected readonly phaseText = computed(() => {
    const phase = waitingPhaseOf(this.job());
    return phase === null ? '' : PHASE_TEXT[phase];
  });
  protected readonly attemptsText = computed(() => {
    const job = this.job();
    if (waitingPhaseOf(job) !== 'retrying') {
      return null;
    }
    return job.attemptCount === 1
      ? 'Tentativas feitas até agora: 1.'
      : `Tentativas feitas até agora: ${job.attemptCount}.`;
  });
  protected readonly clock = computed(() => formatElapsed(this.elapsedMs()));
  protected readonly clockWords = computed(() => describeElapsed(this.elapsedMs()));
  protected readonly requestedAt = computed(() =>
    this.time.formatInstant(this.job().requestedAt, 'time'),
  );
}
