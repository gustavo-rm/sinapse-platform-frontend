import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { ApiFailure } from '../../../core/api/api-problem';
import {
  DEFAULT_PRIORITY,
  type GoalDraft,
  type Priority,
  type Subject,
  type Topic,
  targetDateProblem,
} from '../model/goals';
import { PriorityField } from './priority-field';
import { SubjectPicker } from './subject-picker';
import { TopicContext } from './topic-context';

let nextId = 0;

/**
 * Setting a goal (GoalCard, its form): a subject, optionally a target date, a priority. Three
 * things and no fourth — no effort, no difficulty, no self-assessment (closed decision L1: effort
 * comes from the curated `effortTier`, and "o aluno não informa nada").
 *
 * The target date is introduced as what it is — a constraint that weighs on what comes first — and
 * never as an end of anything: no "your plan will cover until…", no countdown (closed decision F3:
 * the horizon is four weeks whatever the date).
 *
 * The topics of the chosen subject are shown under the fields, as context, before the action.
 */
@Component({
  selector: 'sn-goal-form',
  imports: [PriorityField, SubjectPicker, TopicContext],
  template: `
    <form class="form" (submit)="$event.preventDefault(); submit()" novalidate>
      <sn-subject-picker
        [subjects]="subjects()"
        [selected]="subjectId()"
        [disabled]="busy()"
        (chosen)="choose($event)"
      />
      @if (subjectError()) {
        <div class="sn-field__error" role="alert">Escolha a disciplina da meta.</div>
      }

      <div class="sn-field" [class.sn-field--invalid]="dateError()">
        <label class="sn-field__label" [for]="id + '-date'">
          Data-alvo <span class="sn-field__req">(opcional)</span>
        </label>
        <input
          class="sn-input"
          type="date"
          [id]="id + '-date'"
          [value]="targetDate()"
          [disabled]="busy()"
          (input)="editDate($any($event.target).value)"
          [attr.aria-invalid]="dateError() ? 'true' : null"
          [attr.aria-describedby]="
            dateError() ? id + '-date-hint ' + id + '-date-error' : id + '-date-hint'
          "
        />
        <div class="sn-field__hint" [id]="id + '-date-hint'">
          Quando você gostaria de ter estudado esta disciplina. A data pesa na decisão do que vem
          primeiro; não define até quando o estudo é planejado.
        </div>
        @if (dateError(); as text) {
          <div class="sn-field__error" [id]="id + '-date-error'">{{ text }}</div>
        }
      </div>

      <sn-priority-field
        [value]="priority()"
        [disabled]="busy()"
        (changed)="editPriority($event)"
      />
      @if (serverFields().has('priority')) {
        <div class="sn-field__error" role="alert">A prioridade vai de 1 a 5.</div>
      }

      @if (chosenSubject(); as subject) {
        <sn-topic-context
          [subjectName]="subject.name"
          [topics]="topics()"
          [failure]="topicsFailure()"
          [headingId]="id + '-topics'"
          (retry)="retryTopics.emit()"
        />
      }

      <button type="submit" class="sn-btn sn-btn--primary" [disabled]="busy()">
        @if (busy()) {
          Definindo…
        } @else if (chosenSubject(); as subject) {
          Definir meta de {{ subject.name }}
        } @else {
          Definir meta
        }
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .form > button {
      align-self: flex-start;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalForm {
  /** The subjects a goal can be set for: those with no active goal. */
  readonly subjects = input.required<readonly Subject[]>();
  /** The topics of the chosen subject, or undefined while they load. */
  readonly topics = input<readonly Topic[] | undefined>(undefined);
  readonly topicsFailure = input<ApiFailure | null>(null);
  readonly busy = input(false);
  /** Fields the server refused on the last submit. */
  readonly serverFields = input<ReadonlySet<'priority' | 'targetDate'>>(new Set());

  readonly subjectChosen = output<string | null>();
  readonly submitted = output<GoalDraft>();
  readonly retryTopics = output<void>();
  readonly edited = output<void>();

  protected readonly id = `sn-goal-form-${nextId++}`;
  protected readonly subjectId = signal<string | null>(null);
  protected readonly targetDate = signal('');
  protected readonly priority = signal<Priority>(DEFAULT_PRIORITY);
  private readonly tried = signal(false);

  protected readonly chosenSubject = computed(
    () => this.subjects().find((subject) => subject.id === this.subjectId()) ?? null,
  );
  protected readonly subjectError = computed(() => this.tried() && this.chosenSubject() === null);
  protected readonly dateError = computed(() => {
    if (this.serverFields().has('targetDate')) {
      return 'Informe uma data válida, ou deixe em branco.';
    }
    return this.tried() && targetDateProblem(this.targetDate()) !== null
      ? 'Informe uma data válida, ou deixe em branco.'
      : null;
  });

  /** After a goal was set: an empty form, with the default priority. */
  reset(): void {
    this.tried.set(false);
    this.subjectId.set(null);
    this.targetDate.set('');
    this.priority.set(DEFAULT_PRIORITY);
    this.subjectChosen.emit(null);
  }

  protected choose(id: string): void {
    this.subjectId.set(id);
    this.subjectChosen.emit(id);
    this.edited.emit();
  }

  protected editDate(value: string): void {
    this.targetDate.set(value);
    this.edited.emit();
  }

  protected editPriority(value: Priority): void {
    this.priority.set(value);
    this.edited.emit();
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.tried.set(true);
    const subject = this.chosenSubject();
    if (subject === null || targetDateProblem(this.targetDate()) !== null) {
      return;
    }
    this.submitted.emit({
      subjectId: subject.id,
      targetDate: this.targetDate(),
      priority: this.priority(),
    });
  }
}
