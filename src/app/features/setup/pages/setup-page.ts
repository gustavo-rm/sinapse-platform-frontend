import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { SessionStore } from '../../../core/session/session-store';
import { type SetupStep, setupStanding } from '../model/setup';
import { SetupSteps } from '../ui/setup-steps';
import { AvailabilitySection } from './availability-section';
import { GoalsSection } from './goals-section';

/**
 * `/configurar`, row 8 of the guard chain (`setupComplete` false) — the only gate a real account
 * reaches today. It asks for exactly two things, and nothing else (closed decision F2): when the
 * student studies, then what they want to study.
 *
 * **Two steps, not one screen with two sections.** The rule of `docs/DESIGN_SYSTEM.md` §2.6 ("uma
 * pergunta por tela": a screen that needs two section titles to explain itself is two screens),
 * and the order the task gives — the routine first, because it is the one the student has to think
 * about; the goals second, because they are cheap to change. The progress is visible ("Passo 1 de
 * 2"), the step is held in memory (a reload starts again at step 1, where what was declared is
 * listed), and both steps are the same components as the account area.
 *
 * **Setup is complete when the server says so.** After every write the section re-reads
 * `/me/state`; the finishing block reads `setupComplete` from the store and nothing else. Only then
 * is "Continuar" offered, and it calls `SessionStore.settle('setup')`: the chain routes the person
 * (to `/hoje` today), and nobody navigates by hand. No plan is promised: this task generates none.
 */
@Component({
  selector: 'sn-setup-page',
  imports: [AvailabilitySection, GoalsSection, SetupSteps],
  template: `
    <h1 class="display-md" tabindex="-1" #title>Configure seus estudos</h1>
    <p class="lead intro">
      Duas coisas, e só elas: quando você costuma estudar e o que você quer estudar. Você pode mudar
      as duas depois, em Conta.
    </p>
    <sn-setup-steps [current]="step()" />

    @if (step() === 'availability') {
      <p class="body step-intro">
        Diga os horários da semana em que você costuma ter tempo para estudar. Cada janela se repete
        toda semana, a partir do dia escolhido.
      </p>
      <sn-availability-section target="setup" (declaredCount)="declared.set($event)" />
      <div class="step-actions">
        <button
          type="button"
          class="sn-btn sn-btn--primary sn-btn--lg"
          [disabled]="declared() === 0"
          [attr.aria-describedby]="declared() === 0 ? 'setup-next-hint' : null"
          (click)="go('goals')"
        >
          Continuar para as metas
        </button>
        @if (declared() === 0) {
          <p class="sn-field__hint" id="setup-next-hint">
            Declare ao menos uma janela para continuar.
          </p>
        }
      </div>
    } @else {
      <p class="body step-intro">
        Escolha as disciplinas que você quer estudar. Cada meta é uma disciplina inteira.
      </p>
      <sn-goals-section mode="setup" target="setup" (activeCount)="active.set($event)" />

      <section class="finish" aria-labelledby="setup-finish-title">
        <h2 class="h2" id="setup-finish-title">Concluir</h2>
        <div role="status" aria-atomic="true">
          <p class="body finish__text">{{ standingText() }}</p>
        </div>
        @if (standing() === 'complete') {
          <button
            type="button"
            class="sn-btn sn-btn--primary sn-btn--lg"
            [disabled]="finishing()"
            [attr.aria-busy]="finishing() ? 'true' : null"
            (click)="finish()"
          >
            Continuar
          </button>
        }
        @if (finishFailed()) {
          <p class="sn-field__error" role="alert">
            Não foi possível confirmar com o servidor agora. Tente de novo em instantes.
          </p>
        }
      </section>
      <div class="step-actions">
        <button type="button" class="sn-btn sn-btn--ghost" (click)="go('availability')">
          Voltar para a disponibilidade
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      max-width: var(--reading-max);
    }
    h1 {
      margin: 0;
    }
    .intro,
    .step-intro {
      margin: 0;
      color: var(--ink-muted);
    }
    .step-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
    .step-actions p {
      margin: 0;
    }
    .finish {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-3);
      padding-top: var(--space-6);
      border-top: 1px solid var(--border-subtle);
    }
    .h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      line-height: 24px;
    }
    .finish__text {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupPage {
  private readonly session = inject(SessionStore);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  protected readonly step = signal<SetupStep>('availability');
  /** Windows on record, as the availability section last read them. */
  protected readonly declared = signal(0);
  /** Active goals, as the goals section last read them. */
  protected readonly active = signal(0);
  protected readonly finishing = signal(false);
  protected readonly finishFailed = signal(false);

  /** The server's `setupComplete`, from the store, explained with what the screen holds. */
  protected readonly standing = computed(() => {
    const state = this.session.state();
    const flag = state === null ? null : state.setupComplete;
    return setupStanding(flag, this.declared(), this.active());
  });

  protected readonly standingText = computed(() => {
    switch (this.standing()) {
      case 'complete':
        return 'A configuração está completa: sua disponibilidade e suas metas estão registradas. Ao continuar, você vai para a tela Hoje. Nenhum plano é montado nesta etapa.';
      case 'needs-window-and-goal':
      case 'needs-window':
        return 'Falta declarar ao menos uma janela de disponibilidade, no passo 1.';
      case 'needs-goal':
        return 'Falta definir ao menos uma meta.';
      case 'windows-outside-horizon':
        return 'Suas janelas e suas metas estão registradas, mas a configuração ainda não está completa: só conta a disponibilidade que vale entre hoje e as próximas semanas. Se todas as suas janelas começam bem mais adiante, ou já terminaram, declare no passo 1 uma que valha nesse período.';
      case 'unknown':
        return 'Não foi possível confirmar com o servidor se a configuração está completa.';
    }
  });

  protected go(step: SetupStep): void {
    this.step.set(step);
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  /** The chain routes the person; this screen never decides where they go. */
  protected async finish(): Promise<void> {
    this.finishing.set(true);
    this.finishFailed.set(false);
    const outcome = await this.session.settle('setup');
    this.finishing.set(false);
    if (outcome.kind === 'failed') {
      this.finishFailed.set(true);
    }
  }
}
