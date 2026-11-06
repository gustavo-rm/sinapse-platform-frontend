import type { GenerationRequestStatus } from '../../core/api/contract/enums';

/** State of a plan generation request. Progress is never reported, so no label promises one. */
export const GENERATION_REQUEST_STATUS_LABELS: Record<GenerationRequestStatus, string> = {
  PENDING: 'Na fila',
  RUNNING: 'Em execução',
  READY: 'Pronto',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
};
