import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

let nextId = 0;

/**
 * A decision that does not fit on the screen (Design System, Dialog). Two uses, and only two:
 *
 * - an ordinary confirmation: a title, one sentence, an action naming the verb, and "Cancelar";
 * - a DESTRUCTIVE one, when `confirmWord` is set: the consequence written out in full, and the
 *   action enabled only after the person types the word asked for. Not decorative friction:
 *   withdrawing the essential consent suspends the account and ends every session in the same
 *   transaction, and a `confirm()` does not say that. The action is `sn-btn--danger`, never next to
 *   a primary button, and `Esc` does not close it.
 *
 * `role="dialog"`, `aria-modal="true"`, labelled by its title and described by its body. Focus is
 * kept inside while it is open and returned to the element that opened it. The component executes
 * nothing: it says what the person decided.
 */
@Component({
  selector: 'sn-confirm-dialog',
  // On the host: the keys of the whole dialog — Tab kept inside, Esc when it may close.
  host: { '(keydown)': 'onKeydown($event)' },
  template: `
    <div class="layer">
      <div class="sn-scrim" aria-hidden="true"></div>
      <div
        class="sn-dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="id + '-title'"
        [attr.aria-describedby]="id + '-body'"
      >
        <h2 class="sn-dialog__title" [id]="id + '-title'">{{ heading() }}</h2>
        <div class="sn-dialog__body lead" [id]="id + '-body'"><ng-content /></div>

        @if (confirmWord(); as word) {
          <div class="sn-field word">
            <label class="sn-field__label" [for]="id + '-word'">
              Para confirmar, digite {{ word }}
            </label>
            <input
              class="sn-input"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              [id]="id + '-word'"
              [value]="typed()"
              (input)="typed.set($any($event.target).value)"
            />
          </div>
        }

        <div class="sn-dialog__actions">
          <button
            type="button"
            class="sn-btn sn-btn--secondary"
            [disabled]="busy()"
            (click)="cancelled.emit()"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="sn-btn"
            [class.sn-btn--danger]="destructive()"
            [class.sn-btn--primary]="!destructive()"
            [disabled]="!armed() || busy()"
            [attr.aria-busy]="busy() ? 'true' : null"
            (click)="confirmed.emit()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .layer {
      position: fixed;
      inset: 0;
      z-index: var(--z-overlay);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }
    .sn-dialog__body {
      max-width: var(--reading-max);
    }
    .word {
      margin-top: var(--space-5);
    }
    .sn-dialog__actions {
      flex-wrap: wrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The decision, as a question or a statement of the act. */
  readonly heading = input.required<string>();
  /** The action, naming the verb: "Retirar consentimento". Never "OK". */
  readonly confirmLabel = input.required<string>();
  /** The word to type before the action is enabled. Set only for a destructive confirmation. */
  readonly confirmWord = input<string | null>(null);
  /** While the decision is being carried out by the caller: both actions are disabled. */
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly id = `sn-confirm-${nextId++}`;
  protected readonly typed = signal('');
  protected readonly destructive = computed(() => this.confirmWord() !== null);
  protected readonly armed = computed(() => {
    const word = this.confirmWord();
    return (
      word === null ||
      this.typed().trim().toLocaleLowerCase('pt-BR') === word.toLocaleLowerCase('pt-BR')
    );
  });

  /** The element that had focus when the dialog opened, to give it back on close. */
  private readonly opener =
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.opener?.focus());
  }

  ngOnInit(): void {
    // A destructive dialog starts on the word to type; an ordinary one on "Cancelar", the act that
    // changes nothing.
    queueMicrotask(() => this.focusables()[0]?.focus());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.destructive() && !this.busy()) {
        event.preventDefault();
        this.cancelled.emit();
      }
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const items = this.focusables();
    if (items.length === 0) {
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusables(): HTMLElement[] {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), a[href]',
      ),
    ];
  }

  private contains(element: Element | null): boolean {
    return element !== null && this.host.nativeElement.contains(element);
  }
}
