import type { ConsentPurpose } from '../../core/api/contract/enums';

/**
 * The kind of each purpose, as ADR 0004 of the backend classifies them. Shown beside the purpose's
 * name in the same badge for all three: essential and optional get the same visual treatment
 * (Design System, ConsentDisclosure), so the word carries the difference, never a colour.
 */
export const CONSENT_PURPOSE_KIND_LABELS: Record<ConsentPurpose, string> = {
  LEARNING_DATA_PROCESSING: 'Essencial',
  INSTITUTION_SHARING: 'Condicional',
  ACADEMIC_RESEARCH: 'Opcional',
};
