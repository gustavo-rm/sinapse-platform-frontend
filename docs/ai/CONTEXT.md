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
| Which routes exist, and the shape of every body | the **vendored** snapshot, `src/app/core/api/contract/openapi.json` here: a byte copy of `docs/openapi/openapi.json` in `sinapse-platform@46b5b3c`, 59 operations, 56 schemas, SHA-256 checked by `scripts/contract.test.mjs`. See "The vendored contract" below. Never a live `/api-docs`, which a deployment does not serve (backend ADR 0018) |
| The TypeScript shape of every body | `src/app/core/api/contract/schema.d.ts`, generated from the vendored snapshot by `npm run contract` (ADR 0002), never edited; features use the aliases of `models.ts` |
| The routes, as this client calls them | `src/app/core/api/api-routes.ts`, whose path set is proven equal to the vendored snapshot's by `api-routes.spec.ts` |
| How the plan cycle behaves for a client | `docs/FLUXO_DE_PLANO_FRONTEND.md` in `sinapse-platform` |
| Which statements about the backend are unverified | `docs/AFIRMACOES_A_CONFIRMAR.md` in `sinapse-platform` |
| Which enum values exist | the snapshot, which inlines them unnamed; the names are the backend's Java enums. Copied value for value into `src/app/core/api/contract/enums.ts`, and tied to every generated union at compile time by `enums.contract.ts` — OBSERVED@46b5b3c (the build) |
| Which `urn:sinapse:problem:*` types exist | **not the snapshot**, which gives `ProblemDetails.type` as a `uri` with one example: `shared.web.problem.ApiErrorType` in the backend source, 17 constants. Copied into `src/app/core/api/contract/problem-type.ts` — READ@46b5b3c (unchanged since `c3abbff`). Their HTTP statuses, which MSW needs, are copied into `src/testing/msw/problems.ts` from the same file |
| How wide each history window may be | **not the snapshot**, which says only that each window "is capped": the backend's configuration defaults — `sinapse.read-model.max-window: 31d` (`/me/agenda`, classroom roster, student panel), `sinapse.planning.max-schedule-window: 90d` (`/planned-sessions`), `sinapse.learning-record.max-history-window: 90d` (`/study-sessions`). Copied into `WINDOW_CAP_DAYS` of `AccountTimeService` — READ@c3abbff, unchanged at `46b5b3c` (`application.yml` diff between the two touches only `springdoc`). A deployment that overrides them is invisible to this client |
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
- **Types are generated, the client is written** (ADR 0002, D-FE1 decided 2026-11-09). The backend
  stabilised the operation names and the error schema for generation (its K19, K20, K31, K32); this
  client generates only the types, so every request goes through its own interceptor chain.
- **`/api-docs` is off by default** (backend ADR 0018, SP-16, from `46b5b3c`): it answers only under
  the `local` and `test` profiles, and with no profile, as in a deployment, it is 404. The contract
  this client builds against is therefore the vendored file. A live comparison needs the backend
  running under `local`, and is a developer convenience (`npm run contract:compare-live`).
- **The probe routes** `/api/v1/probe/{ping,failure,validation,rate-limited}` exist only under
  `local` and `test` (`ProbeController`), are not in the snapshot, and are not in `ApiRoutes`; they
  are in `DevProbeRoutes`, for the opt-in `live-backend.spec.ts`.

## The vendored contract

The backend is a sibling repository, not a dependency: CI cannot clone it, and no task may depend
on a developer's checkout. So its OpenAPI snapshot is copied here.

| | |
|---|---|
| File | `src/app/core/api/contract/openapi.json` |
| Source | `gustavo-rm/sinapse-platform`, `docs/openapi/openapi.json`, at `46b5b3c` (origin/main, 2026-11-09) |
| SHA-256 | `d709e504097b1bb0d97b7c7c702493cc4784c8fbc0a61d2806982a4290d8afb0` |
| Provenance record | `src/app/core/api/contract/provenance.json`, read by `scripts/contract.test.mjs`; the folder's `README.md` cites it |
| Generated from it | `schema.d.ts` (openapi-typescript 7.13.0, in `tools/contract/`); the MSW handlers and fixtures of `src/testing/msw/`, at test time |

The snapshot is taken by the backend with no profile, in a stable form (keys sorted, `servers`
removed, `info.version` = `normalised`). A live `/api-docs` under `local` is therefore never
byte-identical to it: it is compact, carries `servers` and the build version, and adds the four
probe routes. `scripts/compare-live-contract.mjs` applies exactly those normalisations; on
2026-11-09 the normalised live document of `46b5b3c` was byte-identical to the vendored copy.

### Refresh procedure

When the backend's `docs/openapi/openapi.json` changes (its diff in a backend pull request is the
contract review):

1. `npm ci && npm run contract:install` here, and a checkout of `sinapse-platform` at the commit to
   adopt.
2. Copy the file byte for byte:
   `cp ../sinapse-platform/docs/openapi/openapi.json src/app/core/api/contract/openapi.json`.
3. `sha256sum src/app/core/api/contract/openapi.json`, and update
   `src/app/core/api/contract/provenance.json`: source commit, last commit touching the file, SHA-256,
   the counted paths, operations and schemas (`scripts/contract.test.mjs` checks the hash and the
   counts), and the date.
4. `npm run contract` to regenerate `schema.d.ts`.
5. `npm run lint && npm test && npm run build`, and read what fails — that is the contract change:
   - `enums.contract.ts` fails to compile → an enum gained, lost or renamed a value: update
     `enums.ts` and its label catalogue in `shared/labels/` (`RecallRating` labels are the owner's
     call, `CLAUDE.md` §7);
   - the `models.ts` test fails → a schema was added or removed: alias it;
   - `api-routes.spec.ts` fails → a path was added or removed: add it to `ApiRoutes` under its
     module (the controller's package names the module);
   - `src/testing/msw/fixtures.spec.ts` fails → a schema uses a construct the fixture generator
     does not know yet.
6. Re-read, in the backend at the same commit, what the snapshot does not carry (F7 in `STATE.md`):
   `shared/web/problem/ApiErrorType.java` against `problem-type.ts` and the statuses in
   `src/testing/msw/problems.ts`, and the window caps in `application.yml` against
   `WINDOW_CAP_DAYS`.
7. If a backend runs locally under `local`, `npm run contract:compare-live` must print
   `normalised … byte-identical … true`.
8. Update the baseline commit in this file and in `STATE.md`.

## Conventions

In `CLAUDE.md`: language standard, Conventional Commits, branch naming, the architecture rules
enforced by lint, and the definition of done.

Branches: work happens on `<type>/<version>/<description>` and the pull request targets `develop`,
created from `main` in FE-2. Nothing is committed to `main` or `develop` directly; a release into
`main` is a separate, deliberate act. Which branch is the GitHub default is a repository setting
and the owner's call — DECISION(owner, FE-2 task prompt) for the flow; the default branch is
unchanged (`main`).
