import { Injectable, computed, inject, isDevMode, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../api/api-client';
import {
  type ApiFailure,
  TransportFailure,
  isApiFailure,
  isUnauthenticated,
} from '../api/api-problem';
import { ApiRoutes } from '../api/api-routes';
import { AccountTimeService } from '../time/account-time.service';
import { type AccountState, readAccountState } from './account-state';
import { SIGN_IN_PATH } from './gate';

/**
 * Where the store stands.
 *
 * - `unknown`: nothing asked yet (a cold start).
 * - `loading`: the first bootstrap is under way.
 * - `signed-in`: a state was read; `state()` holds it.
 * - `signed-out`: the server said there is no session, or this client ended it.
 * - `failed`: the first bootstrap failed in a way that tells nothing about the session (no
 *   network, an unreadable body, a 5xx, a 429); `failure()` holds why.
 */
export type SessionStatus = 'unknown' | 'loading' | 'signed-in' | 'signed-out' | 'failed';

/** What a bootstrap, or a refresh, came to. */
export type BootstrapOutcome =
  | { readonly kind: 'signed-in'; readonly state: AccountState }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'failed'; readonly failure: ApiFailure };

/**
 * What the sign-in screen should say about how the person got there. A client-side value, not a
 * server enum; its wording is in `shared/labels/sign-in-notice.labels.ts`.
 *
 * - `session-expired`: a request found the session gone while the person was signed in.
 * - `password-changed`: the password was changed, which ends every session of the account.
 * - `sign-out-unconfirmed`: signing out did not reach the server, which may still hold the session.
 */
export const SIGN_IN_NOTICES = [
  'session-expired',
  'password-changed',
  'sign-out-unconfirmed',
] as const;
export type SignInNotice = (typeof SIGN_IN_NOTICES)[number];

/**
 * The session, and the only caller of `GET /api/v1/me/state` (`CLAUDE.md`, *Session and time,
 * in one place*). Screens and guards read it; none of them calls that route.
 *
 * In memory only. Nothing is written to `localStorage`, `sessionStorage`, IndexedDB or a cookie:
 * the session is the server's `HttpOnly` cookie, and the token `POST /api/v1/sessions` also puts
 * in its body is discarded by the caller before it reaches this class.
 *
 * The read is imperative (`ApiClient.get`), not an `httpResource`. A guard has to await one
 * answer before anything renders, and several guards of one cold navigation have to share it: a
 * single in-flight promise gives both directly, where a resource would need its signal turned
 * back into a promise and a guard against its re-running on every signal it reads. The state the
 * screens read is still a signal (`state()`), so change detection is driven by signals as ADR
 * 0001 decides.
 *
 * Also the session-expiry path of the API layer (the stub `SessionExpiry` of FE-3 is folded in,
 * keeping its contract): `expire()` acts once per session, however many requests fail together,
 * remembers the route the person was on, and sends them to sign in.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly time = inject(AccountTimeService);

  private readonly current = signal<AccountState | null>(null);
  private readonly phase = signal<SessionStatus>('unknown');
  private readonly lastFailure = signal<ApiFailure | null>(null);
  private readonly ended = signal(false);
  private readonly attempted = signal<string | null>(null);
  private readonly pendingNotice = signal<SignInNotice | null>(null);

  /** The request in flight, shared by everyone who asks while it runs. */
  private inFlight: Promise<BootstrapOutcome> | null = null;
  /** Bumped whenever the session changes hands, so a late answer for an old one is dropped. */
  private epoch = 0;

  /** The state last read, or null when signed out or not read yet. */
  readonly state = this.current.asReadonly();
  readonly status = this.phase.asReadonly();
  /** Why the first bootstrap failed, while `status()` is `failed`. */
  readonly failure = this.lastFailure.asReadonly();
  readonly isSignedIn = computed(() => this.phase() === 'signed-in');

  /** True from the end of a session until a new one begins. */
  readonly hasEnded = this.ended.asReadonly();
  /** The in-app route the person was on when the session ended, to return to after signing in. */
  readonly attemptedRoute = this.attempted.asReadonly();
  /** What the sign-in screen should say, if anything. */
  readonly notice = this.pendingNotice.asReadonly();

  /**
   * The bootstrap, read once. While a read is in flight every caller gets the same promise; once
   * signed in or signed out, the answer is kept and no request is made. After a failure the next
   * call asks again. Never rejects.
   */
  ensureLoaded(): Promise<BootstrapOutcome> {
    const state = this.current();
    switch (this.phase()) {
      case 'signed-in':
        return Promise.resolve({ kind: 'signed-in', state: state as AccountState });
      case 'signed-out':
        return Promise.resolve({ kind: 'signed-out' });
      case 'loading':
        return this.inFlight ?? this.load();
      case 'unknown':
      case 'failed':
        return this.load();
    }
  }

  /**
   * Reads the state again, after something that changes it: consent given, setup completed, a
   * plan generation finished, a sign-in. Callable without a navigation. A failure keeps the state
   * already held — a refresh that did not reach the server says nothing about the session — and is
   * returned to the caller. Never rejects.
   */
  refresh(): Promise<BootstrapOutcome> {
    return this.load();
  }

  /**
   * The server said the session is gone (`urn:sinapse:problem:unauthenticated`). Clears the store,
   * keeps the route the person was on or was going to, and sends them to sign in. Once per
   * session: returns false, doing nothing, when the session has already ended.
   */
  expire(): boolean {
    if (this.ended()) {
      return false;
    }
    const wasSignedIn = this.phase() === 'signed-in';
    this.remember(this.routeInView());
    this.clear();
    this.pendingNotice.set(wasSignedIn ? 'session-expired' : null);
    void this.router.navigateByUrl(SIGN_IN_PATH);
    return true;
  }

  /**
   * This client ended the session: signed out, or changed the password (which ends every session
   * of the account; the 204 is the signal, no 401 is awaited). Clears the store and goes to sign
   * in, forgetting the route: the person chose to leave.
   */
  end(notice: SignInNotice | null = null): void {
    this.clear();
    this.attempted.set(null);
    this.pendingNotice.set(notice);
    void this.router.navigateByUrl(SIGN_IN_PATH);
  }

  /** Clears the store without navigating: for the terminal screen of an anonymised account. */
  forget(): void {
    this.clear();
    this.attempted.set(null);
  }

  /** Signs out: `DELETE /api/v1/sessions/current`. Always leaves the person on the sign-in screen. */
  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.api.delete(ApiRoutes.identity.currentSession));
      this.end();
    } catch (error) {
      // A 401: the session was already gone, which is what signing out wanted. Anything else — no
      // network, a 5xx — and the server may still hold it; say so rather than pretend.
      this.end(isUnauthenticated(error) ? null : 'sign-out-unconfirmed');
    }
  }

  /** Keeps `url` as the route to return to after signing in, unless it is the sign-in screen. */
  remember(url: string | null): void {
    if (url !== null && url !== '' && url !== '/' && !url.startsWith(SIGN_IN_PATH)) {
      this.attempted.set(url);
    }
  }

  /**
   * A new session began (`POST /api/v1/sessions` answered 201). Returns the route to go back to,
   * and forgets it: it is kept only until the next successful sign-in.
   */
  begin(): string | null {
    const back = this.attempted();
    this.epoch++;
    this.inFlight = null;
    this.ended.set(false);
    this.attempted.set(null);
    this.pendingNotice.set(null);
    this.phase.set('unknown');
    return back;
  }

  private load(): Promise<BootstrapOutcome> {
    const epoch = this.epoch;
    if (this.current() === null) {
      this.phase.set('loading');
    }
    const read = firstValueFrom(this.api.get<unknown>(ApiRoutes.readModel.myState)).then(
      (body) => this.settleBody(epoch, body),
      (error: unknown) => this.settleError(epoch, error),
    );
    this.inFlight = read;
    void read.finally(() => {
      if (this.inFlight === read) {
        this.inFlight = null;
      }
    });
    return read;
  }

  private settleBody(epoch: number, body: unknown): BootstrapOutcome {
    const reading = readAccountState(body);
    if (!reading.ok) {
      // The member's name is safe to log; its value, and the rest of the body, are not.
      if (isDevMode()) {
        console.warn(
          `[SessionStore] /me/state cannot be read: "${reading.member}" is missing or out of contract.`,
        );
      }
      return this.settleError(
        epoch,
        new TransportFailure(
          'unreadable',
          {
            method: 'GET',
            route: ApiRoutes.readModel.myState,
            correlationId: null,
          },
          200,
        ),
      );
    }
    if (epoch !== this.epoch) {
      return this.outcomeNow();
    }
    this.current.set(reading.state);
    this.lastFailure.set(null);
    this.phase.set('signed-in');
    this.time.setAccountZone(reading.state.timeZone);
    return { kind: 'signed-in', state: reading.state };
  }

  private settleError(epoch: number, error: unknown): BootstrapOutcome {
    if (epoch !== this.epoch) {
      return this.outcomeNow();
    }
    if (isUnauthenticated(error)) {
      // The session-expiry interceptor has already called expire(); this makes sure of the state
      // even when the session had already been marked ended.
      if (this.phase() !== 'signed-out') {
        this.clear();
      }
      return { kind: 'signed-out' };
    }
    const failure = isApiFailure(error)
      ? error
      : new TransportFailure('unreadable', {
          method: 'GET',
          route: ApiRoutes.readModel.myState,
          correlationId: null,
        });
    if (this.current() === null) {
      this.lastFailure.set(failure);
      this.phase.set('failed');
    }
    return { kind: 'failed', failure };
  }

  /** The outcome as the store now stands, for an answer that arrived for an earlier session. */
  private outcomeNow(): BootstrapOutcome {
    const state = this.current();
    return state === null ? { kind: 'signed-out' } : { kind: 'signed-in', state };
  }

  /** Empties the store and marks the session ended. No navigation. */
  private clear(): void {
    this.epoch++;
    this.inFlight = null;
    this.ended.set(true);
    this.current.set(null);
    this.lastFailure.set(null);
    this.phase.set('signed-out');
    this.time.setAccountZone(null);
  }

  /** The route the person is on, or is on the way to when a navigation is under way. */
  private routeInView(): string | null {
    const navigation = this.router.currentNavigation();
    const target = navigation?.finalUrl ?? navigation?.extractedUrl;
    return target ? this.router.serializeUrl(target) : this.router.url;
  }
}
