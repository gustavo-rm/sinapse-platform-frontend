import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { AccountTimeService } from '../../../core/time/account-time.service';
import { GOAL_STATUS_LABELS } from '../../../shared/labels/goal-status.labels';
import {
  type Goal,
  MOST_PRESSING,
  PRIORITIES,
  type Priority,
  type RevisionDraft,
  type Subject,
  revisionDraftOf,
  subjectNameOf,
  targetDateProblem,
} from '../model/goals';
import { PriorityField } from './priority-field';

/** A revision the person asked for: the goal as read, and both values of the form. */
export interface RevisionRequest {
  readonly goal: Goal;
  readonly draft: RevisionDraft;
}

let nextId = 0;

/**
 * Goals (GoalCard, the list). Each says its subject, its status in words, its priority — the five
 * pips of the artifact plus "Prioridade 4 de 5" in text — and the target date as the date the
 * student gave, nothing derived from it: no countdown, no "faltam", no bar toward it.
 *
 * Status is told by its word, in the same neutral badge for all three: no green for achieved, no
 * red for abandoned (semantic colour describes the system, never the student). A closed goal also
 * says when it was closed.
 *
 * With `actions`, an active goal offers revision (inline: the form starts from the values READ, and
 * sends both), achievement and abandonment (confirmed by the page).
 */
@Component({
  selector: 'sn-goal-list',
  imports: [PriorityField],
  template: `
    <ul class="list">
      @for (goal of goals(); track goal.id) {
        <li class="sn-goal">
          <div class="body">
            <h3 class="sn-goal__name">{{ nameOf(goal) }}</h3>
            <div class="sn-goal__meta">
              <span class="sn-badge">{{ statusOf(goal) }}</span>
              <span class="sn-prio" aria-hidden="true">
                @for (pip of pips; track pip) {
                  <span class="sn-prio__pip" [class.sn-prio__pip--on]="pip <= goal.priority"></span>
                }
              </span>
              <span>Prioridade {{ goal.priority }} de {{ most }}</span>
              <span>{{ dateOf(goal) }}</span>
              @if (goal.status !== 'ACTIVE' && goal.closedAt) {
                <span>{{ closedOf(goal) }}</span>
              }
            </div>
          </div>
          @if (actions() && goal.status === 'ACTIVE' && revising() !== goal.id) {
            <div class="actions">
              <button
                type="button"
                class="sn-btn sn-btn--secondary sn-btn--sm"
                [disabled]="busy()"
                [attr.data-goal]="goal.id"
                [attr.aria-label]="'Revisar a meta de ' + nameOf(goal)"
                (click)="openRevision(goal)"
              >
                Revisar
              </button>
              <button
                type="button"
                class="sn-btn sn-btn--secondary sn-btn--sm"
                [disabled]="busy()"
                [attr.aria-label]="'Marcar a meta de ' + nameOf(goal) + ' como alcançada'"
                (click)="achieve.emit(goal)"
              >
                Marcar como alcançada
              </button>
              <button
                type="button"
                class="sn-btn sn-btn--secondary sn-btn--sm"
                [disabled]="busy()"
                [attr.aria-label]="'Abandonar a meta de ' + nameOf(goal)"
                (click)="abandon.emit(goal)"
              >
                Abandonar
              </button>
            </div>
          }
          @if (revising() === goal.id) {
            <div
              class="sn-wrow__panel"
              role="group"
              [attr.aria-label]="'Revisar a meta de ' + nameOf(goal)"
            >
              <sn-priority-field
                [value]="draftPriority()"
                [disabled]="busy()"
                (changed)="draftPriority.set($event)"
              />
              <div class="sn-field" [class.sn-field--invalid]="dateError()">
                <label class="sn-field__label" [for]="id + '-date'">
                  Data-alvo <span class="sn-field__req">(opcional)</span>
                </label>
                <input
                  class="sn-input"
                  type="date"
                  [id]="id + '-date'"
                  [value]="draftDate()"
                  [disabled]="busy()"
                  (input)="draftDate.set($any($event.target).value)"
                  [attr.aria-invalid]="dateError() ? 'true' : null"
                  [attr.aria-describedby]="
                    dateError() ? id + '-date-hint ' + id + '-date-error' : id + '-date-hint'
                  "
                />
                <div class="sn-field__hint" [id]="id + '-date-hint'">
                  Em branco, a meta fica sem data-alvo.
                </div>
                @if (dateError(); as text) {
                  <div class="sn-field__error" [id]="id + '-date-error'">{{ text }}</div>
                }
              </div>
              <div class="panel-actions">
                <button
                  type="button"
                  class="sn-btn sn-btn--primary sn-btn--sm"
                  [disabled]="busy()"
                  [attr.aria-busy]="busy() ? 'true' : null"
                  (click)="submitRevision(goal)"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  class="sn-btn sn-btn--ghost sn-btn--sm"
                  [disabled]="busy()"
                  (click)="cancelRevision()"
                >
                  Cancelar
                </button>
              </div>
            </div>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .list > li:first-child {
      border-top: 0;
    }
    .body {
      min-width: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    .sn-goal {
      grid-template-columns: minmax(0, 1fr);
    }
    .sn-wrow__panel {
      margin-top: var(--space-1);
    }
    .panel-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalList {
  private readonly time = inject(AccountTimeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly goals = input.required<readonly Goal[]>();
  readonly subjects = input.required<readonly Subject[]>();
  /** Whether active goals offer revision, achievement and abandonment. */
  readonly actions = input(false);
  readonly busy = input(false);

  readonly revise = output<RevisionRequest>();
  readonly achieve = output<Goal>();
  readonly abandon = output<Goal>();

  protected readonly id = `sn-goal-list-${nextId++}`;
  protected readonly pips = PRIORITIES;
  protected readonly most = MOST_PRESSING;
  /** The goal whose revision panel is open. */
  protected readonly revising = signal<string | null>(null);
  protected readonly draftPriority = signal<Priority>(3);
  protected readonly draftDate = signal('');
  private readonly tried = signal(false);

  protected dateError(): string | null {
    return this.tried() && targetDateProblem(this.draftDate()) !== null
      ? 'Informe uma data válida, ou deixe em branco.'
      : null;
  }

  /** Closes the revision panel: called by the page once the server answered. */
  done(): void {
    this.revising.set(null);
  }

  protected nameOf(goal: Goal): string {
    return subjectNameOf(goal, this.subjects()) ?? 'Disciplina que não está mais no catálogo';
  }

  protected statusOf(goal: Goal): string {
    return GOAL_STATUS_LABELS[goal.status];
  }

  protected dateOf(goal: Goal): string {
    return goal.targetDate === null
      ? 'Sem data-alvo'
      : `Data-alvo: ${this.time.formatLocalDate(goal.targetDate)}`;
  }

  protected closedOf(goal: Goal): string {
    return goal.closedAt === null
      ? ''
      : `Encerrada em ${this.time.formatInstant(goal.closedAt, 'date')}`;
  }

  /** Opens the revision with the values READ for this goal (never values remembered from before). */
  protected openRevision(goal: Goal): void {
    const draft = revisionDraftOf(goal);
    this.tried.set(false);
    this.draftPriority.set(draft.priority);
    this.draftDate.set(draft.targetDate);
    this.revising.set(goal.id);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLInputElement>('.sn-prio-field input:checked')
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected cancelRevision(): void {
    const id = this.revising();
    this.revising.set(null);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLButtonElement>(`button[data-goal="${id}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected submitRevision(goal: Goal): void {
    this.tried.set(true);
    if (targetDateProblem(this.draftDate()) !== null) {
      return;
    }
    this.revise.emit({
      goal,
      draft: { priority: this.draftPriority(), targetDate: this.draftDate() },
    });
  }
}
