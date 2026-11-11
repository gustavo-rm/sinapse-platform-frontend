/**
 * Where the initial setup stands, as the finishing block of `/configurar` says it.
 *
 * **Complete is the server's word, never this client's.** `setupComplete` comes from
 * `GET /api/v1/me/state`, read again after every write (`SessionStore.refresh`), and it alone says
 * `complete`. The server's condition (backend `PlanningDirectoryService.isReadyToPlan`, the single
 * statement of closed decision F2, read by the bootstrap and by the generation job alike): an active
 * goal, and an availability window effective at some point between the server's today and the end
 * of the horizon a plan would be generated for (four weeks, F3). That second half is not in the
 * contract, which types the flag as a bare boolean.
 *
 * What this function adds is only the explanation of a `false`, from what the screen holds:
 * nothing declared, no active goal, or both present and the server still not satisfied — which
 * can only be windows that do not apply in the coming weeks.
 */
export type SetupStanding =
  | 'complete'
  | 'needs-window-and-goal'
  | 'needs-window'
  | 'needs-goal'
  | 'windows-outside-horizon'
  /** The state could not be read: nothing is claimed either way. */
  | 'unknown';

export function setupStanding(
  setupComplete: boolean | null,
  declaredWindows: number,
  activeGoals: number,
): SetupStanding {
  if (setupComplete === null) {
    return 'unknown';
  }
  if (setupComplete) {
    return 'complete';
  }
  if (declaredWindows === 0 && activeGoals === 0) {
    return 'needs-window-and-goal';
  }
  if (declaredWindows === 0) {
    return 'needs-window';
  }
  if (activeGoals === 0) {
    return 'needs-goal';
  }
  return 'windows-outside-horizon';
}

/** The two steps of `/configurar`, in this order: the routine first, the goals second. */
export const SETUP_STEPS = ['availability', 'goals'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
