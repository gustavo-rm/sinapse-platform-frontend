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

**Bootstrap.** Este repositório contém, hoje, o Design System e a documentação que governam o
desenvolvimento. A aplicação Angular ainda não foi criada.

```
docs/DESIGN_SYSTEM.md     a referência obrigatória de interface
docs/ai/                  contexto persistente para sessões de IA
src/styles/tokens.json    a fonte dos tokens
src/styles/tokens.css     gerado de tokens.json — não editar à mão
src/styles/sinapse.css    as classes dos componentes
```

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

Pré-requisitos: Node 22 ou superior, e o `sinapse-platform` em execução no perfil `local`.

```bash
npm install
npm start      # o dev server encaminha /api/v1 para http://localhost:8080
```

O *cookie* de sessão é `Secure`, o que impediria seu armazenamento em `http://localhost`. O perfil
`local` do backend já traz `sinapse.identity.session.cookie-secure: false` — **só esse perfil**.

### Convenções

Código, nomes e *commits* em inglês; documentação em `docs/` e texto visível ao usuário em
português. *Conventional Commits*. Ramos no formato `<tipo>/<versão>/<descrição>`, por exemplo
`feature/1.0/api-client`.

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

**Bootstrap.** Today this repository holds the design system and the documentation that govern
development. The Angular application has not been created yet.

```
docs/DESIGN_SYSTEM.md     the binding interface reference
docs/ai/                  persistent context for AI sessions
src/styles/tokens.json    the source of the tokens
src/styles/tokens.css     generated from tokens.json — do not edit by hand
src/styles/sinapse.css    the component classes
```

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

Requirements: Node 22 or newer, and `sinapse-platform` running under the `local` profile.

```bash
npm install
npm start      # the dev server proxies /api/v1 to http://localhost:8080
```

The session cookie is `Secure`, which would stop it being stored on `http://localhost`. The
backend's `local` profile already sets `sinapse.identity.session.cookie-secure: false` — **that
profile only**.

### Conventions

Code, names and commits in English; documentation under `docs/` and user-facing text in Brazilian
Portuguese. Conventional Commits. Branches as `<type>/<version>/<description>`, for example
`feature/1.0/api-client`.

The full operating rules are in [`CLAUDE.md`](CLAUDE.md).

### License

MIT. See [LICENSE](LICENSE).
