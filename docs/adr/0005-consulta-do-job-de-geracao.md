# ADR 0005 — Quando o cliente consulta o job de geração, e quando para

**Data:** 13 de novembro de 2026
**Status:** aceita, sujeita à confirmação do dono do projeto
**Decisão:** tomada na tarefa FE-8. O *prompt* pede que se decida e justifique o intervalo e o
limite da consulta; o *design system* e o documento do *backend* propõem valores diferentes entre si
e diferentes deste.

## Contexto

A geração de plano é um job consultado: `POST /api/v1/study-plans/generation-requests` responde 201
com o job, e o estado se lê em `GET …/generation-requests/{requestId}`. Não há evento, e a resposta
não traz dica de intervalo.

O que o servidor faz, lido em `sinapse-platform@44f3d1f` e observado:

- o *worker* procura trabalho a cada 10 s (`poll-cron: '0/10 * * * * *'`), um job por passada, numa
  thread só (K15 do *backend*). Um job só sai de `PENDING` num múltiplo de 10 s;
- com o motor padrão (`greedy-baseline`) a chamada ao Core leva menos de um segundo: observado
  0,07 a 0,45 s entre `startedAt` e `finishedAt`. Do clique ao `READY`, medido: 7,5 s, 9 s e 10,2 s;
- com o Core fora do ar, o job volta a `PENDING` e é tentado de novo até três vezes, com espera de
  30 s e depois 60 s: medido **120,7 s** do clique ao `FAILED` (`CORE_UNAVAILABLE`, `attemptCount` 3);
- um Core que aceita e não responde segura cada tentativa pelo *read timeout* de 10 min: até ~31 min
  até `FAILED`, pelo documento do *backend* (não observado);
- o `GET` de consulta não tem limite de taxa.

As propostas existentes:

- o artefato do *design system* (`GenerationProgress`): 2 s nos primeiros 30 s, depois 5 s, depois
  10 s, até um teto de 12 minutos;
- o `FLUXO_DE_PLANO_FRONTEND.md` do *backend*: 2–3 s enquanto o job não termina, sem teto.

## Alternativas

1. **2 s / 5 s / 10 s com teto de 12 min (artefato).** O 12 vem do limite de job órfão (12 min 05 s),
   que é quando o servidor recupera um job de um *worker* morto — não quando um aluno deixa de
   ganhar algo olhando a tela. Doze minutos olhando um relógio é a espera "girando para sempre" que o
   *prompt* quer evitar.
2. **2–3 s sem teto (backend).** Correto para o caso normal; sem teto, uma aba esquecida consulta
   por meia hora um Core travado.
3. **Um segundo.** Não antecipa nada: o estado não muda mais rápido que o ciclo de 10 s do *worker*.
   Seriam 300 consultas em cinco minutos para a mesma informação que 44 dão.
4. **Alinhar a consulta às passadas do *worker*.** Ele roda nos segundos 0, 10, 20… do relógio do
   servidor; o cliente não conhece o relógio do servidor com precisão, e uma consulta "logo depois da
   passada" erraria pela diferença entre os relógios. Complexidade sem ganho garantido.
5. **A escada escolhida (abaixo).**

## Decisão

`DEFAULT_POLL_SCHEDULE` em `features/plan/model/generation.ts`:

- **a cada 3 s no primeiro minuto** desde o pedido. O caso normal termina na primeira ou na segunda
  passada; 3 s somam no máximo 3 s (1,5 s em média) a uma espera de até 10 s;
- **a cada 10 s depois disso.** Passado um minuto, o job está esperando uma nova tentativa (30 s,
  depois 60 s) ou atrás de outros numa fila que anda um job por passada de 10 s. Nada muda mais rápido
  que o ciclo do *worker*;
- **para aos 5 minutos** desde o pedido. O caminho documentado mais longo até um estado terminal com
  o Core recusando conexões é de uns dois minutos (medido: 120,7 s); cinco dão mais que o dobro de
  folga. Depois disso, as únicas causas documentadas são um Core que aceita e não responde, ou uma fila
  longa, e mais consultas não ensinam nada a quem está olhando. A tela para o relógio, diz que o pedido
  continua no servidor, que a pessoa pode sair e voltar, e oferece **uma** consulta manual
  ("Consultar agora");
- **pausa com a aba oculta** (`visibilitychange`), como o artefato pede; ao voltar, uma consulta
  imediata, e a escada segue de onde o tempo decorrido está;
- **para em estado terminal** (`READY`, `FAILED`, `CANCELLED`) **e quando o componente morre**: o
  acompanhamento (`GenerationWatch`) é provido por componente e limpa o *timeout* e o intervalo do
  relógio no `DestroyRef`. O job segue no servidor; ao voltar, `activeGenerationJobId` de `/me/state`
  o retoma;
- um 429 na consulta não é repetido; um 404 encerra (o job não é desta conta); uma falha de rede, de
  tempo ou 5xx mantém a escada e diz que a última consulta não teve resposta.

O tempo decorrido é medido do `requestedAt` do servidor pelo relógio do cliente, nunca negativo; uma
diferença entre os relógios aparece como alguns segundos a mais ou a menos no relógio da tela.

## Consequências

- Em cinco minutos o cliente faz 44 consultas, contra 300 a um segundo.
- O artefato precisa ser nivelado: a escada e o teto dele não são os deste cliente (`STATE.md`, F25).
- Os valores estão num `InjectionToken` (`POLL_SCHEDULE`); os testes usam uma escada de
  milissegundos com a mesma forma.
- Se o *backend* mudar o `poll-cron`, o `max-attempts` ou o `retry-backoff`, esta escada deve ser
  revista: nada no contrato avisa.
