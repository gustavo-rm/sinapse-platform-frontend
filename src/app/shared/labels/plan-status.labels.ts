import type { PlanStatus } from '../../core/api/contract/enums';

/** State of a study plan. */
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  ACTIVE: 'Ativo',
  SUPERSEDED: 'Substituído',
};
