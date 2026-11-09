import type { DurationSource } from '../../core/api/contract/enums';

/** Whether the server measured the duration or the student reported it. */
export const DURATION_SOURCE_LABELS: Record<DurationSource, string> = {
  MEASURED: 'Duração medida',
  SELF_REPORTED: 'Duração informada',
};
