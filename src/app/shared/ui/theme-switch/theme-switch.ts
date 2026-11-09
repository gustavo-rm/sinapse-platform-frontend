import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { THEME_CHOICES, type ThemeChoice } from '../../../core/theme/theme.service';
import { THEME_CHOICE_LABELS } from '../../labels/theme-choice.labels';

let nextId = 0;

/**
 * Picks the theme. Presentational: it shows the choice it is given and emits the one the person
 * picks; the layout applies it. A native `<select>` so the keyboard path is the platform's own.
 */
@Component({
  selector: 'sn-theme-switch',
  template: `
    <div class="sn-field theme-switch">
      <label class="sn-field__label" [attr.for]="id">Tema</label>
      <div class="sn-select-wrap">
        <select #select class="sn-select" [id]="id" (change)="pick(select.value)">
          @for (choice of choices; track choice) {
            <option [value]="choice" [selected]="choice === value()">{{ labels[choice] }}</option>
          }
        </select>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </div>
    </div>
  `,
  styles: '.theme-switch { max-width: var(--sidebar-w); }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitch {
  /** The choice in force. */
  readonly value = input.required<ThemeChoice>();
  /** Emitted with the choice the person picks. */
  readonly changed = output<ThemeChoice>();

  protected readonly id = `sn-theme-switch-${nextId++}`;
  protected readonly choices = THEME_CHOICES;
  protected readonly labels = THEME_CHOICE_LABELS;

  protected pick(value: string): void {
    const choice = THEME_CHOICES.find((candidate) => candidate === value);
    if (choice) {
      this.changed.emit(choice);
    }
  }
}
