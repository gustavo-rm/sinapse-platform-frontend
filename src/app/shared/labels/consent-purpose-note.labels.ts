import type { ConsentPurpose } from '../../core/api/contract/enums';

/**
 * What a purpose means for the service, said next to the control that grants it
 * (`sn-choice__note`). The research note says, in these words, that refusing changes nothing: the
 * Design System requires it, because without it the consent is not free (ADR 0004).
 */
export const CONSENT_PURPOSE_NOTE_LABELS: Record<ConsentPurpose, string> = {
  LEARNING_DATA_PROCESSING: 'Sem ela, a plataforma não consegue montar nem acompanhar seu plano.',
  INSTITUTION_SHARING: 'Consentido somente ao entrar em uma turma por convite.',
  ACADEMIC_RESEARCH: 'Recusar não muda nada no serviço.',
};
