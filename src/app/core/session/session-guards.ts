import { inject } from '@angular/core';
import type { CanActivateChildFn, CanActivateFn, GuardResult } from '@angular/router';
import { Router } from '@angular/router';

import {
  APP_HOME_PATH,
  type Bootstrap,
  type GuardTarget,
  SESSION_UNAVAILABLE_PATH,
  accessTo,
  pathOf,
} from './gate';
import { SessionStore } from './session-store';

/**
 * What a guard decides for a navigation to `url` that asked for `target`. Awaits the bootstrap —
 * one request however many guards ask, `SessionStore.ensureLoaded` — before anything renders, then
 * applies the chain of `gate.ts`.
 *
 * Asynchronous on purpose: `CanActivateFn` may return a `Promise<GuardResult>` in the installed
 * router (`MaybeAsync<GuardResult>`), and the router holds the navigation — and with it every
 * render — until it settles. The router registers each navigation as a pending task, so a
 * zoneless application, and `fixture.whenStable()` in a test, wait for it too.
 */
async function decide(target: GuardTarget, url: string): Promise<GuardResult> {
  // inject() only works before the first await.
  const store = inject(SessionStore);
  const router = inject(Router);

  const outcome = await store.ensureLoaded();
  if (outcome.kind === 'failed') {
    // Nothing can be decided without the state: not a screen of the application, which would
    // flash a signed-in shell, nor sign-in, which would say the session ended when that is not
    // known. The failure screen says what happened and offers to try again.
    store.remember(url);
    return router.parseUrl(SESSION_UNAVAILABLE_PATH);
  }

  const bootstrap: Bootstrap =
    outcome.kind === 'signed-out'
      ? { kind: 'unauthenticated' }
      : { kind: 'state', state: outcome.state };
  const access = accessTo(bootstrap, target, store.chainContext());
  if (access === true) {
    if (target === 'anonymized') {
      // Row 2: the account no longer exists as a person's. Nothing of it stays in memory, and the
      // terminal screen offers no way back.
      store.forget();
    }
    return true;
  }
  if (access === 'sign-in') {
    store.remember(url);
  }
  return router.parseUrl(access === 'app' ? APP_HOME_PATH : pathOf(access));
}

/**
 * On the student area: every child route runs the chain, on every navigation, so a state that
 * changed since the last one (a refresh after consent, after setup) is honoured. No request after
 * the first: the store keeps the answer until something refreshes it.
 */
export const sessionGuard: CanActivateChildFn = (_route, state) => decide('app', state.url);

/** On a gate screen: open only to the person the chain sends there. */
export function gateGuard(gate: Exclude<GuardTarget, 'app'>): CanActivateFn {
  return (_route, state) => decide(gate, state.url);
}

/**
 * On the failure screen: only while the bootstrap has failed. Reached any other way — a reload of
 * its address — it sends the person into the application, whose guard decides.
 */
export const unavailableGuard: CanActivateFn = () => {
  const store = inject(SessionStore);
  return store.status() === 'failed' ? true : inject(Router).parseUrl(APP_HOME_PATH);
};
