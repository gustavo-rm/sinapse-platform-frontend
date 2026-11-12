import { inject } from '@angular/core';
import type { CanActivateChildFn, CanActivateFn, CanMatchFn, GuardResult } from '@angular/router';
import { RedirectCommand, Router } from '@angular/router';

import {
  APP_HOME_PATH,
  type Bootstrap,
  type GuardTarget,
  SESSION_UNAVAILABLE_PATH,
  accessTo,
  accessToPublic,
  pathOf,
} from './gate';
import type { AccountState } from './account-state';
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

/**
 * On a public screen that creates or recovers an account — registration, password reset (FE-6).
 * The mirror of `gateGuard`: nobody signed in belongs there, so a person with a session is sent on
 * to where the chain says they belong (`accessToPublic`). A person with none is let through.
 *
 * - The state is read through `SessionStore.peek`, for which a 401 is the expected answer of a
 *   visitor and not an expiry: no redirect to sign in, no notice, no remembered route.
 * - A bootstrap that FAILED tells nothing about the session, and these screens depend on none: the
 *   person is let through, and the form shows its own error if the server is unreachable.
 * - The redirect REPLACES the history entry, so the link's `?token=` of a reset opened by a person
 *   with a session does not stay in the back stack.
 */
export const publicGuard: CanActivateFn = async () => {
  const store = inject(SessionStore);
  const router = inject(Router);

  const outcome = await store.peek();
  if (outcome.kind !== 'signed-in') {
    return true;
  }
  const access = accessToPublic({ kind: 'state', state: outcome.state }, store.chainContext());
  if (access === true) {
    return true;
  }
  return new RedirectCommand(router.parseUrl(access === 'app' ? APP_HOME_PATH : pathOf(access)), {
    replaceUrl: true,
  });
};

/**
 * Whether `/hoje` shows the states of the PLAN rather than the day (`docs/DESIGN_SYSTEM.md` §2.2): a plan is
 * being made (`activeGenerationJobId`), or there is none in force (`activePlanId` absent). Never a
 * gate — the chain does not hold anyone on a plan state; it is which screen `/hoje` is.
 *
 * Row 1 of `docs/DESIGN_SYSTEM.md` §2.2 — a study session in progress comes before both — is FE-9's, with the screen that
 * resumes it; until then an open session does not change what `/hoje` shows.
 */
export function todayShowsPlan(state: AccountState): boolean {
  return (
    state.accountStatus === 'ACTIVE' &&
    (state.activeGenerationJobId !== null || state.activePlanId === null)
  );
}

/**
 * `canMatch` of the plan's `/hoje` (FE-8): the route composition chooses between the plan's
 * screen and the day's by the session state, so neither feature imports the other (R3). Awaits
 * the one bootstrap; anything but a signed-in state falls through to the day's route, whose
 * `sessionGuard` then does what the chain says.
 */
export const todayPlanMatch: CanMatchFn = async () => {
  const outcome = await inject(SessionStore).ensureLoaded();
  return outcome.kind === 'signed-in' && todayShowsPlan(outcome.state);
};
