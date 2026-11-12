import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import type { ApiFailure } from '../../../core/api/api-problem';
import { SessionStore } from '../../../core/session/session-store';
import { SubmitBlock } from '../../../shared/forms/submit-block';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { GenerationWatch } from '../data/generation-watch';
import { PlanApi } from '../data/plan-api';
import { GenerationFailure } from '../ui/generation-failure';
import { GenerationProgress } from '../ui/generation-progress';

const TEXT = {
  noPlanTitle: 'Você ainda não tem um plano',
  noPlanBody:
    'Um plano distribui os tópicos das suas metas pelos seus horários de estudo de um período curto e fixo a partir de hoje, numa ordem que respeita os pré-requisitos.',
  joined:
    'Já havia um pedido de plano em andamento — feito há pouco, talvez em outra aba. Esta tela passou a acompanhá-lo; nenhum pedido novo foi feito.',
  finishedMeanwhile:
    'Havia um pedido de plano em andamento, e ele terminou nesse meio-tempo. A tela foi atualizada.',
  nothingToPlan:
    'O servidor ainda não vê o que planejar: é preciso ao menos uma meta ativa e uma janela de estudo que valha nas próximas semanas.',
  notProcessable:
    'Os dados de aprendizagem desta conta não podem ser processados agora, e por isso nenhum plano pode ser pedido.',
  lost: 'O pedido acompanhado não foi encontrado nesta conta. A tela foi atualizada.',
  ready: 'Seu plano está pronto.',
} as const;

/**
 * Asking for a plan, and following the request until it ends — on `/hoje` when there is no plan,
 * and on `/plano` to ask for a new one (re-planning, closed decision F6: manual, a new plan that
 * supersedes the one in force).
 *
 * A request already under way is never asked for again: the session state's
 * `activeGenerationJobId` is followed instead (the wait survives a reload and a change of screen).
 * A 409 can still happen — another tab — and its TYPE says which of its two meanings it is (R6):
 * `conflict`, a job is running → `/me/state` is read again through the store to find it, and it is
 * followed; `setup-incomplete` → `settle`, and the guard chain takes the person to setup. 403 →
 * `settle`. 429 → the wait is told and the action stays disabled for it; nothing asks again on its
 * own (10 per hour per account, and every POST spends one, 409s included).
 *
 * In `replan` mode the panel shows only what there is to follow (a wait, a failure, a note); the
 * action and its consequence, written out before the button, are the page's (`askToReplan`), at
 * the end of `/plano`, so that the order on screen is the order in the document.
 *
 * Re-planning is confirmed with an ORDINARY dialog, after the consequence is written on the screen:
 * nothing is deleted (the plan in force becomes a record, its sessions are kept, what was studied
 * stays recorded) and asking again is always possible — so not the typed-word confirmation, which
 * this client reserves for an act that suspends the account or ends its sessions (FE-5).
 */
@Component({
  selector: 'sn-plan-generation-panel',
  providers: [GenerationWatch],
  imports: [
    ConfirmDialog,
    EmptyState,
    ErrorState,
    GenerationFailure,
    GenerationProgress,
    RateLimitNotice,
  ],
  template: `
    <div class="announce" role="status" aria-atomic="true">
      @if (note(); as text) {
        <div class="sn-alert sn-alert--info">
          <div class="sn-alert__body">{{ text }}</div>
        </div>
      }
    </div>
    @if (block.blocked()) {
      <sn-rate-limit-notice [retryAfterSeconds]="block.seconds() ?? null" />
    }
    @if (requestFailure(); as problem) {
      <sn-error-state [problem]="problem" description="Nenhum plano foi pedido." />
    }

    @switch (view()) {
      @case ('waiting') {
        @if (watch.job(); as job) {
          <sn-generation-progress
            [job]="job"
            [elapsedMs]="watch.elapsedMs()"
            [stopped]="watch.halt()?.kind === 'ceiling'"
            [checkFailed]="watch.checkFailure() !== null"
            [busy]="watch.busy()"
            (checkNow)="watch.checkNow()"
          />
        }
      }
      @case ('opening') {
        <p class="body" role="status">Consultando o pedido em andamento…</p>
      }
      @case ('ready') {
        <p class="body" role="status">{{ text.ready }} Abrindo o plano…</p>
      }
      @case ('failed') {
        @if (failureReason(); as reason) {
          <sn-generation-failure
            [reason]="reason"
            [hasPlan]="mode() === 'replan'"
            [busy]="requesting() || block.blocked()"
            (retry)="ask()"
            (dismiss)="dismiss()"
          />
        }
      }
      @case ('idle') {
        @if (mode() === 'start') {
          <sn-empty-state
            [title]="text.noPlanTitle"
            [description]="text.noPlanBody"
            [actionLabel]="requesting() || block.blocked() ? undefined : 'Gerar meu plano'"
            (action)="ask()"
          />
          @if (requesting()) {
            <p class="body center" role="status">Enviando o pedido…</p>
          }
        }
      }
    }

    @if (confirming()) {
      <sn-confirm-dialog
        heading="Gerar um plano novo?"
        confirmLabel="Gerar plano novo"
        [busy]="requesting()"
        (cancelled)="confirming.set(false)"
        (confirmed)="confirmReplan()"
      >
        <p class="dialog-text">
          O plano atual deixa de valer assim que o novo ficar pronto, e as sessões futuras dele saem
          do caminho. Ele continua no histórico, com as sessões dele, e o que você já estudou
          continua registrado. Não há como voltar a ele: para mudar de novo, peça outro plano.
        </p>
      </sn-confirm-dialog>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .announce:empty {
      display: none;
    }
    .body {
      margin: 0;
    }
    .center {
      text-align: center;
    }
    .muted {
      color: var(--ink-muted);
    }
    .dialog-text {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanGenerationPanel {
  private readonly api = inject(PlanApi);
  private readonly session = inject(SessionStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly watch = inject(GenerationWatch);

  /** `start`: there is no plan. `replan`: a plan is in force, and a new one would supersede it. */
  readonly mode = input.required<'start' | 'replan'>();
  /** A job ended READY: its plan is the plan in force now. `/me/state` has been read again. */
  readonly ready = output<string>();
  /** Something about the plan in force may have changed without a READY here. */
  readonly changed = output<void>();
  /** True while a job is being followed, for the page around the panel. */
  readonly following = output<boolean>();
  /** The person put away the account of a request that ended without a plan. */
  readonly dismissed = output<void>();

  protected readonly text = TEXT;
  protected readonly requesting = signal(false);
  protected readonly confirming = signal(false);
  protected readonly note = signal<string | null>(null);
  protected readonly requestFailure = signal<ApiFailure | null>(null);
  protected readonly block = new SubmitBlock();
  /** The job whose failure the person has read and put away. */
  private readonly putAway = signal<string | null>(null);
  /** Terminal jobs already acted on, so the effect acts once per job. */
  private readonly handled = new Set<string>();
  /** A job known by its id is being read for the first time. */
  private readonly opening = signal(false);

  protected readonly view = computed<'idle' | 'opening' | 'waiting' | 'failed' | 'ready'>(() => {
    const job = this.watch.job();
    if (job === null) {
      return this.opening() ? 'opening' : 'idle';
    }
    switch (job.status) {
      case 'PENDING':
      case 'RUNNING':
        return 'waiting';
      case 'READY':
        // On /hoje the page leaves for the plan: no empty state flashes in between.
        return 'ready';
      case 'FAILED':
      case 'CANCELLED':
        return this.putAway() === job.id ? 'idle' : 'failed';
    }
  });

  protected readonly failureReason = computed(() => {
    const job = this.watch.job();
    if (job?.status === 'CANCELLED') {
      return 'cancelled' as const;
    }
    return job?.status === 'FAILED' ? job.failureReason : null;
  });

  constructor() {
    // Follow the job the session state names — on arrival, and whenever a refresh names a new one
    // (a request from another tab, found after a 409).
    effect(() => {
      const id = this.session.state()?.activeGenerationJobId ?? null;
      untracked(() => {
        if (id !== null && this.watch.job()?.id !== id) {
          this.follow(id);
        }
      });
    });

    effect(() => {
      const job = this.watch.job();
      if (job !== null) {
        this.opening.set(false);
      }
      untracked(() => this.following.emit(job !== null && this.watch.isWaiting()));
      if (job === null || this.handled.has(job.id)) {
        return;
      }
      const status = job.status;
      if (status === 'READY' || status === 'FAILED' || status === 'CANCELLED') {
        this.handled.add(job.id);
        untracked(() => void this.afterEnd(status, job.planId));
      }
    });

    effect(() => {
      const halt = this.watch.halt();
      untracked(() => {
        if (halt?.kind === 'not-processable') {
          this.opening.set(false);
          this.note.set(TEXT.notProcessable);
          void this.session.settle('app');
        } else if (halt?.kind === 'lost') {
          this.opening.set(false);
          this.watch.reset();
          this.note.set(TEXT.lost);
          void this.session.refresh().then(() => this.changed.emit());
        } else if (halt?.kind === 'rate-limited') {
          this.opening.set(false);
          this.block.block(halt.retryAfterSeconds);
        }
      });
    });
  }

  /** Asks for a plan — or, if one is already being made, follows it instead. */
  async ask(): Promise<void> {
    if (this.requesting() || this.block.blocked()) {
      return;
    }
    this.note.set(null);
    this.requestFailure.set(null);
    const running = this.session.state()?.activeGenerationJobId ?? null;
    if (running !== null) {
      this.follow(running);
      return;
    }
    this.requesting.set(true);
    const outcome = await this.api.requestGeneration();
    this.requesting.set(false);
    switch (outcome.kind) {
      case 'queued':
        this.putAway.set(null);
        this.watch.watch(outcome.job);
        this.focusAfterRender('#sn-generation-heading');
        // Asking for a plan changes /me/state (`activeGenerationJobId`): read it again, so the wait
        // survives a change of screen or a reload.
        void this.session.refresh();
        return;
      case 'already-running': {
        const after = await this.session.refresh();
        const id = after.kind === 'signed-in' ? after.state.activeGenerationJobId : null;
        if (id !== null) {
          this.note.set(TEXT.joined);
          this.follow(id);
        } else {
          this.note.set(TEXT.finishedMeanwhile);
          this.changed.emit();
        }
        return;
      }
      case 'nothing-to-plan':
        this.note.set(TEXT.nothingToPlan);
        // `setupComplete` is now false on the server: the chain takes the person to setup.
        await this.session.settle('app');
        return;
      case 'not-processable':
        this.note.set(TEXT.notProcessable);
        await this.session.settle('app');
        return;
      case 'rate-limited':
        this.block.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.requestFailure.set(outcome.failure);
        return;
    }
  }

  /** True while a request is being sent or the rate limit holds: the re-plan action waits. */
  readonly blocked = computed(() => this.requesting() || this.block.blocked());

  /** Opens the re-plan confirmation (`replan` mode); the action itself lives on the page. */
  askToReplan(): void {
    if (!this.blocked() && !this.watch.isWaiting()) {
      this.note.set(null);
      this.confirming.set(true);
    }
  }

  protected async confirmReplan(): Promise<void> {
    await this.ask();
    this.confirming.set(false);
  }

  protected dismiss(): void {
    const job = this.watch.job();
    if (job !== null) {
      this.putAway.set(job.id);
    }
    this.dismissed.emit();
  }

  /** Moves focus to what replaced the control that was used, once it is rendered. */
  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => {
        const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
        if (target !== null) {
          target.setAttribute('tabindex', '-1');
          target.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private follow(id: string): void {
    this.putAway.set(null);
    this.opening.set(true);
    this.watch.watch(id);
  }

  private async afterEnd(
    status: 'READY' | 'FAILED' | 'CANCELLED',
    planId: string | null,
  ): Promise<void> {
    // Every end changes /me/state: the job is gone from it, and on READY the plan in force moved.
    await this.session.refresh();
    if (status === 'READY' && planId !== null) {
      if (this.mode() === 'replan') {
        // /plano stays and reads the new plan: back to the re-planning section, with a note.
        this.watch.reset();
        this.note.set(`${TEXT.ready} O plano anterior está no histórico.`);
      }
      this.ready.emit(planId);
    }
  }
}
