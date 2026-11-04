# CLAUDE.md

Operating rules for AI-assisted development on the SINAPSE web client.
Read this file before any task. It is authoritative over inference from the codebase.

---

## 1. What this repository is

The web client of the SINAPSE platform. It consumes the API of `sinapse-platform` and owns no
business rule of its own.

**The backend is the only source of routes, fields and rules.** Never invent an endpoint, a field,
an enum value or a validation rule. Where something is missing, record it as a gap — see §7.

The API contract is the versioned OpenAPI snapshot at `docs/openapi/openapi.json` in
`sinapse-platform`, 59 operations. The frontend-facing notes on the plan cycle are in that
repository's `docs/FLUXO_DE_PLANO_FRONTEND.md`.

## 2. State

**Bootstrap.** The Angular application has not been created. This repository holds the design
system and the documentation that govern development. The first implementation task creates the
project; it does not re-decide the design system.

## 3. Stack

- Angular 22, standalone components, signals
- **TypeScript 6.0.x** — `@angular/compiler-cli` declares `typescript >=6.0 <6.1`
- `@angular/build` (esbuild + Vite)
- `httpResource` from `@angular/common/http` for remote reads (`@publicApi` since 22.0)
- Reactive Forms, typed
- **Vitest 4.1.x** — `@angular/build` declares `vitest ^4.0.8`
- MSW for network mocking, Playwright for end-to-end
- ESLint + `angular-eslint`

**Pin these in `package.json`.** The npm `latest` of `typescript` (7.x) and `vitest` (5.x) are
**incompatible** with Angular 22 and break the build. Never run `npm install typescript@latest`.

No component library, no state-management library, no schema-validation library. Each of those is
a decision with an ADR, not a convenience.

## 4. Layout

```
docs/DESIGN_SYSTEM.md     the binding interface reference
docs/adr/                 architecture decision records
docs/ai/                  persistent context for AI sessions: CONTEXT.md, STATE.md
src/styles/tokens.json    the source of the tokens
src/styles/tokens.css     GENERATED from tokens.json — never edit by hand
src/styles/sinapse.css    the component classes
src/app/core/             infrastructure: api, session, time, telemetry
src/app/shared/           reusable presentational code: ui, forms, labels, pipes
src/app/features/<name>/  one folder per domain area: data, model, ui, pages
src/app/layouts/          the application shells
```

A feature folder has exactly four subfolders: `data/` (resources and writes), `model/` (types,
mappers, state machines), `ui/` (presentational components), `pages/` (route components).

## 5. Language and Git conventions

| Artifact | Language |
|---|---|
| Code: classes, methods, variables, files | English |
| Comments, JSDoc | English |
| Commit messages, pull requests, branch names | English |
| This file, `docs/ai/`, prompts for Claude Code | English |
| `docs/` for the team (architecture, ADRs, design system) | Portuguese |
| Text visible to the user | Brazilian Portuguese |
| `README.md` | Always both |

Conventional Commits, in English, imperative, no trailing period. Scope is the feature name:
`feat(plan): add generation polling`. Branches: `<type>/<version>/<description>`, for example
`feature/1.0/api-client`.

## 6. Architecture rules

Settled. Do not re-open them while implementing.

**R1 — Only `core/api/**` imports `HttpClient`.** No HTTP call in a component, ever. This is the
difference between changing the 401 handling in one file or in forty.

**R2 — Only `core/api/api-routes.ts` holds the literal `/api/`.** One source for every route,
mirroring the backend's `*Routes` classes. No absolute URL anywhere: same origin is an
architectural premise, and an absolute URL is how it gets lost.

**R3 — `features/**` never imports from another `features/*`.** What is shared rises to
`shared/`. `shared/**` never imports from `features/**`. `ui/**` never imports from `data/**`.

**R4 — No date is formatted outside `AccountTimeService`.** The server interprets local times in
the account's zone, which arrives in `timeZone` from `GET /api/v1/me/state`. Formatting with the
browser zone produces an error that only appears while travelling or at a daylight-saving change,
by which time it looks like a data defect.

**R5 — No enum literal reaches the screen.** Translation lives in `shared/labels/`, typed as
`Record<Enum, string>`, so a new server value breaks compilation instead of rendering raw.

**R6 — Errors are handled by the problem `type`, never by the HTTP status.** Three different
`urn:sinapse:problem:*` values share 409 in this API and lead to three different places. The
response's `detail` field is in English and describes the problem for a developer: never show it.

**R7 — These boundaries are enforced by ESLint `no-restricted-imports` and fail the build.** They
are the equivalent of `ModularityTests` in the backend. If a rule fails, fix the design, not the
rule.

## 7. The design system is binding

`docs/DESIGN_SYSTEM.md` is the interface reference. Its live source is the SINAPSE Design System
artifact, which holds the token values, the per-component guidelines and the live previews.

- Every new screen follows it. A new component reuses existing tokens and components.
- **No literal visual value outside `tokens.css`.** A component that needs a new colour gets a
  token, not a literal.
- A global change happens in `tokens.json` and flows down by regenerating `tokens.css`. Never
  spread the change across components.
- **Semantic colour describes the system, never the student.** `success`, `error` and `warning`
  speak about requests, forms and accounts. Student data uses the `recall-1`…`recall-4` ramp or
  `primary-fill`. A red adherence meter is the same failure as a congratulation: both judge.
- The four `RecallRating` labels are a measurement instrument. **Do not reword them.** Changing
  them invalidates comparison across pilot periods; it is the owner's call.

## 8. Hard prohibitions

Do not build any of the following, even if a product document mentions them:

- Exercises, questions, practice exams — no entity exists, and the backend's `CLAUDE.md` forbids
  RAG, LLM orchestration, AI-generated flashcards and spaced-repetition algorithms
- Study materials — no entity exists
- A knowledge-mastery indicator — no route measures mastery, and showing a self-declared
  four-level ordinal judgement as a continuous percentage would assert what is not established
- A "learning progress" component — what exists is adherence, which measures execution of the
  plan, not learning
- An analytics dashboard — forbidden in the backend and contrary to the home-screen principle
- Pagination — the API refuses a generic mechanism by decision; the equivalent is `WindowPicker`
- The teacher area's shell or screens — no route grants the teacher role (backend decision P2) and
  `/me/state` exposes no `roles`
- Any display of `fitness` — it carries the Core's `engine` and `build` to a student route, which
  is the backend's open question K17-D

If a task seems to require one of these, stop and report.

## 9. Session and time, in one place

- The session is an opaque server-side token in an `HttpOnly` cookie. **Store nothing.**
  `POST /api/v1/sessions` also returns the token in the body; discard it. No `localStorage`.
- `GET /api/v1/me/state` is the bootstrap route and the only source of session state. One store
  calls it; screens read the store.
- The session can die between two calls: a password change revokes every session (the response is
  204 — clear locally, do not wait for the 401), and revoking essential consent or requesting
  erasure suspends the account.
- Never retry a 401 or a 429. Automatic retry only on a network error in a GET, at most twice.
- History reads require `from`/`to` with a **per-route** cap: 31 days on composed reads, 90 days
  on the others. A single global cap is wrong.

## 10. Definition of done

A task is not done when it compiles. It is done when all of the following hold:

1. Implementation complete
2. The four states exist: loading, empty, error, rate-limited
3. Unit tests for mappers, facades, time and state machines; component tests for the states
4. Accessibility verified: contrast in both themes, keyboard path, focus, live-region announcement
5. `npm run lint`, `npm run test` and `npm run build` pass
6. Contract fixtures regenerated if the OpenAPI snapshot moved, and the drift test green
7. Documentation updated

When fixing a bug, add the regression test first.

## 11. How to work

1. Read `docs/ai/CONTEXT.md` and `docs/ai/STATE.md` before starting; update your own row in
   `STATE.md` afterwards.
2. Read the relevant section of `docs/DESIGN_SYSTEM.md` before building any screen.
3. Inspect existing code before creating new structures. Do not assume behaviour.
4. Implement incrementally. Do not generate whole layers in one pass.
5. State uncertainty explicitly. Never invent an API, a field or a component behaviour.
6. Do not refactor for aesthetics.

**On disagreement:** if you believe a rule here or an ADR is wrong, say so and stop. Explain the
conflict and propose an alternative. Do not silently work around it, and do not implement
something that violates it while noting the violation in a comment.
