import type { GoalStatus } from '../../core/api/contract/enums';

/** State of a goal. Abandoning a goal is legitimate data, not a failure: the label is neutral. */
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  ACTIVE: 'Ativa',
  ACHIEVED: 'Alcançada',
  ABANDONED: 'Abandonada',
};
