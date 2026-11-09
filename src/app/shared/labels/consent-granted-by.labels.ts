import type { ConsentGrantedBy } from '../../core/api/contract/enums';

/** Who granted a consent. Only `SELF` occurs in v1; the guardian branch is not built. */
export const CONSENT_GRANTED_BY_LABELS: Record<ConsentGrantedBy, string> = {
  SELF: 'Por você',
  GUARDIAN: 'Por um responsável',
};
