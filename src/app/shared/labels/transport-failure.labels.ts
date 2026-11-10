import type { TransportFailureReason } from '../../core/api/api-problem';

/**
 * What to tell a person when the server did not answer in the contract (`TransportFailure`). Not a
 * server enum: the reasons are this client's, defined in `core/api/api-problem.ts`.
 */
export const TRANSPORT_FAILURE_LABELS: Record<TransportFailureReason, string> = {
  network: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  timeout: 'O servidor demorou demais para responder.',
  unreadable: 'A resposta do servidor não pôde ser lida.',
};
