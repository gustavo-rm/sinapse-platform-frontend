import type { EnrollmentEndReason } from '../../core/api/contract/enums';

/** Why an enrollment ended. The server never writes `CONSENT_REVOKED` today (backend ADR 0005); it is labelled because the schema carries it. */
export const ENROLLMENT_END_REASON_LABELS: Record<EnrollmentEndReason, string> = {
  STUDENT_LEFT: 'Você saiu da turma',
  TEACHER_REMOVED: 'Encerrada pelo professor',
  CLASSROOM_ARCHIVED: 'Turma arquivada',
  CONSENT_REVOKED: 'Compartilhamento revogado',
};
