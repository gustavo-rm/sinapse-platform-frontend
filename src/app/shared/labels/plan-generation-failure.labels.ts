import type { PlanGenerationFailure } from '../../core/api/contract/enums';

/**
 * What happened, when a plan generation ended without a plan (`failureReason` of a FAILED job).
 * Four situations for the student, so four sentences: a service that did not answer, a request the
 * optimiser refused, nothing to plan, and a defect of the platform. None names the engine, the
 * optimiser's vocabulary or a code (backend `docs/FLUXO_DE_PLANO_FRONTEND.md`, section 7), and none uses
 * "nós" (F8). What to do next is in `plan-generation-failure-next.labels.ts`.
 */
export const PLAN_GENERATION_FAILURE_LABELS: Record<PlanGenerationFailure, string> = {
  CORE_UNAVAILABLE:
    'O serviço que monta os planos não respondeu, nem nas novas tentativas que o servidor fez sozinho.',
  CORE_REJECTED:
    'O serviço que monta os planos recusou o pedido: não foi possível montar um plano com a sua disponibilidade e as suas metas como estão agora.',
  NOTHING_TO_PLAN:
    'Não havia o que planejar no momento em que o pedido foi processado: nenhuma meta ativa, ou nenhuma janela de estudo valendo nas próximas semanas.',
  INTERNAL:
    'Uma falha do próprio SINAPSE interrompeu a montagem do plano. Não foi algo que você fez.',
};
