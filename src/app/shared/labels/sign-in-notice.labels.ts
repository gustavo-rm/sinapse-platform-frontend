import type { SignInNotice } from '../../core/session/session-store';

/**
 * What the sign-in screen says about how the person got there. Not a server enum: the notices are
 * this client's, defined in `core/session/session-store.ts`.
 */
export const SIGN_IN_NOTICE_LABELS: Record<SignInNotice, string> = {
  'session-expired': 'Sua sessão terminou. Entre de novo para continuar.',
  'password-changed':
    'Sua senha foi alterada, e todas as sessões desta conta foram encerradas. Entre com a nova senha.',
  // A security statement, so it says exactly what is known: the server did not confirm. The
  // session cookie is HttpOnly and this client cannot remove it, so the session may still work
  // in this browser until it expires.
  'sign-out-unconfirmed':
    'Não foi possível confirmar com o servidor o fim da sessão. Ela pode continuar ativa neste navegador até expirar. Tente sair de novo quando a conexão voltar.',
};
