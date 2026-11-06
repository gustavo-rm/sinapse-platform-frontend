import type { AccountStatus } from '../../core/api/contract/enums';

/** Account status, as `/me/state` and registration report it. */
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  PENDING_VERIFICATION: 'Aguardando verificação',
  PENDING_GUARDIAN_CONSENT: 'Aguardando consentimento do responsável',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  ANONYMIZED: 'Anonimizada',
};
