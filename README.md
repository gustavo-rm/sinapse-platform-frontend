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

**Sessão e acesso (FE-4).** Sobre a fundação de FE-2 (estrutura, fronteiras verificadas pelo
*lint*, rotas e *layouts*, catálogo de rótulos, componentes de estado, serviço de tempo) e a camada
de API de FE-3 (contrato OpenAPI copiado com tipos gerados, `ApiRoutes`, `ApiClient`,
interceptadores, política de nova tentativa, MSW), existem o *store* de sessão alimentado por
`GET /api/v1/me/state`, a cadeia de *guards* que decide para onde cada conta pode ir, a tela de
entrar, a saída, a troca de senha e o fuso da conta. As telas para onde a cadeia encaminha
(confirmação de e-mail, consentimentos, configuração) são marcadores de lugar de FE-5; ainda não há
tela de produto. Como a sessão funciona está em [`docs/ai/CONTEXT.md`](docs/ai/CONTEXT.md); o
detalhe, em [`docs/ai/STATE.md`](docs/ai/STATE.md).

```
docs/DESIGN_SYSTEM.md     a referência obrigatória de interface
docs/adr/                 registros de decisão de arquitetura
docs/ai/                  contexto persistente para sessões de IA
src/styles/tokens.json    a fonte dos tokens
src/styles/tokens.css     gerado de tokens.json — não editar à mão
src/styles/sinapse.css    as classes dos componentes
src/app/                  core, shared, features, layouts — ver CLAUDE.md, *Layout*
src/app/core/api/contract/ o contrato OpenAPI copiado do backend e seus tipos gerados
src/testing/              MSW e fixtures gerados do contrato, só para testes
tools/contract/           o gerador de tipos, isolado (ver ADR 0002)
scripts/                  geradores de tokens.css e de schema.d.ts, e testes em Node
```

### Instalar, rodar e testar

Pré-requisito: Node 22.22.3 ou superior na linha 22 (ou 24.15 ou superior), a faixa que o
Angular 22 declara. O npm é o que acompanha o Node.

```bash
npm ci                 # instala exatamente o que está no package-lock.json
npm run contract:install  # instala o gerador de tipos em tools/contract (uma vez)
npm start              # servidor de desenvolvimento em http://localhost:4200
npm run lint           # ESLint, incluindo as fronteiras de CLAUDE.md, *Architecture rules*
npm test               # testes unitários (Vitest) e os testes de scripts/ (Node)
npm run build          # build de produção em dist/sinapse-web
npm run tokens         # regenera src/styles/tokens.css a partir de tokens.json
npm run tokens:check   # falha se tokens.css não for a regeneração de tokens.json
npm run contract       # regenera schema.d.ts a partir do openapi.json copiado
npm run contract:check # falha se schema.d.ts não for a regeneração do openapi.json
npm run contract:compare-live  # compara com /api-docs de um backend local (perfil local)
```

`npm test` precisa do gerador instalado (`npm run contract:install`): um dos testes de `scripts/`
regenera `schema.d.ts` e compara com o arquivo versionado. O CI (`.github/workflows/ci.yml`) roda
`tokens:check`, `contract:check`, `lint`, `test` e `build` a cada *push* e *pull request* para
`develop` e `main`. Como atualizar o contrato está em `docs/ai/CONTEXT.md`.

TypeScript e Vitest estão fixados (`~6.0.3` e `~4.1.12`). **Não** rode `npm install
typescript@latest`: a 7.x é incompatível com o Angular 22. Ver `CLAUDE.md`, *Stack*.

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

**Session and access (FE-4).** On top of FE-2's foundation (structure, lint-checked boundaries,
routes and layouts, label catalogue, state components, time service) and FE-3's API layer (the
vendored OpenAPI contract with generated types, `ApiRoutes`, `ApiClient`, interceptors, retry
policy, MSW), there are the session store fed by `GET /api/v1/me/state`, the guard chain that
decides where each account may go, the sign-in screen, sign-out, the password change and the
account time zone. The screens the chain routes to (e-mail verification, consents, setup) are FE-5
placeholders; there is no product screen yet. How the session works is in
[`docs/ai/CONTEXT.md`](docs/ai/CONTEXT.md); details in [`docs/ai/STATE.md`](docs/ai/STATE.md).

```
docs/DESIGN_SYSTEM.md     the binding interface reference
docs/adr/                 architecture decision records
docs/ai/                  persistent context for AI sessions
src/styles/tokens.json    the source of the tokens
src/styles/tokens.css     generated from tokens.json — do not edit by hand
src/styles/sinapse.css    the component classes
src/app/                  core, shared, features, layouts — see CLAUDE.md, *Layout*
src/app/core/api/contract/ the backend's vendored OpenAPI contract and its generated types
src/testing/              MSW and fixtures generated from the contract, for tests only
tools/contract/           the type generator, isolated (see ADR 0002)
scripts/                  tokens.css and schema.d.ts generators, and Node tests
```

### Install, run and test

Requirement: Node 22.22.3 or newer on the 22 line (or 24.15 or newer), the range Angular 22
declares. npm is the one that ships with Node.

```bash
npm ci                 # installs exactly what package-lock.json holds
npm run contract:install  # installs the type generator in tools/contract (once)
npm start              # development server on http://localhost:4200
npm run lint           # ESLint, including the boundaries of CLAUDE.md, *Architecture rules*
npm test               # unit tests (Vitest) and the tests under scripts/ (Node)
npm run build          # production build into dist/sinapse-web
npm run tokens         # regenerates src/styles/tokens.css from tokens.json
npm run tokens:check   # fails if tokens.css is not the regeneration of tokens.json
npm run contract       # regenerates schema.d.ts from the vendored openapi.json
npm run contract:check # fails if schema.d.ts is not the regeneration of openapi.json
npm run contract:compare-live  # compares with /api-docs of a local backend (local profile)
```

`npm test` needs the generator installed (`npm run contract:install`): one of the tests under
`scripts/` regenerates `schema.d.ts` and compares it with the committed file. CI
(`.github/workflows/ci.yml`) runs `tokens:check`, `contract:check`, `lint`, `test` and `build` on
every push and pull request to `develop` and `main`. How to refresh the contract is in
`docs/ai/CONTEXT.md`.

TypeScript and Vitest are pinned (`~6.0.3` and `~4.1.12`). **Do not** run `npm install
typescript@latest`: 7.x is incompatible with Angular 22. See `CLAUDE.md`, *Stack*.

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
