Frontend — Phase 8 — Pedir um plano, esperar por ele, e lê-lo
Repositório: `gustavo-rm/sinapse-platform-frontend` Task ID: FE-8 em `docs/ai/STATE.md` Pré-requisito: FE-7 mergeado em `develop` (PR #7, `develop` em `47322a4`). Escopo: pedir a geração, acompanhar o trabalho, ler o plano em vigor, o resumo com aderência, o histórico de planos e a supersessão. Mais os estados de `/hoje` que são estados de plano, não de agenda: sem plano, e gerando. Fora de escopo: a agenda do dia propriamente dita e a execução de sessão — iniciar, concluir, abandonar, registro retroativo. São o FE-9. Não antecipe.
Leia primeiro: `CLAUDE.md`, `docs/ai/CONTEXT.md`, `docs/ai/STATE.md`, e `docs/DESIGN_SYSTEM.md` nas seções de estados e interações, de dados e gráficos, e de tempo.
No repositório do backend: `docs/FLUXO_DE_PLANO_FRONTEND.md` — foi escrito para esta tela —, a seção 4 e a 6 de `docs/FLUXOS_DE_USUARIO_SINAPSE.md`, e as pendências K14, K15 e K17 de `docs/ai/STATE.md`.
Linha de base: confirme o commit do backend e o hash do snapshot antes de qualquer coisa, como toda tarefa fez.
Branching

1. `git switch develop && git pull`
2. `git switch -c feature/1.0/plan-generation`
3. Commit ali, push, e abra o pull request para `develop`.

O ambiente desta tarefa tem quatro processos, não três
Até aqui bastavam PostgreSQL, backend e `ng serve`. A geração de plano chama o Core por REST (`RestSinapseCore`), então o `exam-optimizer-application` também precisa estar no ar. O `CLAUDE.md` do backend tem o protocolo para rodar o outro repositório; siga-o.
Se não conseguir subir o Core, pare e diga. Sem ele não há plano, e esta tarefa é julgada pelo que se vê — como o FE-4.1, o FE-5, o FE-6 e o FE-7 foram.
O motor padrão em produção é `greedy-baseline`. Não troque o motor para "ver melhor"; o que o aluno vê é o que o padrão produz.
Fatos do contrato que decidem esta tela
Verifique cada um. Se algum mudou, reporte antes de construir.
O progresso não existe, e isto é explícito. A operação diz: "The progress field is absent whenever it is indeterminate, which in this version is always: the core reports none, and nothing here invents one." O campo está no esquema e nunca vem preenchido (K14 do backend).
Então a tela mostra tempo decorrido, e nada que insinue proporção: nenhuma barra que avança, nenhuma porcentagem, nenhuma estimativa de quanto falta. Inventar um progresso aqui seria apresentar suposição como fato na única tela em que o aluno está esperando sem poder fazer nada.
A espera é de no mínimo dez segundos, porque o worker do backend faz poll a cada 10 s (K15), e pode ser bem maior: o backend repete até três vezes quando o Core está indisponível, e `attemptCount` registra isso. Decida — e justifique — quando o cliente para de consultar e diz "ainda está rodando, volte depois", em vez de girar para sempre.
404 em `GET /api/v1/study-plans/current` é estado normal, não erro. "A student with no plan yet has not run the generation job, or its last run has not finished." Um aluno recém-configurado recebe 404 — e mostrar a tela de erro para ele seria dizer que algo quebrou quando nada quebrou.
O 409 da geração tem dois sentidos — "A job is already running, or there is nothing to plan yet" —, mas aqui, ao contrário dos outros 409 do contrato, o cliente consegue distinguir sem sondar: `GET /api/v1/me/state` traz `activeGenerationJobId` e `setupComplete`. Use o estado que o `SessionStore` já tem; não invente uma segunda chamada.
`failureReason` tem quatro valores — `CORE_UNAVAILABLE`, `CORE_REJECTED`, `NOTHING_TO_PLAN`, `INTERNAL` — e são quatro situações diferentes para o aluno: um serviço fora do ar, um pedido que o otimizador recusou, nada a planejar, e um defeito nosso. Quatro mensagens, e só uma delas sugere tentar de novo agora. Repare que `NOTHING_TO_PLAN` como falha de job é diferente do 409 "nada a planejar ainda": ali o pedido nem foi aceito.
`CANCELLED` existe no enum e nenhuma rota cancela. Ele vem do servidor (recuperação de job órfão). Trate o estado; não ofereça um botão de cancelar que não tem rota.
A aderência ausente não é zero. "the ratio is absent rather than zero when nothing has fallen due yet". Mostrar 0% para quem ainda não tinha nada a fazer é dizer ao aluno que ele falhou em algo que não existia. Ausente quer dizer "nada venceu ainda", e a tela diz isso com palavras.
`PlannedSessionResponse` traz `topicId` e nenhum nome — nem do tópico nem da disciplina. O `PlanSummaryView.bySubject` traz `subjectName`, mas a lista de sessões não. Resolver nome de tópico é para que serve `GET /api/v1/subjects/{subjectId}/topics`, segundo a própria descrição. Monte o mapa de catálogo uma vez e reutilize; nunca mostre um identificador ao aluno (é o F2, já registrado).
O horizonte é fixo e não é escolha do cliente — quatro semanas, decisão fechada F3. O aluno pode ter posto uma data-alvo a oito meses. O plano cobre quatro semanas. A tela não pode sugerir o contrário, como o FE-7 já foi instruído.
`fitness` nunca aparece, e o motivo é experimental
`StudyPlanResponse` e `PlanSummaryView` trazem `fitness`, um mapa livre, "as the core produced it". O `CLAUDE.md` já proíbe exibi-lo. O motivo é mais forte do que "é interno": o Core põe `engine` e `build` dentro dele (K17 do backend).
Se o piloto comparar motores, mostrar `fitness` ao aluno diz a qual braço do experimento ele pertence. Isso não é interface feia; é contaminação do experimento.
Então: leia se precisar, nunca renderize, nunca registre em log, nunca ponha no título, nunca em atributo de dado no DOM. Estenda o teste de vazamento do FE-4 para cobrir `fitness` nas duas rotas, com controle negativo — do mesmo jeito que ele cobre código de convite e token.
Implementação
1. `/hoje` sem plano, e durante a geração
A cadeia de guardas já leva o aluno configurado para `/hoje`, hoje um marcador de lugar. Esta tarefa lhe dá os dois estados que são de plano:

* sem plano (404 em `current`): explique o que um plano é, em uma frase, e ofereça gerar. Nada mais; não encha a tela para parecer cheia.
* gerando: tempo decorrido e o que está acontecendo, com o `GenerationProgress` do design system — respeitando que não há progresso a mostrar. Se o componente do artefato sugerir proporção, não o use assim e registre a divergência, como o FE-7 fez com o riscado e a posição.

A agenda do dia continua marcador de lugar; o FE-9 a substitui.
2. Pedir e acompanhar
`POST /api/v1/study-plans/generation-requests`, depois poll em `GET .../generation-requests/{requestId}`.

* Escolha o intervalo de poll sabendo que o worker do backend roda a cada 10 s: consultar a cada segundo não antecipa nada e só gasta rede. Justifique o que escolher.
* O poll para quando o estado é terminal — `READY`, `FAILED`, `CANCELLED` — e também quando o aluno sai da tela. Não deixe um temporizador vivo depois de o componente morrer; teste isso.
* 429 na geração: 10 por hora por conta. O aviso diz quanto falta, como o C6 já faz.
* 403: a conta não pode ter dados tratados. Em tese a cadeia impede, mas trate.
* Em `READY`, o corpo traz `planId`. Leve o aluno ao plano.

3. O plano, `/plano`
`GET /api/v1/study-plans/current` para o plano em vigor, `GET /api/v1/study-plans/{planId}/summary` para o resumo, `GET /api/v1/study-plans/{planId}/sessions` para a sequência.
A pergunta que esta tela responde é "o que esse plano me pede, e por onde eu começo" — não "aqui estão 112 sessões". Quatro semanas de sessões de uma vez é carga cognitiva, não informação. Decida a hierarquia e justifique: o resumo por disciplina e o total de minutos vêm antes da lista; a lista inteira é consulta, não a primeira coisa.
Mostre, do resumo: minutos planejados no total, a divisão por disciplina (`bySubject`, que já traz `subjectName`), o horizonte, e a aderência quando houver.
A aderência não julga. Vale a regra do design system, sem exceção: cor semântica descreve o sistema, nunca o aluno. Uma barra vermelha de aderência é a mesma falha que um parabéns — as duas emitem juízo sobre a pessoa a partir de um número que mede execução de plano, não aprendizagem. Use a rampa `recall-*` ou tokens neutros.
4. Histórico e supersessão, `/plano/historico`
`GET /api/v1/study-plans`. A cadeia de supersessão é legível: cada plano superado carrega `supersededByPlanId` e `supersededAt`.
Um plano superado é registro, não lixo — suas sessões são preservadas porque sessões executadas as referenciam. Mostre-o como registro, e aprenda com o F22 do FE-7: riscado lê como exclusão.
5. Replanejar
Replanejar é manual, por decisão fechada F6, e cria um plano novo, superando o atual.
Antes do pedido, diga em palavras o que vai acontecer: o plano atual deixa de valer, as sessões futuras dele saem do caminho, e o que já foi estudado continua registrado. É da mesma família do aviso de retirada de consentimento essencial do FE-5 — uma ação cujo efeito o aluno não consegue desfazer e precisa entender antes. Use o `ConfirmDialog` que já existe; decida se o grau é o da confirmação por palavra digitada ou o da confirmação comum, e justifique.
A observação
Quatro processos no ar, Chromium, uma conta criada pela interface e configurada pela interface.

1. Um aluno recém-configurado em `/hoje`: o que a tela disse, e que o 404 não virou tela de erro.
2. Pedir o plano: o tempo até `READY`, medido, e o que a tela mostrou durante a espera. Diga se houve mais de uma tentativa (`attemptCount`).
3. O plano pronto: o que a tela mostrou, e os corpos de `current`, `summary` e `sessions`.
4. Pedir um segundo plano com um job em andamento: o 409, e como a tela o distinguiu usando `/me/state`.
5. Replanejar: o aviso, a confirmação, o plano novo, e o antigo no histórico com `supersededByPlanId`.
6. Aderência ausente logo após gerar — nada venceu ainda — e o que a tela disse. Se conseguir fazer uma sessão vencer, relate também a aderência presente.
7. Uma falha de verdade: derrube o Core e peça um plano. Relate o `failureReason` e a mensagem.
8. Confirme, no DOM e no console, que nenhum valor de `fitness` aparece.

Sobre o catálogo: o real ainda não existe — a curadoria depende de uma pessoa que ensine a matéria assinar o `reviews.csv` (ADR 0019, SP-17). Observe com o exemplo `MED-ANAT` e diga, no relatório, o que não pôde ser observado por causa disso — a divisão por disciplina com uma disciplina só é uma linha, e o plano é degenerado. Não conclua nada sobre qualidade de plano a partir dele; não é esse o propósito desta tarefa.
Testes
A seção Definition of done do `CLAUDE.md` inteira, e em particular: o 404 de `current` como estado normal, asserido; os quatro `failureReason`; `CANCELLED` sem botão de cancelar; o poll parando em estado terminal e ao destruir o componente; os dois sentidos do 409 resolvidos pelo estado; aderência ausente renderizada como "nada venceu ainda" e não como zero; o teste de vazamento estendido a `fitness`, com controle negativo; a ausência de qualquer cor de juízo na aderência, asserida; os quatro estados de cada tela; acessibilidade medida em navegador real, nos dois temas; verde sob `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo`.
Reporte a contagem e o tempo de parede da suíte, como o FE-7 passou a fazer.
Documentação
`STATE.md`: feche o FE-8, abra o FE-9, registre decisões, o que observou e o que não pôde observar. `CONTEXT.md`: o ciclo de plano de ponta a ponta num lugar só. `docs/prompts/008-plan-generation.md`: este prompt, verbatim. ADR só para decisão com alternativas reais que este prompt não fechou — o intervalo e o limite do poll é candidata. Liste os componentes e regras novos para o design system, como o FE-7 fez.
Não cunhe letras `K-` novas aqui. A série vive no `STATE.md`.
Relatório
Em português: o que verificou; o que construiu; as decisões que este prompt deixou abertas e o que escolheu; o percurso completo com o que cada tela mostrou e os tempos medidos; o que não pôde ser observado por falta de catálogo real; os números e o tempo da suíte; e o que aqui estava errado. Toda tarefa até agora achou erro real no próprio enunciado e todas as correções estavam certas — continue.
