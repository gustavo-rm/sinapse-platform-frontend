import type { PlannedSessionKind } from '../../core/api/contract/enums';

/** Kind of a planned session. */
export const PLANNED_SESSION_KIND_LABELS: Record<PlannedSessionKind, string> = {
  STUDY: 'Estudo',
  REVISION: 'Revisão',
};
