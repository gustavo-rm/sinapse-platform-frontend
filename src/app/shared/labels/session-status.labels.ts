import type { SessionStatus } from '../../core/api/contract/enums';

/** State of a study session. Abandoning is legitimate data, not a failure: the label is neutral. */
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  ABANDONED: 'Abandonada',
};
