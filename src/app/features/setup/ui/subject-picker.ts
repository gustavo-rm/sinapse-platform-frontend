import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { Subject } from '../model/goals';

/** Above this many subjects, a field to narrow the list by name. */
const SEARCH_FROM = 8;

let nextId = 0;

/** Lower case, without accents: "Anatomia" finds "anatômia" and the reverse. */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

/**
 * Choosing ONE subject for a goal (SubjectPicker). Radios in a bordered list, in the server's
 * order. Two departures from the artifact's preview, both deliberate:
 *
 * - no position is shown (`.sn-picker__pos`): `GET /api/v1/subjects` says `position` is "their rank
 *   in catalogue-code order" because "subjects have no curated order" — a number beside a subject
 *   would read as a ranking that does not exist;
 * - real radios rather than option buttons: a native group gives the keyboard path (arrows) and
 *   the checked state to assistive technology with nothing written here.
 *
 * Only subjects open for a goal are given (the page filters out those with an active goal).
 */
@Component({
  selector: 'sn-subject-picker',
  template: `
    <fieldset class="group">
      <legend class="sn-field__label">Disciplina</legend>
      @if (subjects().length >= searchFrom) {
        <label class="sn-sr" [for]="id + '-search'">Procurar disciplina pelo nome</label>
      }
      <div class="sn-picker">
        @if (subjects().length >= searchFrom) {
          <input
            class="sn-input sn-picker__search"
            type="search"
            placeholder="Procurar pelo nome"
            [id]="id + '-search'"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        }
        <ul class="sn-picker__list">
          @for (subject of shown(); track subject.id) {
            <li>
              <label class="sn-picker__opt" [attr.aria-selected]="subject.id === selected()">
                <input
                  type="radio"
                  [name]="id"
                  [value]="subject.id"
                  [checked]="subject.id === selected()"
                  [disabled]="disabled()"
                  (change)="chosen.emit(subject.id)"
                />
                <span>{{ subject.name }}</span>
              </label>
            </li>
          } @empty {
            <li class="none">Nenhuma disciplina com esse nome.</li>
          }
        </ul>
      </div>
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    .sn-picker__opt input {
      flex: none;
      width: 20px;
      height: 20px;
      margin: 0;
      accent-color: var(--primary-fill);
    }
    .sn-picker__list {
      max-height: none;
    }
    .none {
      padding: var(--space-3);
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubjectPicker {
  readonly subjects = input.required<readonly Subject[]>();
  readonly selected = input<string | null>(null);
  readonly disabled = input(false);
  readonly chosen = output<string>();

  protected readonly id = `sn-subject-${nextId++}`;
  protected readonly searchFrom = SEARCH_FROM;
  protected readonly query = signal('');
  protected readonly shown = computed(() => {
    const query = folded(this.query().trim());
    return query === ''
      ? this.subjects()
      : this.subjects().filter((subject) => folded(subject.name).includes(query));
  });
}
