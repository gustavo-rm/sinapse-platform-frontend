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

Feito e observado em 10/11/2026 contra `sinapse-platform@46b5b3c` (o *commit* de
`src/app/core/api/contract/provenance.json`).

1. Um PostgreSQL 16 acessível em `localhost:5432`, com um banco e um usuário para o backend.
2. O backend, no perfil `local`, na porta 8080 — como diz o README dele:

   ```bash
   export SINAPSE_DB_URL=jdbc:postgresql://localhost:5432/sinapse
   export SINAPSE_DB_USERNAME=<usuário>
   export SINAPSE_DB_PASSWORD=<senha>
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
   ```

   O catálogo de disciplinas começa vazio; para ter o que escolher como meta, importe-o uma vez
   com o perfil `catalog`: `java -jar target/platform-*.jar --spring.profiles.active=catalog catalog apply`.
3. Este cliente: `npm start` (`ng serve`), em `http://localhost:4200`. A configuração
   `development` do `serve` usa `proxy.conf.json`, que encaminha `/api/v1` para
   `http://localhost:8080` sem reescrever o caminho. O backend não publica CORS e o cliente só usa
   caminhos relativos: sem esse encaminhamento, toda rota protegida cai em `/indisponivel`.

Para ter uma conta: `POST /api/v1/accounts` (o texto dos termos vem de `GET /api/v1/terms`; o
perfil `local` publica três textos marcados `dev-0`, que **não** são termos de consentimento). Não
inclua `INSTITUTION_SHARING` no cadastro — o servidor recusa; esse consentimento é dado ao aceitar
um convite. O perfil `local` não envia e-mail: o *token* de verificação aparece no log do backend
(`DEV ONLY - not a delivery`). Para consumi-lo por este cliente, abra
`http://localhost:4200/verificar-email?token=<token>` ou cole o *token* no campo de
`/verificar-email` — essa rota e esse parâmetro são o contrato que o link do e-mail do backend deve
seguir (`docs/ai/CONTEXT.md`). Antes disso a conta não consegue entrar.

O *cookie* de sessão observado: `sinapse_session`, `Path=/api/v1`, `HttpOnly`,
`SameSite=Strict`, 30 dias, e **sem** `Secure` no perfil `local`
(`sinapse.identity.session.cookie-secure: false`). O Chromium aceitaria um `Secure` em
`http://localhost`, que conta como contexto seguro; em outro endereço via HTTP (o IP da máquina,
por exemplo), recusa — e a tela de entrar então diz que a sessão não pôde ser mantida.

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

Done and observed on 2026-11-10 against `sinapse-platform@46b5b3c` (the commit in
`src/app/core/api/contract/provenance.json`).

1. A PostgreSQL 16 reachable on `localhost:5432`, with a database and a user for the backend.
2. The backend, under the `local` profile, on port 8080 — as its own README says:

   ```bash
   export SINAPSE_DB_URL=jdbc:postgresql://localhost:5432/sinapse
   export SINAPSE_DB_USERNAME=<user>
   export SINAPSE_DB_PASSWORD=<password>
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
   ```

   The subject catalogue starts empty; to have something to set a goal on, import it once with the
   `catalog` profile: `java -jar target/platform-*.jar --spring.profiles.active=catalog catalog apply`.
3. This client: `npm start` (`ng serve`), on `http://localhost:4200`. The `development`
   configuration of `serve` uses `proxy.conf.json`, which forwards `/api/v1` to
   `http://localhost:8080` without rewriting the path. The backend publishes no CORS and the client
   uses relative paths only: without the forwarding, every guarded route lands on `/indisponivel`.

To get an account: `POST /api/v1/accounts` (the terms come from `GET /api/v1/terms`; the `local`
profile publishes three wordings marked `dev-0`, which are **not** consent terms). Leave
`INSTITUTION_SHARING` out of the registration — the server refuses it; that consent is given when
redeeming an invite. The `local` profile sends no e-mail: the verification token is in the backend
log (`DEV ONLY - not a delivery`). To redeem it through this client, open
`http://localhost:4200/verificar-email?token=<token>` or paste the token into the field of
`/verificar-email` — that route and parameter are the contract the backend's e-mail link must follow
(`docs/ai/CONTEXT.md`). Until then the account cannot sign in.

The session cookie as observed: `sinapse_session`, `Path=/api/v1`, `HttpOnly`, `SameSite=Strict`,
30 days, and **no** `Secure` under the `local` profile
(`sinapse.identity.session.cookie-secure: false`). Chromium would accept a `Secure` one on
`http://localhost`, which counts as a secure context; on another address over HTTP (the machine's
IP, for instance) it refuses it — and the sign-in screen then says the session could not be kept.

### Conventions

Code, names and commits in English; documentation under `docs/` and user-facing text in Brazilian
Portuguese. Conventional Commits. Branches as `<type>/<version>/<description>`, for example
`feature/1.0/api-client`, with the pull request into `develop`; nothing is committed directly to
`main` or `develop`.

The full operating rules are in [`CLAUDE.md`](CLAUDE.md).

### License

MIT. See [LICENSE](LICENSE).
