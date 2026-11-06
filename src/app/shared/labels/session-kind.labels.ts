import type { SessionKind } from '../../core/api/contract/enums';

/** Kind of an executed study session. */
export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  STUDY: 'Estudo',
  REVISION: 'Revisão',
};
