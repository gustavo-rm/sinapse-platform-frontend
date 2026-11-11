# Design System do SINAPSE

**Versão:** 1.0 · 4 de novembro de 2026
**Fonte viva:** o Design System do SINAPSE, publicado como artefato. Tokens, diretrizes por componente e pré-visualizações ao vivo nos dois temas ficam lá. Este documento é a referência versionada do repositório, e cita a fonte em vez de duplicá-la.
**Status:** referência obrigatória. Toda tela nova segue estes padrões.

O inventário foi derivado das **59 operações** de `docs/openapi/openapi.json` do `sinapse-platform`, conferidas em 04/11/2026. **Nenhum componente existe sem dado que o alimente.** O que ficou fora, e por quê, está na seção 13.

---

## 1. Conceito e identidade

O SINAPSE planeja estudos para quem estuda sob prazo — e, no futuro, para quem acompanha quem estuda. O público chega cansado, com pouco tempo e sob pressão. Disso decorre tudo:

**A interface tem um trabalho: devolver ao estudante o orçamento cognitivo que ela consumiria**, para que ele gaste no conteúdo. Baixa carga cognitiva não é estética aqui; é requisito funcional.

**O mecanismo do produto é uma sequência.** Tópicos ligados por pré-requisito, ordenados por um otimizador e distribuídos nas janelas reais de tempo da pessoa. A metáfora visual é conexão e ordem — a trilha vertical da agenda, com um nó por sessão —, não um cérebro brilhante. A trilha desenha a ordem que o otimizador escolheu: é informação, não ornamento.

**O tema escuro é caso de uso, não preferência.** Parte do público estuda à noite.

O nome do sistema não aparece na interface como marca gráfica: não há logotipo. Até existir um, o nome é tipografia simples.

---

## 2. Princípios de design

### 2.1 Cor semântica descreve o sistema, nunca o estudante

A regra que governa o resto. `success`, `error` e `warning` dizem o que aconteceu com uma requisição, um formulário ou uma conta. **Nunca** pintam desempenho, aderência ou autoavaliação.

A razão é de integridade de medida antes de ser de gentileza. `RecallRating` — quatro níveis, autodeclarados ao encerrar a sessão — é a única medida de retenção da v1. Se "não lembrei" acender em vermelho, o estudante aprende que a honestidade custa um selo de falha e passa a inflar a avaliação. A medida se degrada, e com ela o dado do piloto.

Pela mesma razão, aderência não é semáforo: `ratio` pode vir 0,4 depois de uma semana difícil, e pintar isso de vermelho pune quem já teve a semana. A resposta certa da interface é oferecer replanejar.

Dado do estudante usa a rampa `recall-1`…`recall-4` ou `primary-fill` — escalas de quantidade, não de aprovação.

### 2.2 A tela inicial responde "o que eu faço agora"

Não "como estou indo". Métrica é consequência. `/hoje` é um roteador de estado, não um painel:

```
openSessionId != null          → "Você tem uma sessão em andamento"  → retomar
activeGenerationJobId != null  → "Estamos montando seu plano"        → acompanhar
activePlanId == null           → "Você ainda não tem um plano"       → gerar
agenda do dia vazia            → "Nada planejado para hoje"          → estudar por conta
caso contrário                 → as sessões de hoje, em ordem
```

Duas chamadas: `GET /api/v1/me/state` e `GET /api/v1/me/agenda` com janela de um dia.

### 2.3 Separe por borda, não por sombra

`border-subtle` em cartão e lista. `shadow-overlay` existe só para o que flutua sobre o conteúdo. Nenhum outro componente recebe sombra.

### 2.4 Descreva, não avalie

"Você concluiu 6 das 9 sessões previstas até aqui" — nunca "Aderência baixa". Sem ponto de exclamação, sem parabenização, sem sequência de dias, sem emoji, sem gamificação.

### 2.5 Toda espera tem texto; todo vazio ensina

A geração de plano leva minutos e o servidor não reporta progresso. Um indicador girando sem explicação é indistinguível de um travamento. Estado vazio diz o que é, por que está vazio e qual é o próximo passo.

### 2.6 Uma pergunta por tela

O estudante chega para estudar, não para operar um sistema. Se uma tela precisa de dois títulos de seção para se explicar, são duas telas.

---

## 3. Cor

Valores completos, com nota de uso por token, no artefato. Implementação em `src/styles/tokens.css`, gerado de `tokens.json` — **não edite à mão**.

### 3.1 Famílias

| Família | Tokens |
|---|---|
| Superfícies | `surface-page`, `surface-raised`, `surface-sunken`, `surface-scrim` |
| Bordas | `border-subtle`, `border-control` |
| Texto | `ink`, `ink-muted`, `ink-subtle` |
| Marca | `primary`, `primary-fill`, `primary-strong`, `primary-soft`, `ink-on-primary` |
| Marcador do agora | `marker`, `marker-line`, `marker-soft` |
| Semânticos | `success`, `error`, `warning`, `info` (+ `-soft`) |
| Rampa de recuperação | `recall-1`…`recall-4` |
| Séries de gráfico | `series-1`…`series-8`, `chart-grid` |
| Foco | `focus-ring` |

### 3.2 Regras que não se negociam

**`border-control` em input, select, checkbox e radio.** O traço é o que identifica o controle, por isso alcança 3:1 nos dois temas. `border-subtle` é divisor decorativo e fica em 1.25:1 **de propósito** — trocar um pelo outro em um controle é defeito de acessibilidade, não escolha estética.

**`marker` tem um papel só:** a sessão em curso e a próxima da agenda. Nunca significa atenção. O preenchimento nunca aparece sozinho — acompanha `marker-line` como contorno e um rótulo em texto, porque o preenchimento isolado não alcança 3:1 no tema claro.

**`ink-on-primary`, nunca branco literal.** No tema escuro o preenchimento clareia.

**`success` sai do eixo vermelho-verde** de propósito, para que sucesso e erro se distingam sem depender de matiz. Todo estado leva ícone **e** palavra.

**`info` é alias de `primary`:** informar é a voz padrão do produto, não um estado.

### 3.3 Temas

Dois: claro (primário) e escuro. O escuro **não é inversão automática** — cada token tem valor escolhido e verificado nele.

`tokens.css` declara o claro em `:root, [data-theme="light"]`, o escuro em `[data-theme="dark"]` e novamente sob `@media (prefers-color-scheme: dark)` com a guarda `:root:not([data-theme="light"])`. Assim a preferência do sistema operacional funciona e o seletor explícito do usuário vence nos dois sentidos.

---

## 4. Tipografia

`Source Sans 3` em tudo. `JetBrains Mono` apenas em código de convite, identificador de correlação e instante ISO — mono porque esses três são lidos em voz alta e digitados. Ambas hospedadas no Google Fonts; `src/styles/sinapse.css` as importa.

| Estilo | Tamanho / entrelinha | Peso | Uso |
|---|---|---|---|
| `display-lg` | 32 / 38 | 600 | título de tela pública |
| `display-md` | 26 / 32 | 600 | título de tela do aluno |
| `h1` | 22 / 28 | 600 | seção dentro da tela |
| `h2` | 18 / 24 | 600 | cartão e Dialog |
| `h3` | 16 / 22 | 600 | subgrupo, item de agenda |
| `lead` | 17 / 26 | 400 | leitura contínua, medida máxima `reading-max` |
| `body` | 15 / 22 | 400 | corpo padrão |
| `body-strong` | 15 / 22 | 600 | ênfase, nome de tópico |
| `body-sm` | 13 / 18 | 400 | secundário em cartão e célula |
| `label` | 13 / 16 | 600 | rótulo de campo e coluna |
| `caption` | 12 / 16 | 400 | metadado — **piso do sistema** |
| `metric` | 28 / 32 | 600 | número herói, um por cartão |
| `timer` | 40 / 44 | 600 | cronômetro, `tabular-nums` |
| `code` | 13 / 18 | 400 | mono |

`lead` é reservado a três coisas: termos de consentimento, prévia de convite e texto de consequência irreversível. Nada abaixo de `caption`: um texto que só cabe em 11px é um texto que precisa ser reescrito.

---

## 5. Espaçamento

Base 4px. `space-0.5` a `space-16`. Padding interno de componente usa `space-2` a `space-4`; distância entre blocos usa `space-6` a `space-10`.

| Token | Valor | Uso |
|---|---|---|
| `space-0.5` | 2px | deslocamento do foco, folga entre preenchimentos em gráfico |
| `space-2` | 8px | padding vertical de controle pequeno |
| `space-3` | 12px | padding horizontal de controle |
| `space-4` | 16px | padding de cartão e célula |
| `space-6` | 24px | entre cartões e campos |
| `space-8` | 32px | entre seções |
| `space-10` | 40px | acima do título de tela |
| `space-12` | 48px | respiro de topo e base |

---

## 6. Bordas, sombras e dimensões

**Raios:** `radius-sm` 4px (checkbox, badge, barra) · `radius-md` 8px (botão, input, Dialog) · `radius-lg` 12px (cartão) · `radius-pill` (chip, ponto da trilha).

**Sombra:** uma só, `shadow-overlay`, para Dialog, dropdown e tooltip.

**Dimensões:** `control-h-sm` 32 · `control-h-md` 40 (padrão) · `control-h-lg` 48 (ação primária de formulário, tela estreita) · `target-min` 44 (toda ação recorrente do estudante; 24px é o piso absoluto, só em tabela densa) · `icon-sm` 16 · `icon-md` 20 · `reading-max` 680 · `content-max` 1120 · `sidebar-w` 248 · `rail-w` 72.

---

## 7. Breakpoints e responsividade

Mínimos, escritos do estreito para o largo: `bp-sm` 480 · `bp-md` 768 · `bp-lg` 1024 · `bp-xl` 1280.

| Largura | Navegação | Conteúdo |
|---|---|---|
| < `bp-md` | barra inferior, quatro itens | uma coluna; tabela vira lista de cartões |
| `bp-md`–`bp-lg` | trilho de ícones, `rail-w` | uma coluna larga |
| ≥ `bp-lg` | trilho com rótulos, `sidebar-w` | doze colunas; agenda e resumo lado a lado |
| ≥ `bp-xl` | igual | conteúdo para em `content-max` e centraliza |

Navegação do aluno, na ordem de frequência de uso: **Hoje · Agenda · Plano · Conta**. Histórico vive dentro de Plano; disponibilidade, metas, turmas, segurança, privacidade e dados vivem dentro de Conta.

Nunca mais de três cartões por linha, mesmo havendo espaço. Nenhuma rolagem horizontal, em nenhuma largura. Formulário em uma coluna, máximo `reading-max`, rótulo acima do campo.

A casca do professor **não existe** — ver seção 13.

---

## 8. Biblioteca de componentes

25 famílias, cada uma com diretriz, variações, estados e pré-visualização ao vivo no artefato. As classes estão em `src/styles/sinapse.css`.

| Grupo | Componentes |
|---|---|
| Ações | `Button` |
| Formulário | `Field`, `Select`, `ChoiceControl` |
| Dados | `Badge`, `Table`, `WindowPicker` |
| Feedback | `Alert`, `Dialog`, `Skeleton`, `EmptyState`, `ErrorState` |
| SINAPSE | `AgendaDay`, `SessionTimer`, `RecallRatingField`, `AdherenceMeter`, `PlanSummary`, `GenerationProgress`, `SubjectPicker`, `AvailabilityGrid`, `GoalCard`, `ConsentDisclosure`, `InvitePreviewPanel`, `PlanHistoryList`, `RecallTrajectory` |

Os cinco que carregam mais regra de produto:

**`AgendaDay`** — a tela principal. A trilha vertical desenha a ordem do plano: nó vazio para pendente, preenchido para executada, `marker` para a que está em curso. `Entry.execution` nulo é o estado mais frequente. `DailyAgendaView` já traz `topicName` e `subjectName` resolvidos; não busque o catálogo para montar a agenda.

**`SessionTimer`** — conta pelo relógio de parede a partir de `startedAt` do servidor, nunca por incremento local (o navegador estrangula temporizadores em aba oculta). Anuncia em minutos em `aria-live`, não a cada segundo. **Ao encerrar, não envie `actualDurationMinutes`:** omitir faz o servidor marcar `MEASURED`; enviar marca `SELF_REPORTED` e destrói a distinção da qual a medida do piloto depende.

**`RecallRatingField`** — instrumento de medida, não controle de formulário. Rampa de um só matiz, rótulo em texto sempre presente, nenhuma opção pré-selecionada.

**`GenerationProgress`** — `progress` é sempre ausente: barra indeterminada mais tempo decorrido, nunca percentual. Escada de consulta de 2s/5s/10s com teto de 12 minutos, parada em aba oculta. A espera sobrevive a recarregar, porque `activeGenerationJobId` vem em `/me/state`.

**`InvitePreviewPanel`** — a prévia aparece **inteira** antes do aceite. É o que sustenta `INSTITUTION_SHARING` como consentimento informado; resumir descaracteriza o consentimento.

### Acrescentado em FE-7, ainda não refletido no artefato

FE-7 (configuração inicial, `/configurar`, `/conta/disponibilidade`, `/conta/metas`) acrescentou ao
`sinapse.css` as regras abaixo, só com tokens existentes e nenhum token novo. O artefato precisa ser
nivelado com elas; até lá, este documento e o `sinapse.css` estão à frente da fonte viva.

| Regra | Componente | Para quê |
|---|---|---|
| `.sn-wrow`, `__time`, `__period`, `__panel` | `AvailabilityGrid` (lista) e `GoalCard` (revisão) | Uma linha por janela: horário, período por extenso ("A partir de 01/11/2026", "De 01/11/2026 a 05/11/2026") e "Encerrar". `__panel` é o painel inline de encerrar uma janela ou revisar uma meta, em `surface-raised` com `border-control`: `ink-subtle` sobre `surface-sunken` mediu 4.43:1 no tema claro |
| `.sn-prio-field`, `__opts`, `__opt`, `__ends` | controle de prioridade (novo) | Cinco rádios em segmento, alvo `target-min`; o marcado em `primary-soft` com borda `primary` de 2px; o foco no rótulo (`:has(input:focus-visible)`). As pontas dizem o sentido em texto: "1 · menor", "5 · maior" — **5 é a maior prioridade** (backend e Core) |
| `.sn-topics` | contexto de uma meta (novo) | Lista numerada dos tópicos que entram numa meta (decisão L3), em `surface-sunken`, `body-sm`, sem controle, sem *hover*, sem parada de foco; duas colunas a partir de `bp-md` |
| `.sn-steps`, `__item`, `__num` | passos (novo) | Progresso de um fluxo curto ("Passo 1 de 2"). O passo atual leva `aria-current="step"` e peso 600, não só cor |

Regras de uso acrescentadas, que o artefato também precisa registrar:

- **Janela encerrada é registro, não exclusão.** O FE-7 não usa `.sn-avail__slot--closed` (riscado,
  `ink-subtle`): o risco lê como exclusão, exatamente o que a operação diz que o encerramento não é.
  Uma janela encerrada tem a mesma tinta e o mesmo peso das outras, e o período escrito.
- **`SubjectPicker` sem posição.** O FE-7 não mostra `.sn-picker__pos`: `position` é a ordem do
  código no catálogo, e um número ao lado de uma disciplina lê como classificação. As opções são
  rádios nativos dentro de `.sn-picker`.
- **Situação de meta sem cor que julgue.** Ativa, alcançada e abandonada usam o mesmo `sn-badge`
  neutro; a palavra faz a diferença (§2.1).
- **Data-alvo sem contagem regressiva.** A data aparece como a pessoa a deu ("Data-alvo: 15/07/2027"),
  sem "faltam", sem barra até ela: é restrição de prioridade, não horizonte (decisão F3).

---

## 9. Estados e interações

Todo componente que lê dado tem quatro estados, e os quatro são entregáveis:

| Estado | Componente |
|---|---|
| carregando | `Skeleton`, com a forma do conteúdo — nunca indicador centralizado |
| vazio | `EmptyState`, com frase e ação |
| erro | `ErrorState`, com mensagem pelo `type` do problema |
| limite de taxa | aviso com `retryAfter`, **sem botão de tentar de novo** |

**Erro é tratado pelo `type`, nunca pelo status.** Três `urn` diferentes compartilham o 409 nesta API — `conflict`, `setup-incomplete` e `prerequisite-cycle` — e levam a três lugares diferentes. O campo `detail` da resposta está em inglês e descreve o problema para quem desenvolve: nunca o exiba cru.

**Nenhum literal de enumeração chega à tela.** A API devolve `GOOD`, `SELF_REPORTED`, `CORE_UNAVAILABLE`; a tradução vive em um catálogo tipado por `Record<Enum, string>`, de modo que um valor novo no servidor quebre a compilação em vez de aparecer cru. São 16 enumerações de domínio, mais `DayOfWeek` e os 17 tipos de problema.

**A sessão pode morrer entre duas chamadas.** Trocar a senha revoga todas as sessões — a resposta é 204 e o cliente encerra localmente, sem esperar o 401. Revogar consentimento essencial e pedir eliminação suspendem a conta.

**Invalidação explícita** após escrita: disponibilidade, metas e transições recarregam `/me/state`; pedir plano recarrega `/me/state`; job em `READY` recarrega `/me/state`, o plano atual e a agenda; transição de sessão recarrega `/me/state` e a agenda do dia.

**Movimento:** 120ms em cor e opacidade, 160ms na entrada de Dialog, nada mais. `prefers-reduced-motion: reduce` desliga tudo.

**Nunca retentar** 401 nem 429. *Retry* automático só em erro de rede em GET, no máximo duas vezes.

---

## 10. Acessibilidade

Alvo WCAG 2.2 AA. A tabela de contraste medido de todos os pares, nos dois temas, está na seção "Acessibilidade" do artefato.

- Texto 4.5:1 sobre o ground que a nota do token nomeia, **nos dois temas**; 3:1 a partir de 24px, e para borda de controle, anel de foco e ícone com significado.
- Foco por `:focus-visible`: 2px sólido em `focus-ring`, deslocamento `space-0.5`. Nunca remova `outline` sem substituir.
- Toda ação por teclado. Dialog prende o foco, fecha em `Esc` e o devolve ao elemento que o abriu. Nada depende de `hover` ou de arrastar.
- `target-min` em ação recorrente.
- Um `<h1>` por tela, hierarquia sem salto, `<nav>` e `<main>`.
- Campo com rótulo associado, dica e erro por `aria-describedby`, `aria-invalid` quando o servidor aponta o campo. `field: "request"` vai para o erro de formulário.
- Estado nunca por cor sozinha.
- Link em texto corrido: `primary`, sublinhado — nunca só pela cor. Uma regra única em `sinapse.css` (FE-6); um `<a>` com `.sn-btn` mantém a aparência de botão.
- Mudança assíncrona anunciada por região viva. O cronômetro anuncia em minutos.
- Toda visualização tem tabela equivalente alcançável.

---

## 11. Tempo

O servidor interpreta horas locais no **fuso da conta**, que chega em `timeZone` de `/me/state`.

**Nunca formate data com o fuso do navegador.** Todo instante passa por um serviço único que conhece o fuso da conta. O erro aparece só em viagem ou no horário de verão — quando já parece defeito de dados.

Hora local (`startTime`, `endTime`) viaja como `HH:mm`, sem conversão. Data (`effectiveFrom`, `targetDate`) como `yyyy-MM-dd`. Instante em ISO-8601 com deslocamento.

Janela de histórico com teto **por rota**:

| Rota | Teto |
|---|---|
| `/me/agenda`, `/classrooms/*/students`, `.../panel` | 31 dias |
| `/study-sessions`, `/planned-sessions` | 90 dias |

Um seletor com teto único está errado.

---

## 12. Implementação

```
sinapse-web/
├── docs/DESIGN_SYSTEM.md          este documento
└── src/styles/
    ├── tokens.json                a fonte dos tokens
    ├── tokens.css                 GERADO de tokens.json — não editar
    └── sinapse.css                classes dos componentes
```

`angular.json`, em `styles`, nesta ordem: `tokens.css` depois `sinapse.css`.

**Nenhum valor visual literal fora de `tokens.css`.** `sinapse.css` consome apenas `var(--token)` — verificável por busca: nenhum `#rrggbb` nele. Um componente que precisa de uma cor nova ganha um token, não um literal.

**Alteração global acontece no Design System**, em `tokens.json`, e desce por regeneração de `tokens.css`. Nunca em um componente.

Como o consumidor é Angular, o sistema **não publica *bundle* JavaScript**: publica a folha de estilo e as diretrizes. Os componentes são escritos como componentes Angular *standalone* que aplicam as classes de `sinapse.css`. Nenhuma dependência de biblioteca de componentes de terceiros.

Troca de tema: atributo `data-theme` em `<html>`, com `light` e `dark`; sem o atributo, vale a preferência do sistema operacional.

### Regras para o desenvolvimento futuro

1. Toda tela nova segue estes padrões.
2. Componente novo reutiliza tokens e componentes existentes.
3. Nenhuma paleta ou estilo paralelo sem justificativa registrada.
4. Alteração global no Design System, nunca espalhada.
5. Inconsistência encontrada se corrige de forma centralizada.
6. Um componente novo só entra quando existe dado que o alimente. Sem rota, sem componente — e a lacuna vai para a seção 13.
7. Usabilidade vence estética quando houver conflito.

---

## 13. O que este sistema não define, e por quê

Detalhe completo na seção "Lacunas" do artefato, com o que o backend precisaria expor em cada caso.

### Pedido, mas sem dado no backend

| Item | Situação |
|---|---|
| Questões, exercícios, simulados | Não existe entidade alguma. O `CLAUDE.md` do backend proíbe explicitamente RAG, orquestração de LLM, *flashcards* por IA e algoritmos de repetição espaçada |
| Materiais de estudo | Não existe entidade de material |
| Diagnóstico inicial | Decisão L1 (ADR 0012): o esforço vem da banda curada `effortTier` mais o histórico observado, e "o aluno não informa nada" |
| Progresso de aprendizagem | O que existe é aderência: executado sobre previsto. Mede execução do plano, não aprendizagem. Chamar uma de outra é erro de categoria |

### Indicador de domínio do conhecimento — não construir nem com dado

Não há medida de domínio por tópico em rota alguma. **E é o item que não deveria ser construído mesmo se houvesse.** Um mostrador de "78% de domínio" apresentaria um julgamento autodeclarado, ordinal de quatro níveis e tomado em um instante, como medida contínua de domínio — resolveria visualmente um problema que não está resolvido cientificamente. O `CLAUDE.md` registra que medida objetiva de retenção é questão aberta e bloqueante para a tese. O componente vem **depois** dessa decisão.

### Rota existe, mas não é alcançável

**Painel do professor.** `GET /api/v1/classrooms/{id}/students` e `.../panel` existem e são ricas. Mas nenhuma rota concede o papel de professor — decisão P2, em aberto — e `/me/state` não devolve `roles`, então o cliente não descobre o papel da conta. O sistema especifica `RecallTrajectory`, a visualização mais substancial desse lado, e **não** define a casca nem as telas: construí-las sugeriria que a área funciona.

**Nome do estudante na lista da turma.** `ClassroomRosterView.Student` traz `accountId`, `adherenceRatio` e `totalMinutes`, sem nome, e a tabela `account` não tem coluna de nome. Decisão de produto e de LGPD, não de tela.

### Não definido por decisão de arquitetura

**Paginação** — a API recusa mecanismo genérico: listas pequenas vêm inteiras com teto no servidor, históricos exigem janela. O equivalente é `WindowPicker`.
**Breadcrumbs** — a navegação tem quatro itens e um nível.
**Toast** — nenhuma operação termina fora da tela que a disparou, e um aviso que se apaga sozinho é inacessível por padrão.
**Avatar** — não há nome nem imagem de pessoa na API.

### Divergência registrada

`GET /api/v1/study-plans/{id}` e o resumo repassam `fitness` inteiro, e o Core coloca ali `engine` e `build` — nome do motor e versão de build do Core chegam a uma rota de estudante. É a questão aberta **K17-D** do backend. Até ser respondida, **nenhum componente deste sistema exibe `fitness`**, nem valor nem chave.

---

## 14. Pendências deste sistema

Duas, e nenhuma delas é de engenharia:

**Os rótulos de `RecallRating`** — "Não lembrei", "Lembrei com dificuldade", "Lembrei", "Lembrei com facilidade" — são uma proposta e **precisam de revisão humana antes do piloto**. São instrumento de medida: mudá-los no meio invalida a comparação entre períodos.

**Nenhum conjunto de ícones foi fornecido.** Os desenhos das pré-visualizações são SVG mínimos escritos aqui e não são ativo de marca. A recomendação é adotar um conjunto de traço único e consistente (Lucide atende: traço 1.5px, grade 24px) e registrar a escolha. Também não há logotipo: até existir um, o nome é tipografia simples.
