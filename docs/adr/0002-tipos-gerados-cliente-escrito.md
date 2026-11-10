# ADR 0002 — Tipos gerados do contrato, cliente escrito à mão

**Data:** 9 de novembro de 2026
**Status:** aceita
**Decisão:** do dono do projeto, em 9 de novembro de 2026 (D-FE1 em `docs/ai/STATE.md`)

## Contexto

O backend publica sua API como um *snapshot* OpenAPI 3.1 versionado,
`docs/openapi/openapi.json` em `sinapse-platform`: 59 operações, 56 esquemas, nomes de operação
estabilizados e um esquema de erro (`ProblemDetails`) que descreve o corpo como ele sai. O próprio
backend escreveu o *snapshot* para que um cliente pudesse ser gerado dele (suas pendências K19,
K20, K31 e K32).

A questão aberta desde FE-1 (D-FE1) era o que gerar a partir dele:

- o **cliente inteiro** (`openapi-generator`, alvo `typescript-angular`), com um serviço por *tag*
  que chama o `HttpClient`;
- só os **tipos**, com o cliente escrito à mão;
- **nada**, tipos e cliente escritos à mão.

Duas regras de `CLAUDE.md` pesam na escolha. A R1 diz que só `core/api/**` importa `HttpClient`,
para que o tratamento de um 401 mude em um arquivo e não em quarenta. A R6 diz que os erros são
tratados pelo `type` do problema, nunca pelo *status* HTTP. As duas dependem de toda requisição
passar pela mesma cadeia de interceptadores, que converte o corpo RFC 7807 em um tipo e reage a
`unauthenticated` e a `rate-limit-exceeded` antes de qualquer tela.

Fatos que a decisão considera, verificados nesta tarefa (FE-3):

- o *snapshot* em `sinapse-platform@46b5b3c` tem 59 operações e 56 esquemas, SHA-256
  `d709e504…afb0`, e não mudou desde `c3abbff`;
- `/api-docs` passou a ficar desligado por padrão (ADR 0018 do backend): só responde sob os perfis
  `local` e `test`. Uma implantação responde 404;
- o *snapshot* não lista os 17 tipos `urn:sinapse:problem:*` (`ProblemDetails.type` é uma `uri`
  livre) e não declara `securitySchemes` (K33 do backend).

## Decisão

**Gera-se só os tipos; o cliente é escrito à mão.**

1. O *snapshot* é **copiado para o repositório** (*vendored*) em
   `src/app/core/api/contract/openapi.json`, byte a byte, com repositório, *commit* de origem,
   SHA-256 e data registrados no `README.md` da pasta. É ele a fonte do contrato, nunca uma leitura
   ao vivo de `/api-docs`, que só existe sob o perfil `local`. Um teste recalcula o SHA-256 e
   falha se a cópia for editada à mão.
2. Os tipos são gerados dele por **openapi-typescript 7.13.0** em `schema.d.ts`, versionado.
   `npm run contract` regenera; `npm run contract:check` e `scripts/contract.test.mjs` falham se o
   arquivo versionado diferir de uma regeneração. O mesmo teste prova que o arquivo só declara
   interfaces e apelidos de tipo e que, compilado, **não emite JavaScript**.
3. `models.ts` dá a cada esquema um apelido com o próprio nome (`StudentStateView`), e as
   *features* importam esses nomes. `enums.ts` e `problem-type.ts` continuam escritos à mão, porque
   o catálogo de rótulos precisa de listas concretas; `enums.contract.ts` prova **em tempo de
   compilação** que cada lista e cada união gerada correspondente têm os mesmos valores.
4. O cliente — `ApiRoutes`, `ApiClient`, os interceptadores, a política de nova tentativa — é
   escrito à mão em `core/api/`, e é a única parte do repositório que fala com o `HttpClient`.

O openapi-typescript foi escolhido, e não o `openapi-generator` com
`--global-property models`, porque emite uma declaração de tipos e nenhum código de execução **por
construção**: a decisão "só tipos" fica garantida pela ferramenta, e não por uma opção de linha de
comando que alguém pode tirar depois.

## Alternativas consideradas

**Gerar o cliente inteiro (`typescript-angular`).** Economiza escrever as chamadas. Rejeitada: os
serviços gerados chamam o `HttpClient` diretamente, cada um com seu próprio tratamento de erro, e
contornariam a cadeia de interceptadores de que R1 e R6 dependem. Embrulhá-los para restaurar essa
cadeia custaria o que a geração economizou, e o código gerado passaria a ter comportamento de
execução entre este cliente e o servidor, que nenhum teste daqui escreveu. Sem `securitySchemes`
no *snapshot* (K33 do backend), o cliente gerado também não saberia como a sessão viaja.

**Gerar só os modelos com `openapi-generator` (`--global-property models`).** Daria tipos, mas como
classes e arquivos `.ts` com código de execução possível, e a garantia "só tipos" dependeria de uma
opção. Rejeitada pelo motivo acima.

**Escrever tipos e cliente à mão.** Sem dependência nova. Rejeitada: um campo renomeado no servidor
só apareceria em execução, ou num teste que alguém lembrou de escrever. Os tipos gerados fazem o
compilador apontar a divergência.

## Consequências

- **O gerador fica isolado em `tools/contract/`**, com `package.json` e *lockfile* próprios. O
  openapi-typescript 7.13.x declara `typescript ^5.x` como dependência par, e este projeto fixa
  TypeScript 6.0.x (`CLAUDE.md`, *Stack*); instalá-lo na raiz exigiria forçar a resolução. Isolado, ele
  roda com o TypeScript 5.9.3 que declara, e o que produz é texto, lido pelo TypeScript 6.0 da
  aplicação. A saída foi conferida idêntica byte a byte sob TypeScript 5.9.3 e 6.0.3. Instala-se
  com `npm run contract:install`; o CI faz isso antes de `contract:check` e dos testes. Quando o
  openapi-typescript admitir TypeScript 6, o isolamento pode ser desfeito.
- Atualizar o contrato é um procedimento explícito, descrito em `docs/ai/CONTEXT.md`: copiar o
  novo *snapshot*, registrar SHA-256 e *commit*, regenerar, deixar o compilador apontar o que
  mudou. Um valor de enum novo no servidor quebra o *build* em `enums.contract.ts`; um esquema novo
  quebra o teste de `models.ts`; uma rota nova quebra o teste de igualdade de `ApiRoutes`.
- Os 17 tipos de problema e os limites de janela continuam fora do *snapshot* (F7 em
  `docs/ai/STATE.md`) e precisam ser relidos no código do backend a cada atualização.
- Os esquemas de resposta do *snapshot* quase não marcam campos obrigatórios (38 de 56 não marcam
  nenhum), então os tipos gerados têm membros opcionais. Isso é o contrato como publicado: quem
  decide o que um membro ausente significa é o *mapper* da *feature*, não um tipo afrouxado aqui.
- Os *fixtures* de MSW são gerados do mesmo *snapshot*, não escritos à mão.
