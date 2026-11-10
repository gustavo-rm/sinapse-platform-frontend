# ADR 0003 — Leitura imperativa do estado de sessão

**Data:** 10 de novembro de 2026
**Status:** aceita
**Decisão:** tomada na tarefa FE-4, dentro da margem que o *prompt* da tarefa deixou explícita
("se usar `httpResource` para o *bootstrap*, diga como…; se usar uma leitura imperativa, diga por
quê. As duas são aceitáveis")

## Contexto

`GET /api/v1/me/state` é a rota de *bootstrap*: decide se a pessoa entra na aplicação, vai para a
tela de entrar ou para uma das telas de bloqueio (conta suspensa, confirmação de e-mail,
consentimentos pendentes, configuração inicial). `CLAUDE.md`, *Session and time, in one place*, manda
que um único *store* chame essa rota e que as telas leiam o *store*.

O que o *store* precisa garantir, como comportamento:

1. **uma única requisição** numa navegação a frio que passa por várias rotas protegidas;
2. **nenhuma tela renderiza antes** de a resposta chegar — nem a casca do aluno para quem não tem
   sessão, nem a tela de configuração para quem já configurou;
3. **releitura explícita**, chamável sem navegação, depois de algo que muda o estado;
4. `expire()` **uma vez** por sessão, por mais requisições que falhem juntas.

A seção *Stack* de `CLAUDE.md` indica `httpResource` para leituras remotas, e a ADR 0001 apoia a
decisão de dispensar o zone.js no fato de o estado remoto vir de `httpResource`, como *signal*.

Quem consome essa leitura primeiro não é uma tela: é a guarda de rota. Uma `CanActivateFn` do
roteador instalado (`@angular/router` 22.2.4) devolve `MaybeAsync<GuardResult>` — um valor, uma
`Promise` ou um `Observable` — e o roteador segura a navegação, e com ela qualquer renderização,
até essa resposta. O roteador registra cada navegação como tarefa pendente
(`PendingTasksInternal`), de modo que a aplicação sem zone.js, e o `whenStable()` dos testes,
esperam por ela.

## Decisão

**O *store* lê `GET /api/v1/me/state` de forma imperativa** — `ApiClient.get`, convertido em
`Promise` — e **expõe o resultado como *signals***.

- Uma única `Promise` em andamento é compartilhada por todos que pedem enquanto ela corre; a
  resposta fica guardada até `refresh()`. Isso dá a garantia 1 diretamente.
- A guarda faz `await store.ensureLoaded()`; o roteador não ativa nada antes. Isso dá a garantia 2.
- `refresh()` é um método comum, chamável de qualquer lugar. Uma falha na releitura mantém o
  estado que já existia: uma releitura que não chegou ao servidor não diz nada sobre a sessão.
- Uma época (*epoch*) incrementada a cada troca de sessão descarta respostas que chegam depois de
  a sessão ter terminado.
- O que as telas leem — `state()`, `status()`, `failure()`, `isSignedIn()`, `notice()` — são
  *signals*. A detecção de mudanças continua dirigida por *signals*, como a ADR 0001 decide.

## Alternativas consideradas

**`httpResource` para o *bootstrap*.** É o padrão do projeto para leituras de tela. Rejeitada para
este caso porque o primeiro consumidor é uma guarda, que precisa de **uma** resposta aguardável, e
não de um valor reativo:

- seria preciso converter o *signal* do recurso de volta em `Promise` (por exemplo,
  `toObservable` + `filter` + `firstValueFrom`), num contexto de injeção, só para aguardá-lo;
- o recurso refaz a requisição sempre que algum *signal* lido pela função de requisição muda, e
  um *bootstrap* que dispara de novo por efeito colateral é exatamente o que a garantia 1 proíbe —
  seria preciso blindá-lo contra isso;
- o recurso não distingue "nunca lido" de "lido e falhou" do jeito que a guarda precisa (ir para
  a tela de indisponibilidade numa falha, mas nunca renderizar a aplicação antes da primeira
  resposta), e essa distinção teria de ser reconstruída em volta dele.

Cada um desses pontos tem solução, mas a soma é mais código e mais estado do que a `Promise`
compartilhada, para chegar ao mesmo comportamento.

**Resolver de rota (`ResolveFn`) em vez de guarda.** Um *resolver* roda depois das guardas e não
pode redirecionar sem recorrer a navegações dentro de si. A cadeia de precedência é, por natureza,
uma decisão de **onde** a pessoa pode ir: é guarda.

**`APP_INITIALIZER` / `provideAppInitializer` lendo o estado antes da primeira navegação.**
Garantiria "uma requisição" de graça, mas bloquearia também a tela de entrar e qualquer tela
pública atrás de uma chamada que, para quem não tem sessão, sempre responde 401; e uma falha de
rede no carregamento deixaria a aplicação sem nenhuma tela para mostrar o erro. Rejeitada.

## Consequências

- `SessionStore` é a exceção registrada à indicação de `httpResource` da seção *Stack*: uma
  leitura que uma guarda precisa aguardar. As leituras de tela continuam em `httpResource`.
- A prova das garantias está nos testes, não nesta ADR: `session-guards.spec.ts` (uma requisição
  em três rotas protegidas; nada renderiza antes da resposta), `session-store.spec.ts` (`expire()`
  uma vez para dez falhas simultâneas; resposta tardia descartada; releitura que falha mantém o
  estado).
- A reversão é local: `ensureLoaded()` e `refresh()` são a única superfície que as guardas e as
  telas usam.
