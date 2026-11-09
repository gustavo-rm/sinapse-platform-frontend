import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** The route a person signs in on. */
export const SIGN_IN_PATH = '/entrar';

/**
 * STUB, until the session store of FE-4. What `sessionExpiryInterceptor` calls when the server
 * says the session is gone (`urn:sinapse:problem:unauthenticated`).
 *
 * It holds the little session state this task needs, in memory only (`CLAUDE.md` §9: store
 * nothing, no `localStorage`): whether the session has ended, and the route the person was on, so
 * that signing in can take them back. FE-4 replaces the state with the real store, fed by
 * `GET /api/v1/me/state`, and keeps this contract: `expire()` acts once per session, however many
 * requests fail with 401 at the same time.
 */
@Injectable({ providedIn: 'root' })
export class SessionExpiry {
  private readonly router = inject(Router);
  private readonly ended = signal(false);
  private readonly attempted = signal<string | null>(null);

  /** True from the first 401 until a new session begins. */
  readonly hasEnded = this.ended.asReadonly();

  /** The in-app route the person was on when the session ended, to return to after signing in. */
  readonly attemptedRoute = this.attempted.asReadonly();

  /**
   * Clears the session state, keeps the route the person was on, and sends them to sign in.
   * Returns false, doing nothing, when the session has already been ended.
   */
  expire(): boolean {
    if (this.ended()) {
      return false;
    }
    this.ended.set(true);
    const current = this.router.url;
    if (!current.startsWith(SIGN_IN_PATH)) {
      this.attempted.set(current);
    }
    void this.router.navigateByUrl(SIGN_IN_PATH);
    return true;
  }

  /** A new session began (FE-4 calls this after `POST /api/v1/sessions`). */
  begin(): void {
    this.ended.set(false);
    this.attempted.set(null);
  }
}
