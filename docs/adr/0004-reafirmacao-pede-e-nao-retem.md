# ADR 0004 — A reafirmação de maioridade pede, e não retém

**Data:** 10 de novembro de 2026
**Status:** aceita, sujeita à confirmação do dono do projeto
**Decisão:** tomada na tarefa FE-5. O *prompt* manda dizer que "a conta continua utilizável
enquanto isso", mas a cadeia de guardas do FE-4 retinha a pessoa na tela; as alternativas abaixo
não foram decididas por ele.

## Contexto

A linha 6 da cadeia de guardas (`core/session/gate.ts`) manda para `/reafirmar-consentimento` toda
conta `ACTIVE` com `requiresMajorityReaffirmation`, e uma tela de bloqueio só abre para quem a
cadeia manda para lá. Na prática, a pessoa não alcançava a aplicação enquanto não reafirmasse.

A ADR 0004 do *backend* diz o contrário: "Na transição de maioridade, a conta **não** é bloqueada.
Solicita-se reafirmação do titular e concede-se 30 dias de carência; esgotado o prazo sem
reafirmação, a conta transita para `SUSPENDED`." A configuração repete: "The account stays usable
throughout." O cliente não pode dizer que a conta continua utilizável e, ao mesmo tempo, não a
deixar ser usada.

É o mesmo tipo de erro do K-H: a cadeia é decisão deste cliente, e ela impunha uma restrição que o
modelo de consentimento recusa.

Hoje a linha 6 não é alcançável (só deve reafirmação quem consentiu antes da idade de consentir, e o
cadastro recusa menores, K-E), então a decisão não muda nada que um aluno veja nesta versão. Ela
existe para que a tela, quando o ramo `GUARDIAN` chegar, não nasça contrária à ADR do *backend*.

## Alternativas

1. **Reter, como no FE-4.** Contraria a ADR 0004 do *backend* e faz a tela mentir.
2. **Nunca bloquear: um aviso dentro da aplicação.** Exigiria um componente de aviso persistente na
   casca do aluno, que o Design System não define (não há *toast*, e o `Alert` é da própria tela), e
   uma rota para a reafirmação fora das telas de bloqueio.
3. **Pedir uma vez por sessão, com "Agora não".** A cadeia continua mandando para a tela; quem
   escolhe "Agora não" segue para a aplicação até o fim da sessão. A escolha fica **em memória**, em
   `SessionStore` — nada é gravado no navegador — e volta a ser pedida na sessão seguinte.

## Decisão

A alternativa 3. A cadeia ganha um contexto (`ChainContext.reaffirmationDeferred`), continua uma
função pura e testada em tabela; o adiamento não pula nenhuma outra linha (uma conta suspensa
continua indo para `/conta-suspensa`, um consentimento essencial pendente continua indo para
`/consentimentos`). Enquanto a reafirmação for devida, a área "Conta" oferece o caminho de volta
para a tela, e ela abre para essa pessoa.

## Consequências

- A tela não inventa prazo: nem o fim da carência nem a data de nascimento estão no contrato (K-K).
- Pedir de novo a cada sessão é pressão, mas pressão legítima aqui, ao contrário da pesquisa: a
  reafirmação é devida, e a falta dela termina em suspensão.
- Se o dono preferir a alternativa 1 ou 2, a mudança está em `gateOf`, `accessTo` e
  `SessionStore.deferReaffirmation`, e nos testes de `gate.spec.ts` e `reaffirmation-page.spec.ts`.
