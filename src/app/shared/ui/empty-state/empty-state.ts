import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * An explained absence: an icon, one sentence that says what this is and why it is empty, and
 * one primary action. An empty state without an action is a dead end; where no action exists,
 * the sentence says what has to happen and who makes it happen.
 *
 * The icon is projected (`<svg snStateIcon>`); without one, a neutral mark is drawn. The icon set
 * is decision D-FE3, still open.
 */
@Component({
  selector: 'sn-empty-state',
  template: `
    <div class="sn-state">
      <span class="sn-state__icon" aria-hidden="true">
        <ng-content select="[snStateIcon]">
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="6" y="6" width="20" height="20" rx="3" />
            <path d="M11 16h10" />
          </svg>
        </ng-content>
      </span>
      <h2 class="sn-state__title">{{ title() }}</h2>
      @if (description(); as text) {
        <p class="sn-state__body">{{ text }}</p>
      }
      @if (actionLabel(); as text) {
        <button type="button" class="sn-btn sn-btn--primary" (click)="action.emit()">
          {{ text }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  /** The sentence that says what is empty: "Nada planejado para hoje". */
  readonly title = input.required<string>();
  /** Why it is empty, or what happens next. */
  readonly description = input<string>();
  /** The one primary action. Omit only when no action is possible. */
  readonly actionLabel = input<string>();
  /** Emitted when the primary action is taken. */
  readonly action = output<void>();
}
