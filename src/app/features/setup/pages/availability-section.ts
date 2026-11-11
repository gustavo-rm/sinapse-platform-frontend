import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { type ApiFailure, apiFailureOf, isRateLimitExceeded } from '../../../core/api/api-problem';
import type { GuardTarget } from '../../../core/session/gate';
import { SessionStore } from '../../../core/session/session-store';
import { AccountTimeService } from '../../../core/time/account-time.service';
import { SubmitBlock } from '../../../shared/forms/submit-block';
import { DAY_OF_WEEK_LABELS } from '../../../shared/labels/day-of-week.labels';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { AvailabilityApi } from '../data/availability-api';
import {
  type AvailabilityDraft,
  type AvailabilityWindow,
  type DraftProblems,
  splitRoutine,
} from '../model/availability';
import { AvailabilityForm } from '../ui/availability-form';
import { AvailabilityList, type ClosingRequest } from '../ui/availability-list';

/** What the section says. Brazilian Portuguese, describing, never judging. */
const TEXT = {
  overlaps: (day: string) =>
    `Esta janela se sobrepõe a outra que você já declarou para ${day}, em datas que se cruzam. Duas janelas sobrepostas fariam a mesma hora contar duas vezes na hora de distribuir o estudo. Escolha outro horário, ou encerre a outra janela antes.`,
  invalid: 'Os dados da janela não foram aceitos. Confira os campos e tente de novo.',
  notProcessable:
    'Os dados de aprendizagem desta conta não podem ser processados agora, e por isso a janela não foi registrada.',
  alreadyClosed: 'Esta janela já estava encerrada. A lista foi atualizada.',
  gone: 'Esta janela não foi encontrada nesta conta. A lista foi atualizada.',
} as const;

/**
 * Availability, as `/configurar` (step 1) and `/conta/disponibilidade` show it — one component,
 * not two copies. Two reads of `GET /api/v1/availability`:
 *
 * - `?on=<today in the ACCOUNT's zone>` (`AccountTimeService.today`, never the browser's) — the
 *   windows in force today, as the server decides;
 * - without `on` — every window ever declared, closed ones included. What the server did not list
 *   for today is shown apart, as a record with its period: never hidden, never struck through.
 *
 * After every write the two lists are read again, and so is `/me/state` (`SessionStore.refresh`,
 * `docs/DESIGN_SYSTEM.md` §9), so the setup screen can say what the SERVER now thinks of the setup. Nothing
 * here navigates: a 403 lets the guard chain decide (`settle`).
 */
@Component({
  selector: 'sn-availability-section',
  imports: [
    AvailabilityForm,
    AvailabilityList,
    EmptyState,
    ErrorState,
    LoadingState,
    RateLimitNotice,
  ],
  template: `
    <div class="announce" role="status" aria-atomic="true">
      @if (done(); as text) {
        <div class="sn-alert sn-alert--info">
          <div class="sn-alert__body">{{ text }}</div>
        </div>
      }
    </div>
    @if (closeBlock.blocked()) {
      <sn-rate-limit-notice [retryAfterSeconds]="closeBlock.seconds() ?? null" />
    }
    @if (closeFailure(); as problem) {
      <sn-error-state
        [problem]="problem"
        description="A janela não foi encerrada. Ela continua como estava."
      />
    }

    @if (readFailure(); as failure) {
      @if (readRetryAfter() !== undefined) {
        <sn-rate-limit-notice [retryAfterSeconds]="readRetryAfter() ?? null" />
      } @else {
        <sn-error-state
          [problem]="failure"
          description="Nenhuma janela foi alterada."
          (retry)="reload()"
        />
      }
    } @else if (routine(); as lists) {
      @if (lists.inForce.length === 0 && lists.others.length === 0) {
        <sn-empty-state
          title="Nenhuma janela declarada ainda"
          description="Uma janela é um horário da semana em que você costuma estudar — por exemplo, terça das 19:00 às 21:00. Ela se repete toda semana a partir do dia que você escolher. Declare quantas quiser, abaixo."
        />
      } @else {
        <section class="block" [attr.aria-labelledby]="ids.inForce">
          <h2 class="h2" [id]="ids.inForce">Em vigor hoje</h2>
          @if (lists.inForce.length > 0) {
            <sn-availability-list
              [windows]="lists.inForce"
              [today]="today()"
              [busy]="busy()"
              (closeRequested)="close($event)"
            />
          } @else {
            <p class="body muted">
              Nenhuma das suas janelas vale hoje. As que você declarou estão abaixo, com o período
              de cada uma.
            </p>
          }
        </section>
        @if (lists.others.length > 0) {
          <section class="block" [attr.aria-labelledby]="ids.others">
            <h2 class="h2" [id]="ids.others">Fora de vigor hoje</h2>
            <p class="body muted">
              Janelas encerradas e janelas que só começam mais adiante. Uma janela encerrada não é
              apagada: ela continua registrada com o período em que valeu.
            </p>
            <sn-availability-list
              [windows]="lists.others"
              [today]="today()"
              [busy]="busy()"
              (closeRequested)="close($event)"
            />
          </section>
        }
      }
    } @else {
      <sn-loading-state label="Carregando suas janelas de estudo" [count]="3" />
    }

    <section class="block" [attr.aria-labelledby]="ids.add">
      <h2 class="h2" [id]="ids.add">Adicionar uma janela</h2>
      <div class="announce" role="alert" aria-atomic="true">
        @if (declareMessage(); as text) {
          <div class="sn-alert sn-alert--error">
            <div class="sn-alert__body">{{ text }}</div>
          </div>
        }
      </div>
      @if (declareBlock.blocked()) {
        <sn-rate-limit-notice [retryAfterSeconds]="declareBlock.seconds() ?? null" />
      }
      @if (declareFailure(); as problem) {
        <sn-error-state [problem]="problem" description="A janela não foi registrada." />
      }
      <sn-availability-form
        [today]="today()"
        [busy]="declaring() || declareBlock.blocked()"
        [serverProblems]="serverProblems()"
        (submitted)="declare($event)"
        (edited)="edited()"
      />
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-8);
    }
    .announce:empty {
      display: none;
    }
    .block {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      line-height: 24px;
    }
    .muted {
      margin: 0;
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvailabilitySection {
  private readonly api = inject(AvailabilityApi);
  private readonly time = inject(AccountTimeService);
  private readonly session = inject(SessionStore);

  /** The screen this section is on, for the guard chain after a 403. */
  readonly target = input.required<GuardTarget>();
  /** How many windows are on record (every window ever declared), whenever the list is read. */
  readonly declaredCount = output<number>();

  private readonly form = viewChild.required(AvailabilityForm);
  private readonly lists = viewChildren(AvailabilityList);

  protected readonly ids = {
    inForce: 'sn-availability-in-force',
    others: 'sn-availability-others',
    add: 'sn-availability-add',
  } as const;

  /** Today in the ACCOUNT's zone. Reactive on the zone, which the store sets from `/me/state`. */
  protected readonly today = computed(() => {
    this.time.zone();
    return this.time.today();
  });

  protected readonly inForce = this.api.windowsOn(() => this.today());
  protected readonly every = this.api.everyWindow();

  // `value()` throws while a resource is in error: read it only through `hasValue()`.
  protected readonly routine = computed(() => {
    const inForce = this.inForce.hasValue() ? this.inForce.value() : undefined;
    const every = this.every.hasValue() ? this.every.value() : undefined;
    return inForce === undefined || every === undefined ? null : splitRoutine(inForce, every);
  });

  protected readonly readFailure = computed<ApiFailure | null>(() => {
    const error = this.inForce.error() ?? this.every.error();
    return error === undefined ? null : apiFailureOf(error);
  });
  /** undefined: not rate-limited. */
  protected readonly readRetryAfter = computed<number | null | undefined>(() => {
    const failure = this.readFailure();
    return failure !== null && isRateLimitExceeded(failure) ? failure.retryAfterSeconds : undefined;
  });

  protected readonly declaring = signal(false);
  protected readonly closing = signal(false);
  protected readonly busy = computed(
    () => this.declaring() || this.closing() || this.closeBlock.blocked(),
  );
  protected readonly done = signal<string | null>(null);
  protected readonly declareMessage = signal<string | null>(null);
  protected readonly declareFailure = signal<ApiFailure | null>(null);
  protected readonly closeFailure = signal<ApiFailure | null>(null);
  protected readonly serverProblems = signal<DraftProblems>({});
  protected readonly declareBlock = new SubmitBlock();
  protected readonly closeBlock = new SubmitBlock();

  constructor() {
    effect(() => {
      const every = this.every.hasValue() ? this.every.value() : undefined;
      if (every !== undefined) {
        this.declaredCount.emit(every.length);
      }
    });
  }

  protected reload(): void {
    this.inForce.reload();
    this.every.reload();
  }

  protected edited(): void {
    this.serverProblems.set({});
    this.declareMessage.set(null);
    this.declareBlock.edited();
  }

  protected async declare(draft: AvailabilityDraft): Promise<void> {
    if (this.declaring() || this.declareBlock.blocked()) {
      return;
    }
    this.declaring.set(true);
    this.done.set(null);
    this.declareMessage.set(null);
    this.declareFailure.set(null);
    this.serverProblems.set({});
    const outcome = await this.api.declare(draft);
    this.declaring.set(false);
    switch (outcome.kind) {
      case 'declared': {
        this.form().reset();
        const window = outcome.window;
        this.done.set(
          window === null
            ? 'Janela adicionada.'
            : `Janela adicionada: ${this.describe(window)}, ${this.periodOf(window)}.`,
        );
        await this.afterWrite();
        return;
      }
      case 'invalid':
        this.serverProblems.set(outcome.fields);
        if (outcome.formLevel) {
          this.declareMessage.set(TEXT.invalid);
        }
        this.form().focusFirstInvalid();
        return;
      case 'overlaps':
        this.declareMessage.set(
          TEXT.overlaps(
            draft.dayOfWeek === ''
              ? 'esse dia'
              : DAY_OF_WEEK_LABELS[draft.dayOfWeek].toLocaleLowerCase('pt-BR'),
          ),
        );
        return;
      case 'not-processable':
        this.declareMessage.set(TEXT.notProcessable);
        await this.session.settle(this.target());
        return;
      case 'rate-limited':
        this.declareBlock.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.declareFailure.set(outcome.failure);
        return;
    }
  }

  protected async close(request: ClosingRequest): Promise<void> {
    if (this.closing()) {
      return;
    }
    this.closing.set(true);
    this.done.set(null);
    this.closeFailure.set(null);
    const outcome = await this.api.close(request.window.id, request.effectiveUntil);
    this.closing.set(false);
    switch (outcome.kind) {
      case 'closed':
        this.lists().forEach((list) => list.done());
        this.done.set(
          `Janela encerrada: ${this.describe(request.window)}. Ela continua registrada, valendo até ${this.time.formatLocalDate(request.effectiveUntil)}, inclusive.`,
        );
        await this.afterWrite();
        return;
      case 'already-closed':
        this.lists().forEach((list) => list.done());
        this.done.set(TEXT.alreadyClosed);
        this.reload();
        return;
      case 'gone':
        this.lists().forEach((list) => list.done());
        this.done.set(TEXT.gone);
        this.reload();
        return;
      case 'not-processable':
        this.done.set(TEXT.notProcessable);
        await this.session.settle(this.target());
        return;
      case 'rate-limited':
        this.closeBlock.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.closeFailure.set(outcome.failure);
        return;
    }
  }

  /** After a write: both lists again, and `/me/state` — whose `setupComplete` is the server's word. */
  private async afterWrite(): Promise<void> {
    this.reload();
    await this.session.refresh();
  }

  private describe(window: AvailabilityWindow): string {
    return `${DAY_OF_WEEK_LABELS[window.dayOfWeek]}, das ${window.startTime} às ${window.endTime}`;
  }

  private periodOf(window: AvailabilityWindow): string {
    const from = this.time.formatLocalDate(window.effectiveFrom);
    return window.effectiveUntil === null
      ? `a partir de ${from}`
      : `de ${from} a ${this.time.formatLocalDate(window.effectiveUntil)}`;
  }
}
