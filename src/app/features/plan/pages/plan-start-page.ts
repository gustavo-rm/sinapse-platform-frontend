import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { SessionStore } from '../../../core/session/session-store';
import { PlanGenerationPanel } from './plan-generation-panel';

/** Where the plan lives, once there is one. */
export const PLAN_PATH = '/plano';

/**
 * `/hoje` in the two states that are states of the PLAN, not of the day (`docs/DESIGN_SYSTEM.md` §2.2):
 *
 * - no plan (`activePlanId` absent): what a plan is, in one sentence, and the one action — ask for
 *   one. Nothing else: an empty screen filled to look full is noise;
 * - a plan being made (`activeGenerationJobId` present): the wait, with elapsed time and what is
 *   happening, and nothing that implies a proportion.
 *
 * The route composition (`app.routes.ts`, `todayShowsPlan`) sends `/hoje` here in exactly those
 * states; otherwise `/hoje` is the day, FE-9's. When the plan is ready the person is taken to it.
 * When a request ends without a plan while one is in force, "Entendi" sends them back to `/hoje`,
 * which then shows the day.
 */
@Component({
  selector: 'sn-plan-start-page',
  imports: [PlanGenerationPanel],
  template: `
    <h1 class="display-md">Hoje</h1>
    <sn-plan-generation-panel
      [mode]="mode"
      (ready)="openPlan()"
      (changed)="reroute()"
      (dismissed)="reroute()"
    />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }
    h1 {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanStartPage {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /**
   * With a plan in force, a request here is a re-plan: a failure leaves that plan in force. Read
   * once, on arrival: the READY of a first plan puts one in force, and this screen is then leaving.
   */
  protected readonly mode: 'start' | 'replan' =
    (this.session.state()?.activePlanId ?? null) === null ? 'start' : 'replan';

  protected openPlan(): void {
    void this.router.navigateByUrl(PLAN_PATH);
  }

  /** Lets the route composition decide again what `/hoje` shows. */
  protected reroute(): void {
    if (this.mode === 'replan') {
      void this.router.navigateByUrl('/hoje', { onSameUrlNavigation: 'reload' });
    }
  }
}
