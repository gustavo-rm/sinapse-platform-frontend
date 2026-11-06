import type { SessionSource } from '../../core/api/contract/enums';

/** Whether a session came from the plan or was chosen by the student. */
export const SESSION_SOURCE_LABELS: Record<SessionSource, string> = {
  FROM_PLAN: 'Do plano',
  SELF_DIRECTED: 'Por conta própria',
};
