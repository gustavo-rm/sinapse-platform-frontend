import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Adherence } from '../model/plan';

/**
 * Adherence (Design System, `AdherenceMeter`): a sentence with the two numbers, and a bar only as
 * support — never a percentage, never a large number alone, and never a judging colour. The fill is
 * `primary-fill` on `surface-sunken` whatever the value: adherence measures the execution of a
 * plan, not learning, and a red bar is the same failure as a congratulation (`docs/DESIGN_SYSTEM.md` §2.1).
 *
 * Absent is not zero. When the server sends no ratio, nothing has fallen due yet, and the
 * component says that in words; no bar is drawn, because an empty bar reads as 0%.
 *
 * `beforeCreation` counts sessions the plan placed before it existed (observed in FE-8: the horizon
 * starts on the server's today, and that day's windows may already be over). They fall due at once
 * and the student could not have done them; the component says so.
 *
 * The visible title avoids "aderência", which is the system's vocabulary ("Seu ritmo").
 */
@Component({
  selector: 'sn-adherence-note',
  template: `
    <section class="sn-card sn-adh" [attr.aria-labelledby]="headingId">
      <h2 class="sn-card__title" [id]="headingId">Seu ritmo</h2>
      @if (measured(); as m) {
        <p class="sn-adh__text">
          Você concluiu <strong>{{ m.executed }} de {{ m.plannedElapsed }}</strong>
          {{ m.plannedElapsed === 1 ? 'sessão prevista' : 'sessões previstas' }} até aqui.
        </p>
        <div class="sn-adh__track" aria-hidden="true">
          <div class="sn-adh__fill" [style.width.%]="m.ratio * 100"></div>
        </div>
        <p class="sn-adh__note">Conta só as sessões cujo horário já passou.</p>
        @if (beforeCreationText(); as text) {
          <p class="sn-adh__note">{{ text }}</p>
        }
      } @else {
        <p class="sn-adh__text">
          Nenhuma sessão deste plano venceu ainda, então ainda não há o que comparar.
        </p>
        <p class="sn-adh__note">
          Quando o horário da primeira sessão passar, aparece aqui quantas das sessões previstas até
          ali você concluiu.
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sn-adh__text,
    .sn-adh__note {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdherenceNote {
  readonly adherence = input.required<Adherence>();
  /** How many sessions were scheduled before the plan was created. */
  readonly beforeCreation = input(0);

  protected readonly headingId = 'sn-adherence-heading';

  protected readonly measured = computed(() => {
    const adherence = this.adherence();
    return adherence.kind === 'measured' ? adherence : null;
  });

  protected readonly beforeCreationText = computed(() => {
    const count = this.beforeCreation();
    if (count === 0) {
      return null;
    }
    return count === 1
      ? 'Uma delas estava marcada para um horário anterior à criação do plano: ela já começou vencida, sem que houvesse como fazê-la.'
      : `${count} delas estavam marcadas para horários anteriores à criação do plano: elas já começaram vencidas, sem que houvesse como fazê-las.`;
  });
}
