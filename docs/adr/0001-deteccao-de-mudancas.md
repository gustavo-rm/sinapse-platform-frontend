# ADR 0001 — Detecção de mudanças sem zone.js

**Data:** 6 de novembro de 2026
**Status:** aceita

## Contexto

O projeto foi criado na tarefa FE-2 com `ng new` do Angular CLI 22.2.6, sem nenhuma opção de
detecção de mudanças. O que o gerador entregou, observado nos arquivos gerados:

- nenhum `zone.js` em `package.json`, e nenhum instalado em `node_modules`;
- nenhuma entrada `polyfills` em `angular.json`;
- `app.config.ts` só com `provideBrowserGlobalErrorListeners()` e `provideRouter(routes)`, sem
  `provideZoneChangeDetection()`.

Ou seja, a aplicação nasce **sem zone.js**: a detecção de mudanças não é disparada por qualquer
evento assíncrono do navegador, e sim pelos *signals* que o *template* lê, pelos eventos do próprio
*template* e por chamadas explícitas.

A instrução da tarefa foi registrar a escolha do CLI e não mudá-la em silêncio, em nenhum dos
sentidos. Este registro cumpre isso e avalia se a escolha serve ao produto.

O que pesa a favor dela é o modo como este cliente já foi desenhado:

- o estado remoto vem de `httpResource`, que expõe o resultado como *signal* (`CLAUDE.md`, *Stack*);
- o estado de sessão vem de um único *store* que lê `GET /api/v1/me/state` (`CLAUDE.md`, *Session and time, in one place*);
- o fuso da conta, em `AccountTimeService`, já é um *signal*;
- o `SessionTimer` conta pelo relógio de parede a partir de `startedAt`, e não por incremento
  local (`docs/DESIGN_SYSTEM.md` §8), e a espera da geração de plano é uma consulta periódica com
  escada de intervalos — os dois dependem de um tique explícito, com ou sem zone.js.

Nada do que existe ou foi especificado depende de zone.js.

## Decisão

**Mantém-se o padrão do CLI: sem zone.js.** Não se adiciona `zone.js` nem
`provideZoneChangeDetection()`. Os componentes usam `ChangeDetectionStrategy.OnPush` e guardam em
*signals* todo estado que a tela mostra.

## Alternativas consideradas

**zone.js com `provideZoneChangeDetection()`.** Faz a tela se atualizar depois de qualquer tarefa
assíncrona, inclusive a que mudou um campo comum. Rejeitada: acrescenta uma dependência e um
*polyfill* ao pacote inicial para resolver um problema que este cliente não tem, e esconde o
defeito de um estado que não é reativo — a tela se atualiza por acaso, e deixa de se atualizar
quando a ordem dos eventos muda.

**zone.js com `eventCoalescing`.** Reduz o número de ciclos, mas mantém a dependência e o mesmo
efeito de esconder estado não reativo. Rejeitada pelos mesmos motivos.

## Consequências

- Toda mudança que a tela precisa mostrar passa por um *signal* (ou, em último caso, por
  `ChangeDetectorRef.markForCheck()`). Um campo comum alterado dentro de um `setTimeout` **não**
  redesenha a tela. No `SessionTimer` e no acompanhamento da geração de plano, o tique escreve em
  um *signal*.
- Os testes de componente esperam a estabilidade com `await fixture.whenStable()`, como as
  especificações de FE-2 já fazem.
- O *pipe* `accountDate` é impuro de propósito: o fuso da conta pode chegar depois da primeira
  renderização, e a leitura do *signal* dentro do *pipe* é o que faz o texto acompanhar a mudança
  (teste em `account-date.pipe.spec.ts`).
- Fica fora qualquer biblioteca que dependa de zone.js para funcionar. Isso é coerente com a regra
  de não adotar biblioteca de componentes, de estado ou de validação de esquema sem ADR
  (`CLAUDE.md`, *Stack*).
- A reversão é local — `zone.js` em `package.json`, `polyfills` em `angular.json` e
  `provideZoneChangeDetection()` em `app.config.ts` — e exige uma nova ADR.
