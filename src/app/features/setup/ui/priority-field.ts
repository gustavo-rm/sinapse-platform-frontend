import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  DEFAULT_PRIORITY,
  LEAST_PRESSING,
  MOST_PRESSING,
  PRIORITIES,
  type Priority,
} from '../model/goals';

let nextId = 0;

/**
 * The priority of a goal, 1 to 5, as five radios in a segment. **5 is the highest priority** —
 * the backend's direction ("higher meaning more pressing"; see `PRIORITIES`), which the Core reads
 * as the weight of every topic of the subject. The direction is said in words at both ends and in
 * the name of the two end options, never by position or colour alone. The middle option is the
 * server's default.
 */
@Component({
  selector: 'sn-priority-field',
  template: `
    <fieldset class="sn-prio-field" [attr.aria-describedby]="id + '-hint'">
      <legend class="sn-field__label">Prioridade</legend>
      <div class="sn-prio-field__opts">
        @for (option of priorities; track option) {
          <label class="sn-prio-field__opt">
            <input
              type="radio"
              [name]="id"
              [value]="option"
              [checked]="option === value()"
              [disabled]="disabled()"
              (change)="changed.emit(option)"
            />
            <span aria-hidden="true">{{ option }}</span>
            <span class="sn-sr">{{ nameOf(option) }}</span>
          </label>
        }
      </div>
      <div class="sn-prio-field__ends" aria-hidden="true">
        <span>1 · menor</span>
        <span>5 · maior</span>
      </div>
      <div class="sn-field__hint" [id]="id + '-hint'">
        Quanto maior o número, mais peso esta disciplina recebe diante das outras metas.
      </div>
    </fieldset>
  `,
  styles: ':host { display: block; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityField {
  readonly value = input<Priority>(DEFAULT_PRIORITY);
  readonly disabled = input(false);
  readonly changed = output<Priority>();

  protected readonly id = `sn-prio-${nextId++}`;
  protected readonly priorities = PRIORITIES;

  /** The accessible name of each option: the number, and what the ends and the default mean. */
  protected nameOf(value: Priority): string {
    if (value === MOST_PRESSING) {
      return `${value}, a maior prioridade`;
    }
    if (value === LEAST_PRESSING) {
      return `${value}, a menor prioridade`;
    }
    return value === DEFAULT_PRIORITY ? `${value}, o padrão` : String(value);
  }
}
