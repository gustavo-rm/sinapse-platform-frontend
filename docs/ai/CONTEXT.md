# CONTEXT — sinapse-platform-frontend

The entry point for an AI session in this repository. Read this, then `STATE.md`, then the file
the task names. Update `STATE.md` when you finish.

## What this repository is

The web client of the SINAPSE platform. It owns presentation and no business rule.

Two sibling repositories:

| Repository | Role |
|---|---|
| [`sinapse-platform`](https://github.com/gustavo-rm/sinapse-platform) | the API: identity, curriculum, classrooms, learning record, planning |
| [`exam-optimizer-application`](https://github.com/gustavo-rm/exam-optimizer-application) | the optimisation engine, reached only by the platform, never by this client |

## Where truth lives

| Question | Source |
|---|---|
| Which routes exist, and the shape of every body | `docs/openapi/openapi.json` in `sinapse-platform` — 59 operations, versioned, compared by a test on every build |
| How the plan cycle behaves for a client | `docs/FLUXO_DE_PLANO_FRONTEND.md` in `sinapse-platform` |
| Which statements about the backend are unverified | `docs/AFIRMACOES_A_CONFIRMAR.md` in `sinapse-platform` |
| What the interface must look like and why | `docs/DESIGN_SYSTEM.md` here, and the Design System artifact it cites |
| What must not be built | `CLAUDE.md` §8 here |

A claim about the backend that none of those supports is not a fact. Say so rather than assuming.

## Cross-repository facts that shape this client

- **Same origin.** The session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/api/v1` and the
  backend publishes no CORS configuration. The client is served from the same origin behind a
  reverse proxy; see `docs/PROXY_REVERSO.md` in `sinapse-platform`. A move to separate origins
  needs two backend changes and reopens the CSRF question that backend ADR 0010 closed.
- **Errors are RFC 7807** with a closed catalogue of `urn:sinapse:problem:*` types and an
  `errors: [{field, message}]` array on validation failures.
- **The API returns no Portuguese text.** Every enum literal and every problem type is translated
  in this repository.
- **No pagination.** Small lists come whole with a server-side cap; histories require a `from`/`to`
  window with a per-route maximum.
- **Plan generation is a polled job** and `progress` is always absent.
- **An OpenAPI-generated TypeScript client is viable.** The backend stabilised the operation names
  and the error schema for exactly this (its K19, K20, K31, K32). Whether to generate the client or
  hand-write the API layer is an open decision — see `STATE.md`.

## Conventions

In `CLAUDE.md`: language standard, Conventional Commits, branch naming, the architecture rules
enforced by lint, and the definition of done.
