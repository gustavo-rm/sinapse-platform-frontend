import type { ConsentPurpose } from '../../core/api/contract/enums';

/**
 * What withdrawing each purpose does, said BEFORE the act. The backend's flows document, section 8
 * of `docs/FLUXOS_DE_USUARIO_SINAPSE.md`: the screen has to warn "beforehand, unambiguously".
 *
 * - `LEARNING_DATA_PROCESSING`: suspends the account and ends its sessions in the same transaction
 *   (`DELETE /api/v1/consents/{purpose}`). Granting it again does NOT reactivate the account:
 *   MEASURED in FE-5 against `sinapse-platform@46b5b3c` (201, and `accountStatus` stayed
 *   SUSPENDED, also after a new sign-in). The person is told so, because it makes the act
 *   irreversible from this client.
 * - `INSTITUTION_SHARING`: every teacher read checks the consent at the moment of the read, so
 *   access ends at once. Nothing about suspension: there is none.
 * - `ACADEMIC_RESEARCH`: what it does and nothing more. The contract says it "has no effect on the
 *   service"; a warning here would be the pressure ADR 0004 forbids.
 */
export const CONSENT_WITHDRAWAL_LABELS: Record<ConsentPurpose, string> = {
  LEARNING_DATA_PROCESSING:
    'Retirar este consentimento suspende a sua conta e encerra todas as suas sessões no mesmo instante, inclusive esta. Com a conta suspensa, as telas de estudo, agenda e plano deixam de funcionar. Nesta versão, dar o consentimento de novo não reativa a conta.',
  INSTITUTION_SHARING:
    'Retirar este consentimento encerra imediatamente o acesso dos professores das suas turmas aos seus dados de estudo.',
  ACADEMIC_RESEARCH:
    'Seus dados deixam de poder ser usados em pesquisa acadêmica. Nada muda no serviço.',
};
