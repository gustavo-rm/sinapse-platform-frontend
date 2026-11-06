import type { ErasureRequestStatus } from '../../core/api/contract/enums';

/** State of a data erasure request. */
export const ERASURE_REQUEST_STATUS_LABELS: Record<ErasureRequestStatus, string> = {
  REQUESTED: 'Eliminação pedida',
  COMPLETED: 'Eliminação concluída',
  CANCELLED: 'Pedido cancelado',
  FAILED: 'Falha na eliminação',
};
