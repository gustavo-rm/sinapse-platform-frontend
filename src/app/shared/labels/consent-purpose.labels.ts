import type { ConsentPurpose } from '../../core/api/contract/enums';

/** Name of each consent purpose. `INSTITUTION_SHARING` is the sharing a classroom is made of, consented only when an invite is redeemed. */
export const CONSENT_PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  LEARNING_DATA_PROCESSING: 'Processamento de dados de aprendizagem',
  INSTITUTION_SHARING: 'Compartilhamento com a turma',
  ACADEMIC_RESEARCH: 'Pesquisa acadêmica',
};
