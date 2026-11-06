# SINAPSE — Frontend

[Português](#português) · [English](#english)

---

## Português

### O que é

Cliente web da plataforma SINAPSE, um produto de tecnologia educacional para planejamento de
estudos personalizado. Consome a API do
[`sinapse-platform`](https://github.com/gustavo-rm/sinapse-platform), que cuida de identidade,
relações educacionais, histórico de aprendizagem e da integração com o motor de otimização.

Angular, servido na **mesma origem** que a API, atrás de um *proxy* reverso. A mesma origem é
premissa de arquitetura, não detalhe de implantação: a sessão viaja em um *cookie*
`HttpOnly; Secure; SameSite=Strict; Path=/api/v1`, e o backend não publica configuração de CORS.

### Estado

**Fundação (FE-2).** A aplicação Angular existe: estrutura de pastas, fronteiras de arquitetura
verificadas pelo *lint*, rotas preguiçosas por área com *layouts* público e do aluno, catálogo de
rótulos, os quatro componentes de estado e o serviço de tempo. Ainda não há cliente de API nem tela
de produto — chegam em FE-3 e FE-4. O detalhe está em [`docs/ai/STATE.md`](docs/ai/STATE.md).

```
docs/DESIGN_SYSTEM.md     a referência obrigatória de interface
docs/adr/                 registros de decisão de arquitetura
docs/ai/                  contexto persistente para sessões de IA
src/styles/tokens.json    a fonte dos tokens
src/styles/tokens.css     gerado de tokens.json — não editar à mão
src/styles/sinapse.css    as classes dos componentes
src/app/                  core, shared, features, layouts — ver CLAUDE.md §4
scripts/                  gerador de tokens.css e testes em Node
```

### Instalar, rodar e testar

Pré-requisito: Node 22.22.3 ou superior na linha 22 (ou 24.15 ou superior), a faixa que o
Angular 22 declara. O npm é o que acompanha o Node.

```bash
npm ci                 # instala exatamente o que está no package-lock.json
npm start              # servidor de desenvolvimento em http://localhost:4200
npm run lint           # ESLint, incluindo as fronteiras de CLAUDE.md §6
npm test               # testes unitários (Vitest) e os testes de scripts/ (Node)
npm run build          # build de produção em dist/sinapse-web
npm run tokens         # regenera src/styles/tokens.css a partir de tokens.json
npm run tokens:check   # falha se tokens.css não for a regeneração de tokens.json
```

O CI (`.github/workflows/ci.yml`) roda `tokens:check`, `lint`, `test` e `build` a cada *push* e
*pull request* para `develop` e `main`.

TypeScript e Vitest estão fixados (`~6.0.3` e `~4.1.12`). **Não** rode `npm install
typescript@latest`: a 7.x é incompatível com o Angular 22. Ver `CLAUDE.md` §3.

### Como usar os estilos

Em `angular.json`, na lista `styles`, nesta ordem:

```json
"styles": ["src/styles/tokens.css", "src/styles/sinapse.css"]
```

`tokens.css` declara o tema claro em `:root, [data-theme="light"]`, o escuro em
`[data-theme="dark"]` e novamente sob `@media (prefers-color-scheme: dark)`. Troca de tema pelo
atributo `data-theme` em `<html>`; sem o atributo, vale a preferência do sistema operacional.

**Nenhum valor visual literal fora de `tokens.css`.** `sinapse.css` consome apenas
`var(--token)`, o que é verificável por busca: ele não contém nenhum `#rrggbb`. Alteração global
acontece em `tokens.json` e desce por regeneração.

### Como rodar contra o backend local

Ainda não se aplica: este cliente não faz nenhuma chamada HTTP até FE-3, que traz o cliente de API
e o encaminhamento de `/api/v1` do servidor de desenvolvimento para o `sinapse-platform` em
execução no perfil `local`.

O *cookie* de sessão é `Secure`, o que impediria seu armazenamento em `http://localhost`. O perfil
`local` do backend já traz `sinapse.identity.session.cookie-secure: false` — **só esse perfil**.

### Convenções

Código, nomes e *commits* em inglês; documentação em `docs/` e texto visível ao usuário em
português. *Conventional Commits*. Ramos no formato `<tipo>/<versão>/<descrição>`, por exemplo
`feature/1.0/api-client`, com *pull request* para `develop`; nada é commitado direto em `main` ou
`develop`.

As regras operacionais completas estão em [`CLAUDE.md`](CLAUDE.md).

### Licença

MIT. Ver [LICENSE](LICENSE).

---

## English

### What this is

The web client of the SINAPSE platform, an educational technology product for personalised study
planning. It consumes the API of
[`sinapse-platform`](https://github.com/gustavo-rm/sinapse-platform), which handles identity,
educational relationships, learning history and the integration with the optimisation engine.

Angular, served from the **same origin** as the API, behind a reverse proxy. Same origin is an
architectural premise rather than a deployment detail: the session travels in an
`HttpOnly; Secure; SameSite=Strict; Path=/api/v1` cookie, and the backend publishes no CORS
configuration.

### State

**Foundation (FE-2).** The Angular application exists: folder structure, architecture boundaries
checked by lint, lazy routes per area with the public and student layouts, the label catalogue, the
four state components and the time service. There is no API client and no product screen yet —
those come in FE-3 and FE-4. Details in [`docs/ai/STATE.md`](docs/ai/STATE.md).

```
docs/DESIGN_SYSTEM.md     the binding interface reference
docs/adr/                 architecture decision records
docs/ai/                  persistent context for AI sessions
src/styles/tokens.json    the source of the tokens
src/styles/tokens.css     generated from tokens.json — do not edit by hand
src/styles/sinapse.css    the component classes
src/app/                  core, shared, features, layouts — see CLAUDE.md §4
scripts/                  tokens.css generator and Node tests
```

### Install, run and test

Requirement: Node 22.22.3 or newer on the 22 line (or 24.15 or newer), the range Angular 22
declares. npm is the one that ships with Node.

```bash
npm ci                 # installs exactly what package-lock.json holds
npm start              # development server on http://localhost:4200
npm run lint           # ESLint, including the boundaries of CLAUDE.md §6
npm test               # unit tests (Vitest) and the tests under scripts/ (Node)
npm run build          # production build into dist/sinapse-web
npm run tokens         # regenerates src/styles/tokens.css from tokens.json
npm run tokens:check   # fails if tokens.css is not the regeneration of tokens.json
```

CI (`.github/workflows/ci.yml`) runs `tokens:check`, `lint`, `test` and `build` on every push and
pull request to `develop` and `main`.

TypeScript and Vitest are pinned (`~6.0.3` and `~4.1.12`). **Do not** run `npm install
typescript@latest`: 7.x is incompatible with Angular 22. See `CLAUDE.md` §3.

### Using the styles

In `angular.json`, under `styles`, in this order:

```json
"styles": ["src/styles/tokens.css", "src/styles/sinapse.css"]
```

`tokens.css` declares the light theme on `:root, [data-theme="light"]`, the dark theme on
`[data-theme="dark"]` and again under `@media (prefers-color-scheme: dark)`. Switch themes with the
`data-theme` attribute on `<html>`; without it, the operating system preference applies.

**No literal visual value outside `tokens.css`.** `sinapse.css` consumes only `var(--token)`,
which is checkable by search: it contains no `#rrggbb`. A global change happens in `tokens.json`
and flows down by regeneration.

### Running against a local backend

Not applicable yet: this client makes no HTTP call until FE-3, which brings the API client and the
development server's forwarding of `/api/v1` to `sinapse-platform` running under the `local`
profile.

The session cookie is `Secure`, which would stop it being stored on `http://localhost`. The
backend's `local` profile already sets `sinapse.identity.session.cookie-secure: false` — **that
profile only**.

### Conventions

Code, names and commits in English; documentation under `docs/` and user-facing text in Brazilian
Portuguese. Conventional Commits. Branches as `<type>/<version>/<description>`, for example
`feature/1.0/api-client`, with the pull request into `develop`; nothing is committed directly to
`main` or `develop`.

The full operating rules are in [`CLAUDE.md`](CLAUDE.md).

### License

MIT. See [LICENSE](LICENSE).
