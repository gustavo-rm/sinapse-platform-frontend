import type { ProblemType } from '../../core/api/contract/problem-type';

/**
 * What to tell a person for each problem type. The response's `detail` is English text for a
 * developer and is never shown; this is the only source of error wording.
 *
 * These are the catalogue defaults. A screen that knows more — a `conflict` raised by asking for a
 * second plan while one is being made — may say something more specific, still chosen by `type`.
 */
export const PROBLEM_TYPE_LABELS: Record<ProblemType, string> = {
  'urn:sinapse:problem:validation-failed':
    'Alguns campos não foram aceitos. Veja a indicação em cada um.',
  'urn:sinapse:problem:malformed-request': 'Não foi possível ler os dados enviados.',
  'urn:sinapse:problem:time-window-invalid':
    'Escolha um intervalo de datas menor, com o fim depois do início.',
  'urn:sinapse:problem:unauthenticated': 'Sua sessão terminou. Entre de novo para continuar.',
  'urn:sinapse:problem:access-denied': 'Esta conta não tem permissão para esta operação.',
  'urn:sinapse:problem:resource-not-found':
    'Este conteúdo não existe ou não está disponível para esta conta.',
  'urn:sinapse:problem:method-not-allowed': 'Esta operação não está disponível.',
  'urn:sinapse:problem:not-acceptable': 'Não foi possível obter a resposta no formato esperado.',
  'urn:sinapse:problem:minor-registration-not-supported':
    'Nesta versão, só quem é maior de idade pode criar uma conta. O cadastro com consentimento de um responsável ainda não está disponível.',
  'urn:sinapse:problem:prerequisite-cycle':
    'Esta mudança faria um tópico depender de si mesmo. Os pré-requisitos não podem formar um ciclo.',
  'urn:sinapse:problem:setup-incomplete':
    'Falta dizer quando você estuda e o que você quer vencer.',
  'urn:sinapse:problem:conflict': 'A operação não é compatível com o estado atual dos seus dados.',
  'urn:sinapse:problem:payload-too-large': 'Os dados enviados excedem o tamanho aceito.',
  'urn:sinapse:problem:unsupported-media-type': 'O formato dos dados enviados não é aceito.',
  'urn:sinapse:problem:rate-limit-exceeded': 'Muitas tentativas em pouco tempo.',
  'urn:sinapse:problem:internal-error': 'Não foi possível concluir a operação.',
  'urn:sinapse:problem:service-unavailable': 'O serviço está indisponível no momento.',
};
