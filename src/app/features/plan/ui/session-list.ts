import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { AccountTimeService } from '../../../core/time/account-time.service';
import { PLANNED_SESSION_KIND_LABELS } from '../../../shared/labels/planned-session-kind.labels';
import {
  type CatalogueMap,
  type PlannedSession,
  formatMinutes,
  sessionCountText,
  topicNameOf,
} from '../model/plan';

interface SessionRow {
  readonly id: string;
  readonly time: string;
  readonly topic: string;
  readonly detail: string;
}

interface DayGroup {
  readonly key: string;
  readonly heading: string;
  readonly sessions: readonly SessionRow[];
}

/**
 * The whole sequence of a plan, for consultation — not the first thing on the screen. Four weeks of
 * sessions at once is cognitive load, not information, so the list sits closed in a `<details>`
 * after the summary and after "where to start", and opens on demand.
 *
 * Grouped by the ACCOUNT's calendar day (`AccountTimeService.localDateOf`), in the plan's sequence.
 * Each session says its time, its topic by NAME — resolved from the catalogue map, never an
 * identifier (F2) — its kind and its length. Whether a session was executed is the learning
 * record's (FE-9), and is not claimed here.
 */
@Component({
  selector: 'sn-session-list',
  template: `
    <details class="all">
      <summary class="all__summary">Ver todas as sessões do plano ({{ countText() }})</summary>
      <div class="all__body">
        @for (day of days(); track day.key) {
          <section class="day" [attr.aria-label]="day.heading">
            <h3 class="day__heading">{{ day.heading }}</h3>
            <ol class="day__list">
              @for (row of day.sessions; track row.id) {
                <li class="row">
                  <span class="row__time">{{ row.time }}</span>
                  <span class="row__main">
                    <span class="row__topic">{{ row.topic }}</span>
                    <span class="row__detail">{{ row.detail }}</span>
                  </span>
                </li>
              }
            </ol>
          </section>
        }
      </div>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    .all {
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background: var(--surface-raised);
    }
    .all__summary {
      min-height: var(--target-min);
      display: flex;
      align-items: center;
      padding: 0 var(--space-4);
      cursor: pointer;
      font-weight: 600;
      color: var(--primary);
      border-radius: var(--radius-lg);
    }
    .all__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: 0 var(--space-4) var(--space-4);
    }
    .day__heading {
      margin: 0 0 var(--space-2);
      font-size: 13px;
      font-weight: 600;
      line-height: 16px;
      color: var(--ink-muted);
    }
    .day__heading::first-letter {
      text-transform: uppercase;
    }
    .day__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      border-top: 1px solid var(--border-subtle);
    }
    .row__time {
      font-variant-numeric: tabular-nums;
      color: var(--ink-muted);
    }
    .row__main {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .row__topic {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .row__detail {
      font-size: 13px;
      line-height: 18px;
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionList {
  private readonly time = inject(AccountTimeService);

  readonly sessions = input.required<readonly PlannedSession[]>();
  readonly catalogue = input.required<CatalogueMap>();

  protected readonly countText = computed(() => sessionCountText(this.sessions().length));

  protected readonly days = computed<DayGroup[]>(() => {
    const catalogue = this.catalogue();
    const groups = new Map<string, { heading: string; sessions: SessionRow[] }>();
    for (const session of this.sessions()) {
      const key = this.time.localDateOf(session.scheduledStart);
      let group = groups.get(key);
      if (group === undefined) {
        group = {
          heading: this.time.formatInstant(session.scheduledStart, 'weekdayDate'),
          sessions: [],
        };
        groups.set(key, group);
      }
      group.sessions.push(rowOf(session, catalogue, this.time));
    }
    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  });
}

/** One session as a row: time, topic by name, kind and length. Shared with "where to start". */
export function rowOf(
  session: PlannedSession,
  catalogue: CatalogueMap,
  time: AccountTimeService,
): SessionRow {
  return {
    id: session.id,
    time: time.formatInstant(session.scheduledStart, 'time'),
    topic: topicNameOf(session.topicId, catalogue),
    detail: `${PLANNED_SESSION_KIND_LABELS[session.kind]} · ${formatMinutes(session.durationMinutes)}`,
  };
}
