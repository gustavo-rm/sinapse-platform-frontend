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
  // Impersonal, and names no mechanism: the person cannot act on "cookie", and the cause is not
  // known for certain from here. What they can act on is that retrying the same way will not help.
  'session-not-established':
    'Os dados de acesso foram aceitos, mas não foi possível manter a sessão aberta neste navegador. Tentar de novo da mesma forma não deve resolver.',
  // Says what is known, and no more: the address was confirmed. Whether the account is now ACTIVE
  // is the server's decision (a holder below the consent age would wait for a guardian instead),
  // and signing in will show it.
  'email-verified': 'Seu e-mail foi confirmado. Entre com seu e-mail e sua senha para continuar.',
};
