import type { PlanGenerationFailure } from '../../core/api/contract/enums';

/**
 * What the student can do after each failure. Only ONE suggests asking again now: an unavailable
 * service is the one failure the server itself treats as worth another attempt
 * (`PlanGenerationFailure.isWorthRetrying`), and a new request retries on its own over minutes. A
 * refused request would be refused again with the same goals and windows; "nothing to plan" needs a
 * goal or a window first; and a defect of the platform is not the student's to work around.
 */
export const PLAN_GENERATION_FAILURE_NEXT_LABELS: Record<PlanGenerationFailure, string> = {
  CORE_UNAVAILABLE:
    'Você pode pedir de novo agora. Se o serviço continuar fora do ar, o novo pedido também tenta algumas vezes antes de desistir.',
  CORE_REJECTED:
    'Pedir de novo sem mudar nada leva à mesma recusa. Revise sua disponibilidade ou suas metas — por exemplo, declare mais horários — e então peça um plano.',
  NOTHING_TO_PLAN:
    'Confira se você tem ao menos uma meta ativa e uma janela de estudo que vale a partir de hoje, e então peça um plano.',
  INTERNAL: 'Tente de novo mais tarde.',
};
