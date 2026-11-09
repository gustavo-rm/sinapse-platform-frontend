import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { ProblemType } from '../../../core/api/contract/problem-type';
import { PROBLEM_TYPE_LABELS } from '../../labels/problem-type.labels';

/**
 * What this component reads from a failure. The full problem type, and how it is built from a
 * response, belong to the API layer (FE-3); any shape that carries these two members fits.
 */
export interface ErrorStateProblem {
  /** The RFC 7807 `type`. The message is chosen by it, never by the HTTP status. */
  readonly type: ProblemType;
  /** The `X-Correlation-Id` of the failed response, if the API layer has it. */
  readonly correlationId?: string | null;
}

/**
 * The problem types for which repeating the same request can work. Never a 4xx, and never
 * `rate-limit-exceeded`, which has its own notice with no retry control. A network failure is
 * retryable too, but it is not a problem type: the API layer decides how it reaches this component.
 */
export const RETRYABLE_PROBLEM_TYPES: ReadonlySet<ProblemType> = new Set<ProblemType>([
  'urn:sinapse:problem:internal-error',
]);

/**
 * A failure that takes the place of the content. The message comes from the label catalogue by
 * problem `type`; the response's `detail` is developer text and is never shown. The correlation
 * id, when there is one, sits collapsed in a `<details>` so the person can quote it.
 */
@Component({
  selector: 'sn-error-state',
  template: `
    <div class="sn-state" role="alert">
      <svg
        class="sn-state__icon"
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <circle cx="16" cy="16" r="12.5" />
        <path d="M16 10v8M16 21.5h.01" />
      </svg>
      <h2 class="sn-state__title">{{ message() }}</h2>
      @if (description(); as text) {
        <p class="sn-state__body">{{ text }}</p>
      }
      @if (retryable()) {
        <button type="button" class="sn-btn sn-btn--primary" (click)="retry.emit()">
          Tentar de novo
        </button>
      }
      @if (problem().correlationId; as id) {
        <details class="detail">
          <summary class="caption">Detalhe técnico</summary>
          <div class="sn-state__detail">{{ id }}</div>
        </details>
      }
    </div>
  `,
  styles: `
    .detail {
      margin-top: var(--space-2);
    }
    .detail summary {
      color: var(--ink-subtle);
      cursor: pointer;
    }
    .detail .sn-state__detail {
      margin-top: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorState {
  /** The failure, already typed by the API layer. */
  readonly problem = input.required<ErrorStateProblem>();
  /** Extra context the screen knows: what was not loaded, and what is safe. */
  readonly description = input<string>();
  /** Emitted when the person asks to repeat the request. Offered only where repeating can work. */
  readonly retry = output<void>();

  protected readonly message = computed(() => PROBLEM_TYPE_LABELS[this.problem().type]);
  protected readonly retryable = computed(() => RETRYABLE_PROBLEM_TYPES.has(this.problem().type));
}
