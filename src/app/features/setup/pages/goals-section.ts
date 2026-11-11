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
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';
import { GoalsApi } from '../data/goals-api';
import {
  type Goal,
  type GoalActOutcome,
  type GoalDraft,
  activeGoals,
  closedGoals,
  subjectNameOf,
  subjectsOpenForGoal,
} from '../model/goals';
import { GoalForm } from '../ui/goal-form';
import { GoalList, type RevisionRequest } from '../ui/goal-list';

/** How a goal can be closed. */
type Closing = 'abandon' | 'achieve';

const TEXT = {
  duplicate:
    'Esta disciplina já tem uma meta ativa — provavelmente definida agora há pouco, em outra aba. A lista foi atualizada.',
  unknownSubject: 'Esta disciplina não está mais no catálogo. A lista foi atualizada.',
  invalid: 'Os dados da meta não foram aceitos. Confira os campos e tente de novo.',
  notProcessable:
    'Os dados de aprendizagem desta conta não podem ser processados agora, e por isso a meta não foi alterada.',
  closed:
    'Esta meta já tinha sido encerrada, e não pode mais ser alterada. A lista foi atualizada.',
  gone: 'Esta meta não foi encontrada nesta conta. A lista foi atualizada.',
} as const;

/**
 * Goals, as `/configurar` (step 2) and `/conta/metas` show them — one component, two modes.
 *
 * - `setup`: the active goals and the form. Nothing else asks for attention on the gate screen.
 * - `account`: also revision, achievement and abandonment of an active goal, and the closed goals —
 *   "what was abandoned is part of what the student has decided" — told apart by their status in
 *   words, never by a judging colour.
 *
 * The form offers only subjects with no active goal (at most one per subject); a 409 from a race
 * is still answered. After every write the goals are read again, and so is `/me/state`.
 */
@Component({
  selector: 'sn-goals-section',
  imports: [
    ConfirmDialog,
    EmptyState,
    ErrorState,
    GoalForm,
    GoalList,
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
    @if (actBlock.blocked()) {
      <sn-rate-limit-notice [retryAfterSeconds]="actBlock.seconds() ?? null" />
    }
    @if (actFailure(); as problem) {
      <sn-error-state [problem]="problem" description="A meta continua como estava." />
    }

    @if (readFailure(); as failure) {
      @if (readRetryAfter() !== undefined) {
        <sn-rate-limit-notice [retryAfterSeconds]="readRetryAfter() ?? null" />
      } @else {
        <sn-error-state
          [problem]="failure"
          description="Nenhuma meta foi alterada."
          (retry)="reload()"
        />
      }
    } @else if (view(); as lists) {
      <section class="block" [attr.aria-labelledby]="ids.active">
        <h2 class="h2" [id]="ids.active">
          {{ mode() === 'setup' ? 'Suas metas' : 'Metas ativas' }}
        </h2>
        @if (lists.active.length > 0) {
          <sn-goal-list
            [goals]="lists.active"
            [subjects]="lists.subjects"
            [actions]="mode() === 'account'"
            [busy]="busy()"
            (revise)="revise($event)"
            (abandon)="ask($event, 'abandon')"
            (achieve)="ask($event, 'achieve')"
          />
        } @else {
          <sn-empty-state
            title="Nenhuma meta ativa"
            description="Uma meta é uma disciplina inteira que você quer estudar. Todos os tópicos dela entram; você escolhe a disciplina, e se quiser uma data-alvo e uma prioridade."
          />
        }
      </section>

      @if (mode() === 'account' && lists.closed.length > 0) {
        <section class="block" [attr.aria-labelledby]="ids.closed">
          <h2 class="h2" [id]="ids.closed">Metas encerradas</h2>
          <p class="body muted">
            Alcançadas e abandonadas. Encerrar uma meta não a apaga: ela continua aqui, como parte
            do que você decidiu.
          </p>
          <sn-goal-list [goals]="lists.closed" [subjects]="lists.subjects" />
        </section>
      }

      <section class="block" [attr.aria-labelledby]="ids.add">
        <h2 class="h2" [id]="ids.add">Definir uma meta</h2>
        <div class="announce" role="alert" aria-atomic="true">
          @if (setMessage(); as text) {
            <div class="sn-alert sn-alert--error">
              <div class="sn-alert__body">{{ text }}</div>
            </div>
          }
        </div>
        @if (setBlock.blocked()) {
          <sn-rate-limit-notice [retryAfterSeconds]="setBlock.seconds() ?? null" />
        }
        @if (setFailure(); as problem) {
          <sn-error-state [problem]="problem" description="A meta não foi definida." />
        }
        @if (lists.subjects.length === 0) {
          <sn-empty-state
            title="O catálogo ainda não tem disciplinas"
            description="Sem uma disciplina não há como definir uma meta. O catálogo é carregado por quem administra o SINAPSE; quando houver disciplinas, elas aparecem aqui."
          />
        } @else if (lists.open.length === 0) {
          <sn-empty-state
            title="Todas as disciplinas já têm uma meta ativa"
            [description]="allTakenText()"
          />
        } @else {
          <sn-goal-form
            [subjects]="lists.open"
            [topics]="topicsRead()"
            [topicsFailure]="topicsFailure()"
            [busy]="setting() || setBlock.blocked()"
            [serverFields]="serverFields()"
            (subjectChosen)="chosen.set($event)"
            (submitted)="set($event)"
            (retryTopics)="topics.reload()"
            (edited)="edited()"
          />
        }
      </section>
    } @else {
      <sn-loading-state label="Carregando suas metas" shape="cards" [count]="2" />
    }

    @if (asking(); as question) {
      <sn-confirm-dialog
        [heading]="dialogHeading(question.goal, question.closing)"
        [confirmLabel]="question.closing === 'abandon' ? 'Abandonar meta' : 'Marcar como alcançada'"
        [busy]="acting()"
        (cancelled)="asking.set(null)"
        (confirmed)="closeGoal(question.goal, question.closing)"
      >
        <p class="dialog-text">{{ dialogText(question.closing) }}</p>
      </sn-confirm-dialog>
    }
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
    .dialog-text {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalsSection {
  private readonly api = inject(GoalsApi);
  private readonly session = inject(SessionStore);
  private readonly time = inject(AccountTimeService);

  readonly mode = input.required<'setup' | 'account'>();
  /** The screen this section is on, for the guard chain after a 403. */
  readonly target = input.required<GuardTarget>();
  /** How many goals are active, whenever the goals are read. */
  readonly activeCount = output<number>();

  private readonly form = viewChild(GoalForm);
  private readonly lists = viewChildren(GoalList);

  protected readonly ids = {
    active: 'sn-goals-active',
    closed: 'sn-goals-closed',
    add: 'sn-goals-add',
  } as const;

  protected readonly goals = this.api.goals();
  protected readonly subjects = this.api.subjects();
  /** The subject chosen in the form, whose topics are shown as context. */
  protected readonly chosen = signal<string | null>(null);
  protected readonly topics = this.api.topics(() => this.chosen());

  protected readonly view = computed(() => {
    // `value()` throws while a resource is in error: read it only through `hasValue()`.
    const goals = this.goals.hasValue() ? this.goals.value() : undefined;
    const subjects = this.subjects.hasValue() ? this.subjects.value() : undefined;
    if (goals === undefined || subjects === undefined) {
      return null;
    }
    return {
      subjects,
      active: activeGoals(goals),
      closed: closedGoals(goals),
      open: subjectsOpenForGoal(subjects, goals),
    };
  });

  protected readonly readFailure = computed<ApiFailure | null>(() => {
    const error = this.goals.error() ?? this.subjects.error();
    return error === undefined ? null : apiFailureOf(error);
  });
  protected readonly readRetryAfter = computed<number | null | undefined>(() => {
    const failure = this.readFailure();
    return failure !== null && isRateLimitExceeded(failure) ? failure.retryAfterSeconds : undefined;
  });
  protected readonly topicsRead = computed(() =>
    this.topics.hasValue() ? this.topics.value() : undefined,
  );
  protected readonly topicsFailure = computed<ApiFailure | null>(() => {
    const error = this.topics.error();
    return error === undefined ? null : apiFailureOf(error);
  });

  protected readonly setting = signal(false);
  protected readonly acting = signal(false);
  protected readonly busy = computed(() => this.acting() || this.actBlock.blocked());
  protected readonly done = signal<string | null>(null);
  protected readonly setMessage = signal<string | null>(null);
  protected readonly setFailure = signal<ApiFailure | null>(null);
  protected readonly actFailure = signal<ApiFailure | null>(null);
  protected readonly serverFields = signal<ReadonlySet<'priority' | 'targetDate'>>(new Set());
  protected readonly asking = signal<{ readonly goal: Goal; readonly closing: Closing } | null>(
    null,
  );
  protected readonly setBlock = new SubmitBlock();
  protected readonly actBlock = new SubmitBlock();

  constructor() {
    effect(() => {
      const goals = this.goals.hasValue() ? this.goals.value() : undefined;
      if (goals !== undefined) {
        this.activeCount.emit(activeGoals(goals).length);
      }
    });
  }

  protected reload(): void {
    this.goals.reload();
    this.subjects.reload();
  }

  protected allTakenText(): string {
    return this.mode() === 'account'
      ? 'Há no máximo uma meta ativa por disciplina. Para definir outra meta para uma disciplina, encerre antes a que está ativa.'
      : 'Há no máximo uma meta ativa por disciplina, e todas as do catálogo já têm a sua.';
  }

  protected edited(): void {
    this.serverFields.set(new Set());
    this.setMessage.set(null);
    this.setBlock.edited();
  }

  protected async set(draft: GoalDraft): Promise<void> {
    if (this.setting() || this.setBlock.blocked()) {
      return;
    }
    this.setting.set(true);
    this.done.set(null);
    this.setMessage.set(null);
    this.setFailure.set(null);
    this.serverFields.set(new Set());
    const outcome = await this.api.set(draft);
    this.setting.set(false);
    const name = this.nameOfSubject(draft.subjectId);
    switch (outcome.kind) {
      case 'set':
        this.form()?.reset();
        this.done.set(`Meta definida: ${name}, com prioridade ${draft.priority} de 5.`);
        await this.afterWrite();
        return;
      case 'duplicate':
        this.form()?.reset();
        this.setMessage.set(TEXT.duplicate);
        this.reload();
        return;
      case 'unknown-subject':
        this.form()?.reset();
        this.setMessage.set(TEXT.unknownSubject);
        this.reload();
        return;
      case 'invalid':
        this.serverFields.set(outcome.fields);
        this.setMessage.set(TEXT.invalid);
        return;
      case 'not-processable':
        this.setMessage.set(TEXT.notProcessable);
        await this.session.settle(this.target());
        return;
      case 'rate-limited':
        this.setBlock.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.setFailure.set(outcome.failure);
        return;
    }
  }

  protected async revise(request: RevisionRequest): Promise<void> {
    if (this.acting()) {
      return;
    }
    const name = this.nameOf(request.goal);
    await this.act(this.api.revise(request.goal.id, request.draft), (goal) => {
      const read = goal === null ? request.draft.targetDate : (goal.targetDate ?? '');
      const date = read === '' ? 'sem data-alvo' : `data-alvo ${this.time.formatLocalDate(read)}`;
      return `Meta de ${name} revisada: prioridade ${goal?.priority ?? request.draft.priority} de 5, ${date}.`;
    });
  }

  protected ask(goal: Goal, closing: Closing): void {
    this.done.set(null);
    this.actFailure.set(null);
    this.asking.set({ goal, closing });
  }

  protected dialogHeading(goal: Goal, closing: Closing): string {
    const name = this.nameOf(goal);
    return closing === 'abandon'
      ? `Abandonar a meta de ${name}?`
      : `Marcar a meta de ${name} como alcançada?`;
  }

  protected dialogText(closing: Closing): string {
    return closing === 'abandon'
      ? 'A meta não é apagada: ela fica registrada como abandonada, com a data de hoje, e sai das metas ativas. A disciplina fica livre para uma nova meta.'
      : 'A meta fica registrada como alcançada, com a data de hoje, e sai das metas ativas. A disciplina fica livre para uma nova meta.';
  }

  protected async closeGoal(goal: Goal, closing: Closing): Promise<void> {
    if (this.acting()) {
      return;
    }
    const name = this.nameOf(goal);
    const request = closing === 'abandon' ? this.api.abandon(goal.id) : this.api.achieve(goal.id);
    await this.act(request, () =>
      closing === 'abandon'
        ? `Meta de ${name} abandonada. Ela continua registrada, em Metas encerradas.`
        : `Meta de ${name} marcada como alcançada. Ela continua registrada, em Metas encerradas.`,
    );
    this.asking.set(null);
  }

  private async act(
    request: Promise<GoalActOutcome>,
    doneText: (goal: Goal | null) => string,
  ): Promise<void> {
    this.acting.set(true);
    this.done.set(null);
    this.actFailure.set(null);
    const outcome = await request;
    this.acting.set(false);
    switch (outcome.kind) {
      case 'done':
        this.lists().forEach((list) => list.done());
        this.done.set(doneText(outcome.goal));
        await this.afterWrite();
        return;
      case 'closed':
        this.lists().forEach((list) => list.done());
        this.done.set(TEXT.closed);
        this.reload();
        return;
      case 'gone':
        this.lists().forEach((list) => list.done());
        this.done.set(TEXT.gone);
        this.reload();
        return;
      case 'invalid':
        this.done.set(TEXT.invalid);
        return;
      case 'not-processable':
        this.done.set(TEXT.notProcessable);
        await this.session.settle(this.target());
        return;
      case 'rate-limited':
        this.actBlock.block(outcome.retryAfterSeconds);
        return;
      case 'failed':
        this.actFailure.set(outcome.failure);
        return;
    }
  }

  /** After a write: the goals again, and `/me/state` — whose `setupComplete` is the server's word. */
  private async afterWrite(): Promise<void> {
    this.goals.reload();
    await this.session.refresh();
  }

  private nameOf(goal: Goal): string {
    return subjectNameOf(goal, this.view()?.subjects ?? []) ?? 'disciplina';
  }

  private nameOfSubject(subjectId: string): string {
    return (
      (this.view()?.subjects ?? []).find((subject) => subject.id === subjectId)?.name ??
      'disciplina'
    );
  }
}
