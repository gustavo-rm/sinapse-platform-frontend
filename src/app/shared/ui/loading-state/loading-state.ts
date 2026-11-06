import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Widths that make placeholder lines read as text rather than as a grid. */
const LINE_WIDTHS = ['72%', '54%', '64%', '48%', '60%'];

/**
 * A read in progress: a skeleton with the shape of the content that is coming, never a spinner in
 * the middle of the screen. The skeleton keeps the place of what the person already knows is
 * coming, so its arrival does not rearrange the screen under the pointer.
 *
 * `lines` draws one card of text lines; `cards` draws a list of cards, each a title and two lines.
 * Three to five is enough: twenty lines announce a volume that may not come.
 */
@Component({
  selector: 'sn-loading-state',
  template: `
    <div class="loading" aria-busy="true">
      <span class="sn-sr" role="status">{{ label() }}</span>
      @if (shape() === 'cards') {
        @for (row of rows(); track $index) {
          <div class="sn-card" aria-hidden="true">
            <div class="head">
              <div class="sn-skel dot"></div>
              <div class="sn-skel sn-skel--text" [style.width]="'40%'"></div>
            </div>
            <div class="sn-skel sn-skel--text line" [style.width]="row"></div>
            <div class="sn-skel sn-skel--text" [style.width]="'54%'"></div>
          </div>
        }
      } @else {
        <div class="sn-card" aria-hidden="true">
          @for (row of rows(); track $index) {
            <div class="sn-skel sn-skel--text line" [style.width]="row"></div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .loading {
      display: grid;
      gap: var(--space-6);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .dot {
      width: var(--space-3);
      height: var(--space-3);
      border-radius: var(--radius-pill);
    }
    .line:not(:last-child) {
      margin-bottom: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingState {
  /** What is loading, for screen readers: "Carregando a agenda de hoje". */
  readonly label = input.required<string>();
  /** The shape of the content that is coming. */
  readonly shape = input<'lines' | 'cards'>('lines');
  /** How many lines, or cards. */
  readonly count = input(3);

  protected readonly rows = computed(() =>
    Array.from(
      { length: Math.max(1, this.count()) },
      (_, i) => LINE_WIDTHS[i % LINE_WIDTHS.length],
    ),
  );
}
