import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ApiFailure } from '../../../core/api/api-problem';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import type { Topic } from '../model/goals';

/**
 * What a goal for a subject takes in: EVERY topic of the subject, in curricular order (closed
 * decision L3 — no selection, no exclusions in v1). Context for an informed choice, and nothing
 * to operate: a numbered list with no checkbox, no button, no hover state and no focus stop, and a
 * sentence that says so before the list. The topics are not offered for selection because there
 * is nothing to select.
 */
@Component({
  selector: 'sn-topic-context',
  imports: [ErrorState, LoadingState],
  template: `
    <section class="context" [attr.aria-labelledby]="headingId()">
      <h3 class="h3" [id]="headingId()">O que entra nesta meta</h3>
      @if (failure(); as problem) {
        <sn-error-state
          [problem]="problem"
          description="A meta pode ser definida mesmo assim: ela vale para a disciplina inteira."
          (retry)="retry.emit()"
        />
      } @else if (topics(); as list) {
        @if (list.length === 0) {
          <p class="body note">
            {{ subjectName() }} ainda não tem tópicos no catálogo. A meta vale para a disciplina
            inteira, e os tópicos que forem incluídos depois entram nela.
          </p>
        } @else {
          <p class="body note">
            A meta é a disciplina inteira: {{ countText(list.length) }} de {{ subjectName() }}
            entram, na ordem do currículo. Não há tópicos a escolher nem a deixar de fora.
          </p>
          <ol class="sn-topics">
            @for (topic of list; track topic.id) {
              <li>{{ topic.name }}</li>
            }
          </ol>
        }
      } @else {
        <sn-loading-state [label]="'Carregando os tópicos de ' + subjectName()" [count]="4" />
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .context {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      line-height: 22px;
    }
    .note {
      margin: 0;
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopicContext {
  readonly subjectName = input.required<string>();
  /** The topics, or undefined while they load. */
  readonly topics = input<readonly Topic[] | undefined>(undefined);
  readonly failure = input<ApiFailure | null>(null);
  readonly headingId = input('sn-topic-context');
  readonly retry = output<void>();

  protected countText(count: number): string {
    return count === 1 ? 'o único tópico' : `todos os ${count} tópicos`;
  }
}
