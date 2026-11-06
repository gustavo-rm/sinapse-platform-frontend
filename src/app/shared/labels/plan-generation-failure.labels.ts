import type { PlanGenerationFailure } from '../../core/api/contract/enums';

/** Why a plan generation ended without a plan. Sentences, because each is shown as the explanation of the failure; none exposes the engine or its vocabulary. */
export const PLAN_GENERATION_FAILURE_LABELS: Record<PlanGenerationFailure, string> = {
  CORE_UNAVAILABLE: 'O serviço que monta o plano não respondeu, mesmo depois de novas tentativas.',
  CORE_REJECTED: 'Houve um problema técnico ao gerar o plano.',
  NOTHING_TO_PLAN: 'Não há conteúdo a planejar com as metas e a disponibilidade atuais.',
  INTERNAL: 'Não foi possível gerar o plano por uma falha interna.',
};
