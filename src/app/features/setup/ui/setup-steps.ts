import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SETUP_STEPS, type SetupStep } from '../model/setup';

function nameOf(step: SetupStep): string {
  switch (step) {
    case 'availability':
      return 'Quando você estuda';
    case 'goals':
      return 'O que você quer estudar';
  }
}

/**
 * The progress of `/configurar`, two steps, said in words: "Passo 1 de 2" and the step's name.
 * The current step carries `aria-current="step"` and weight, not colour alone.
 */
@Component({
  selector: 'sn-setup-steps',
  template: `
    <nav aria-label="Passos da configuração">
      <ol class="sn-steps">
        @for (step of steps; track step; let index = $index) {
          <li class="sn-steps__item" [attr.aria-current]="step === current() ? 'step' : null">
            <span class="sn-steps__num" aria-hidden="true">{{ index + 1 }}</span>
            <span>
              <span class="sn-sr">Passo {{ index + 1 }} de {{ steps.length }}: </span>
              {{ nameOf(step) }}
            </span>
          </li>
        }
      </ol>
    </nav>
  `,
  styles: ':host { display: block; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupSteps {
  readonly current = input.required<SetupStep>();
  protected readonly steps = SETUP_STEPS;
  protected readonly nameOf = nameOf;
}
