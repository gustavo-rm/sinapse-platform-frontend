import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  type OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DAYS_OF_WEEK, type DayOfWeek } from '../../../core/api/contract/enums';
import { DAY_OF_WEEK_LABELS } from '../../../shared/labels/day-of-week.labels';
import {
  type AvailabilityDraft,
  type AvailabilityField,
  type DraftProblem,
  type DraftProblems,
  draftProblems,
} from '../model/availability';

/** What each refusal says, by field. The server's `errors[].message` is never shown (D3). */
function messageFor(field: AvailabilityField, problem: DraftProblem): string {
  switch (problem) {
    case 'end-not-after-start':
      return 'O fim precisa ser depois do início. Uma janela começa e termina no mesmo dia: não passa da meia-noite.';
    case 'until-before-from':
      return 'O último dia não pode vir antes do primeiro.';
    case 'required':
      switch (field) {
        case 'dayOfWeek':
          return 'Escolha o dia da semana.';
        case 'startTime':
          return 'Informe a hora em que a janela começa.';
        case 'endTime':
          return 'Informe a hora em que a janela termina.';
        case 'effectiveFrom':
          return 'Informe a partir de que dia a janela vale.';
        case 'effectiveUntil':
          return 'Informe uma data válida, ou deixe em branco.';
      }
      break;
    case 'invalid':
      switch (field) {
        case 'dayOfWeek':
          return 'Escolha o dia da semana.';
        case 'startTime':
          return 'Informe a hora como 19:00.';
        case 'endTime':
          return 'Informe a hora como 21:00.';
        case 'effectiveFrom':
          return 'Informe uma data válida.';
        case 'effectiveUntil':
          return 'Informe uma data válida, ou deixe em branco.';
      }
  }
}

let nextId = 0;

/**
 * Declaring one weekly window (AvailabilityGrid, its form half): a weekday, a start, an end, the
 * first day it applies and, optionally, the last. Presentational: it emits a draft the form itself
 * found sendable and shows what the page passes back from the server.
 *
 * The form refuses on its own the two 400s the server would answer — an end not after the start,
 * a last day before the first — before any request; `serverProblems` still shows the server's.
 */
@Component({
  selector: 'sn-availability-form',
  imports: [ReactiveFormsModule],
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="sn-field" [class.sn-field--invalid]="messageOf('dayOfWeek')">
        <label class="sn-field__label" [for]="id + '-day'">Dia da semana</label>
        <div class="sn-select-wrap">
          <select
            class="sn-select"
            [id]="id + '-day'"
            formControlName="dayOfWeek"
            [attr.aria-invalid]="messageOf('dayOfWeek') ? 'true' : null"
            [attr.aria-describedby]="messageOf('dayOfWeek') ? id + '-day-error' : null"
          >
            <option value="">Escolha um dia</option>
            @for (day of days; track day) {
              <option [value]="day">{{ dayLabel(day) }}</option>
            }
          </select>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </div>
        @if (messageOf('dayOfWeek'); as text) {
          <div class="sn-field__error" [id]="id + '-day-error'">{{ text }}</div>
        }
      </div>

      <div class="sn-field" [class.sn-field--invalid]="messageOf('startTime')">
        <label class="sn-field__label" [for]="id + '-start'">Começa às</label>
        <input
          class="sn-input"
          type="time"
          step="60"
          [id]="id + '-start'"
          formControlName="startTime"
          [attr.aria-invalid]="messageOf('startTime') ? 'true' : null"
          [attr.aria-describedby]="messageOf('startTime') ? id + '-start-error' : null"
        />
        @if (messageOf('startTime'); as text) {
          <div class="sn-field__error" [id]="id + '-start-error'">{{ text }}</div>
        }
      </div>

      <div class="sn-field" [class.sn-field--invalid]="messageOf('endTime')">
        <label class="sn-field__label" [for]="id + '-end'">Termina às</label>
        <input
          class="sn-input"
          type="time"
          step="60"
          [id]="id + '-end'"
          formControlName="endTime"
          [attr.aria-invalid]="messageOf('endTime') ? 'true' : null"
          [attr.aria-describedby]="
            messageOf('endTime') ? id + '-end-hint ' + id + '-end-error' : id + '-end-hint'
          "
        />
        <div class="sn-field__hint" [id]="id + '-end-hint'">No mesmo dia do início, até 23:59.</div>
        @if (messageOf('endTime'); as text) {
          <div class="sn-field__error" [id]="id + '-end-error'">{{ text }}</div>
        }
      </div>

      <div class="sn-field" [class.sn-field--invalid]="messageOf('effectiveFrom')">
        <label class="sn-field__label" [for]="id + '-from'">Vale a partir de</label>
        <input
          class="sn-input"
          type="date"
          [id]="id + '-from'"
          formControlName="effectiveFrom"
          [attr.aria-invalid]="messageOf('effectiveFrom') ? 'true' : null"
          [attr.aria-describedby]="messageOf('effectiveFrom') ? id + '-from-error' : null"
        />
        @if (messageOf('effectiveFrom'); as text) {
          <div class="sn-field__error" [id]="id + '-from-error'">{{ text }}</div>
        }
      </div>

      <div class="sn-field" [class.sn-field--invalid]="messageOf('effectiveUntil')">
        <label class="sn-field__label" [for]="id + '-until'">
          Último dia <span class="sn-field__req">(opcional)</span>
        </label>
        <input
          class="sn-input"
          type="date"
          [id]="id + '-until'"
          formControlName="effectiveUntil"
          [attr.aria-invalid]="messageOf('effectiveUntil') ? 'true' : null"
          [attr.aria-describedby]="
            messageOf('effectiveUntil')
              ? id + '-until-hint ' + id + '-until-error'
              : id + '-until-hint'
          "
        />
        <div class="sn-field__hint" [id]="id + '-until-hint'">
          Só se você já sabe quando essa rotina acaba. Em branco, a janela vale até você encerrá-la.
        </div>
        @if (messageOf('effectiveUntil'); as text) {
          <div class="sn-field__error" [id]="id + '-until-error'">{{ text }}</div>
        }
      </div>

      <button type="submit" class="sn-btn sn-btn--secondary" [disabled]="busy()">
        {{ busy() ? 'Adicionando…' : 'Adicionar janela' }}
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
export class AvailabilityForm implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Today in the account's zone, `yyyy-MM-dd`: the first day offered. */
  readonly today = input.required<string>();
  readonly busy = input(false);
  /** What the server refused, by field, after the last submit. */
  readonly serverProblems = input<DraftProblems>({});

  readonly submitted = output<AvailabilityDraft>();
  /** The person changed something: what the server said no longer applies. */
  readonly edited = output<void>();

  protected readonly id = `sn-avail-form-${nextId++}`;
  protected readonly days = DAYS_OF_WEEK;

  protected readonly form = new FormGroup({
    dayOfWeek: new FormControl<DayOfWeek | ''>('', { nonNullable: true }),
    startTime: new FormControl('', { nonNullable: true }),
    endTime: new FormControl('', { nonNullable: true }),
    effectiveFrom: new FormControl('', { nonNullable: true }),
    effectiveUntil: new FormControl('', { nonNullable: true }),
  });

  /** The form's own refusals, shown from the first submit on and then kept current. */
  private readonly own = signal<DraftProblems>({});
  private readonly tried = signal(false);
  private readonly shown = computed<DraftProblems>(() => ({
    ...this.serverProblems(),
    ...this.own(),
  }));

  ngOnInit(): void {
    this.form.controls.effectiveFrom.setValue(this.today());
    this.form.valueChanges.subscribe(() => {
      this.edited.emit();
      if (this.tried()) {
        this.own.set(draftProblems(this.form.getRawValue()));
      }
    });
  }

  /** After a declaration: an empty form for the next window, starting today again. */
  reset(): void {
    this.tried.set(false);
    this.own.set({});
    this.form.reset({
      dayOfWeek: '',
      startTime: '',
      endTime: '',
      effectiveFrom: this.today(),
      effectiveUntil: '',
    });
  }

  protected dayLabel(day: DayOfWeek): string {
    return DAY_OF_WEEK_LABELS[day];
  }

  protected messageOf(field: AvailabilityField): string | null {
    const problem = this.shown()[field];
    return problem === undefined ? null : messageFor(field, problem);
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.tried.set(true);
    const draft = this.form.getRawValue();
    const problems = draftProblems(draft);
    this.own.set(problems);
    if (Object.keys(problems).length > 0) {
      this.focusFirstInvalid();
      return;
    }
    this.submitted.emit(draft);
  }

  /** Moves focus to the first field marked invalid — the form's or, after a 400, the server's. */
  focusFirstInvalid(): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }
}
