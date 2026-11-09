import type { ClassroomStatus } from '../../core/api/contract/enums';

/** State of a classroom. */
export const CLASSROOM_STATUS_LABELS: Record<ClassroomStatus, string> = {
  OPEN: 'Aberta',
  ARCHIVED: 'Arquivada',
};
