import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { AccountTimeService } from '../../../core/time/account-time.service';
import { DAY_OF_WEEK_LABELS } from '../../../shared/labels/day-of-week.labels';
import {
  type AvailabilityWindow,
  byWeekday,
  closingProblem,
  suggestedClosing,
} from '../model/availability';

/** A window to close, and the last day it applies. */
export interface ClosingRequest {
  readonly window: AvailabilityWindow;
  readonly effectiveUntil: string;
}

const CLOSING_MESSAGES = {
  required: 'Informe o último dia em que a janela vale.',
  invalid: 'Informe uma data válida.',
  'until-before-from': 'O último dia não pode vir antes do dia em que a janela começou a valer.',
} as const;

let nextId = 0;

/**
 * Declared windows, by weekday (AvailabilityGrid, its list half). Each row says the hours and the
 * period the window covers, in words that need no date arithmetic: "A partir de 01/11/2026" for an
 * open-ended window, "De 01/11/2026 a 10/11/2026" for one with a last day. Which windows apply today
 * is decided by the server and given to this component as a separate list.
 *
 * A closed window is a RECORD, never a deletion: the same ink and weight as any other row, its
 * period written out, no strike-through and no fading, and the action is named "Encerrar", never
 * "Excluir" or "Remover". Closing asks for the last day the window applies, inline, with today
 * offered; a past day is accepted ("stating what happened"), a day before it began is not.
 */
@Component({
  selector: 'sn-availability-list',
  template: `
    @for (day of days(); track day.dayOfWeek) {
      <section class="day" [attr.aria-labelledby]="id + '-' + day.dayOfWeek">
        <h3 class="day__name" [id]="id + '-' + day.dayOfWeek">{{ dayLabel(day.dayOfWeek) }}</h3>
        <ul class="rows">
          @for (window of day.windows; track window.id) {
            <li class="sn-wrow">
              <div>
                <p class="sn-wrow__time">
                  <span aria-hidden="true">{{ window.startTime }}–{{ window.endTime }}</span>
                  <span class="sn-sr">das {{ window.startTime }} às {{ window.endTime }}</span>
                </p>
                <p class="sn-wrow__period">{{ periodOf(window) }}</p>
              </div>
              @if (closable() && window.effectiveUntil === null && closing() !== window.id) {
                <button
                  type="button"
                  class="sn-btn sn-btn--secondary sn-btn--sm"
                  [disabled]="busy()"
                  [attr.aria-label]="'Encerrar a janela de ' + describe(window)"
                  [attr.data-window]="window.id"
                  (click)="open(window)"
                >
                  Encerrar
                </button>
              }
              @if (closing() === window.id) {
                <div
                  class="sn-wrow__panel"
                  role="group"
                  [attr.aria-label]="'Encerrar ' + describe(window)"
                >
                  <div class="sn-field" [class.sn-field--invalid]="closingError()">
                    <label class="sn-field__label" [for]="id + '-until'">
                      Último dia em que esta janela vale
                    </label>
                    <input
                      class="sn-input"
                      type="date"
                      [id]="id + '-until'"
                      [min]="window.effectiveFrom"
                      [value]="until()"
                      (input)="edit($any($event.target).value)"
                      [attr.aria-invalid]="closingError() ? 'true' : null"
                      [attr.aria-describedby]="
                        closingError()
                          ? id + '-until-hint ' + id + '-until-error'
                          : id + '-until-hint'
                      "
                    />
                    <div class="sn-field__hint" [id]="id + '-until-hint'">
                      A janela não é apagada: ela continua registrada, valendo até esse dia,
                      inclusive. Pode ser um dia que já passou, se a rotina mudou antes.
                    </div>
                    @if (closingError(); as text) {
                      <div class="sn-field__error" [id]="id + '-until-error'">{{ text }}</div>
                    }
                  </div>
                  <div class="actions">
                    <button
                      type="button"
                      class="sn-btn sn-btn--primary sn-btn--sm"
                      [disabled]="busy()"
                      [attr.aria-busy]="busy() ? 'true' : null"
                      (click)="confirm(window)"
                    >
                      Encerrar janela
                    </button>
                    <button
                      type="button"
                      class="sn-btn sn-btn--ghost sn-btn--sm"
                      [disabled]="busy()"
                      (click)="cancel()"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .day__name {
      margin: 0 0 var(--space-1);
      font-size: 13px;
      font-weight: 600;
      line-height: 16px;
      letter-spacing: 0.01em;
      color: var(--ink-muted);
    }
    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvailabilityList {
  private readonly time = inject(AccountTimeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly windows = input.required<readonly AvailabilityWindow[]>();
  /** Today in the account's zone: the closing date offered first. */
  readonly today = input.required<string>();
  /** Whether rows offer "Encerrar" (only open-ended windows can be closed: closing twice is a 409). */
  readonly closable = input(true);
  readonly busy = input(false);

  readonly closeRequested = output<ClosingRequest>();

  protected readonly id = `sn-avail-list-${nextId++}`;
  protected readonly days = computed(() => byWeekday(this.windows()));
  /** The id of the window whose closing panel is open. */
  protected readonly closing = signal<string | null>(null);
  protected readonly until = signal('');
  private readonly tried = signal(false);

  protected readonly closingError = computed(() => {
    const id = this.closing();
    const window = this.windows().find((candidate) => candidate.id === id);
    if (!this.tried() || window === undefined) {
      return null;
    }
    const problem = closingProblem(window, this.until());
    return problem === null ? null : CLOSING_MESSAGES[problem];
  });

  /** Closes the panel: called by the page once the server answered. */
  done(): void {
    this.closing.set(null);
  }

  protected dayLabel(day: AvailabilityWindow['dayOfWeek']): string {
    return DAY_OF_WEEK_LABELS[day];
  }

  protected describe(window: AvailabilityWindow): string {
    return `${DAY_OF_WEEK_LABELS[window.dayOfWeek]}, das ${window.startTime} às ${window.endTime}`;
  }

  protected periodOf(window: AvailabilityWindow): string {
    const from = this.time.formatLocalDate(window.effectiveFrom);
    return window.effectiveUntil === null
      ? `A partir de ${from}`
      : `De ${from} a ${this.time.formatLocalDate(window.effectiveUntil)}`;
  }

  protected open(window: AvailabilityWindow): void {
    this.tried.set(false);
    this.until.set(suggestedClosing(window, this.today()));
    this.closing.set(window.id);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLInputElement>(`#${this.id}-until`)?.focus(),
      { injector: this.injector },
    );
  }

  protected edit(value: string): void {
    this.until.set(value);
  }

  protected cancel(): void {
    const id = this.closing();
    this.closing.set(null);
    // Back to the control that opened the panel, which is shown again.
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLButtonElement>(`button[data-window="${id}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected confirm(window: AvailabilityWindow): void {
    this.tried.set(true);
    if (closingProblem(window, this.until()) !== null) {
      return;
    }
    this.closeRequested.emit({ window, effectiveUntil: this.until() });
  }
}
