import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { isRateLimitExceeded } from '../../../core/api/api-problem';
import { APP_HOME_PATH } from '../../../core/session/gate';
import { SessionStore } from '../../../core/session/session-store';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice/rate-limit-notice';

/**
 * Where the guard chain sends a person when the bootstrap itself failed — no network, an
 * unreadable answer (decision D1: a required member absent), a server error, a rate-limit refusal.
 * Nothing about the session is known, so neither the application nor the sign-in screen is right.
 *
 * The four states of `docs/DESIGN_SYSTEM.md` §9: loading while asking again, the error by its type
 * or reason, the rate-limit notice with no retry control. There is no empty state: a bootstrap
 * has no empty answer.
 */
@Component({
  selector: 'sn-session-unavailable-page',
  imports: [ErrorState, LoadingState, RateLimitNotice],
  template: `
    <h1 class="display-md">Não foi possível abrir o SINAPSE</h1>
    <div class="state" aria-live="polite">
      @if (retrying()) {
        <sn-loading-state label="Carregando o estado da sua conta" [count]="2" />
      } @else if (rateLimited(); as refusal) {
        <sn-rate-limit-notice [retryAfterSeconds]="refusal.retryAfterSeconds" />
      } @else if (failure(); as problem) {
        <sn-error-state
          [problem]="problem"
          description="O estado da sua conta não pôde ser carregado, e nada foi alterado."
          (retry)="retry()"
        />
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    h1 {
      margin: 0 0 var(--space-6);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionUnavailablePage {
  private readonly store = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly retrying = signal(false);
  protected readonly failure = this.store.failure;
  protected readonly rateLimited = computed(() => {
    const failure = this.failure();
    return isRateLimitExceeded(failure) ? failure : null;
  });

  protected async retry(): Promise<void> {
    this.retrying.set(true);
    const outcome = await this.store.refresh();
    this.retrying.set(false);
    // Signed out: the expiry path has already gone to sign in. Failed again: the new failure shows.
    if (outcome.kind === 'signed-in') {
      // The guard chain runs again on arrival and decides where the person may go.
      await this.router.navigateByUrl(this.store.attemptedRoute() ?? APP_HOME_PATH);
    }
  }
}
