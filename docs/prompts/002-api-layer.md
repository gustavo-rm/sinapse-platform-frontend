# Frontend — Phase 2 — API layer, interceptors and the error contract

**Repository:** `gustavo-rm/sinapse-platform-frontend`
**Task ID:** FE-3 in `docs/ai/STATE.md`
**Prerequisite:** FE-2 merged into `develop` (PR #1).
**Scope:** the communication layer — the vendored contract and its generated types, `api-routes.ts`, the typed `ApiProblem`, `ApiClient`, the four interceptors, the retry policy, and MSW with generated fixtures.
**Out of scope:** authentication state, the session store, guards (FE-4), and every product screen. Do not anticipate them.

**Read first, in this order, as `CLAUDE.md` §0 requires:** `CLAUDE.md`, `docs/ai/CONTEXT.md`, `docs/ai/STATE.md`, and `docs/DESIGN_SYSTEM.md` §9 (states and interactions) and §11 (time).

Everything this prompt says is subordinate to `CLAUDE.md`. If the two disagree, `CLAUDE.md` wins and you report the conflict.

---

## Branching

`CLAUDE.md` §5.1. For this task:

1. `git switch develop && git pull`
2. `git switch -c feature/1.0/api-layer`
3. Commit there, push, open the pull request **into `develop`**.

No commit on `main` or `develop`. No merge into `main`.

---

## The decision this task was waiting on

**D-FE1 is decided by the project owner, 2026-11-09: generate the types only, and write the client by hand.**

The generated client would reach `HttpClient` directly and bypass the interceptor chain that rules R1 and R6 of `CLAUDE.md` depend on; wrapping it to restore that chain would cost what the generation saved. Generated **types**, meanwhile, keep the contract honest at compile time without putting any runtime code between this client and the server.

Record this as `docs/adr/0002-tipos-gerados-cliente-escrito.md`, in Portuguese, with context, decision, alternatives considered and consequences, and close D-FE1 in `docs/ai/STATE.md`.

**No generated file may contain runtime code.** Enforce it, do not merely intend it — see step 1.

---

## Baseline, and what changed in the backend

Read the backend at **`46b5b3c`** (origin/main, 2026-11-09), not at the `c3abbff` that FE-1 and FE-2 cite. Two facts matter here:

**The snapshot did not change shape.** `docs/openapi/openapi.json` still has 59 operations and 56 schemas, and SP-16 reports the same SHA-256 as before. Confirm both yourself.

**`/api-docs` is now off by default** (backend ADR 0018, PR #33, SP-16, closing K21). `springdoc.api-docs.enabled` and `springdoc.swagger-ui.enabled` are false in `application.yml` and true in `application-local.yml` and `application-test.yml`. With no profile active the path answers 404.

Consequence: **the contract source is the committed file, never a live fetch.** Any live comparison requires the backend running under the `local` profile, and that is a developer convenience, not the source of truth.

`ProbeController` is `@Profile({"local","test"})`, so the four probe routes exist under `local` and are the cheapest way to exercise this layer against the real server — see "Backend integration". The probe rate-limit policy lives in `application-local.yml`.

---

## Before implementing

Verify each, and report what you find. Do not proceed past a mismatch without reporting it.

1. **The snapshot.** Take `docs/openapi/openapi.json` from `sinapse-platform@46b5b3c`. Record its SHA-256 and the source commit. Confirm 59 operations and 56 schemas by counting, not by trusting this prompt.
2. **`httpResource`** is still exported from `@angular/common/http` and still `@publicApi` in the installed version. It was `@publicApi 22.0`, confirmed present in 22.2.4.
3. **npm.** `docs/ai/STATE.md` F6: npm 10.9.9 crashes resolving Vitest 4.1.x from an empty lockfile, and the current lockfile was produced with npm 11. Adding dependencies in this task touches the lockfile — use npm 11 for the install (`npx npm@11 install`), then confirm `npm ci` works with the repository's own npm. Report what you used.
4. **MSW peers.** `msw@3` declares `vite >=6`, `typescript >=5.9.x`. Confirm the Vite that `@angular/build@22.2` brings satisfies it before adding MSW; if it does not, report and stop rather than forcing a resolution.
5. **What FE-2 already put under `core/api/contract/`.** `enums.ts` and `problem-type.ts` are hand-written, with their sources named in the file headers. They are not to be deleted — step 2 reconciles them.

---

## Implementation

### 1. Vendor the contract and generate the types

The backend is a sibling repository, not a dependency. CI cannot clone it, and a task cannot depend on a developer's local checkout. So the contract is **vendored**:

- `src/app/core/api/contract/openapi.json` — a byte copy of the backend's snapshot.
- Beside it, record in a file the agent can read: the source repository, the source commit, the SHA-256, and the date. A header comment in the generation script or a short `README.md` in that folder, your call — but it must be in the repository, not in a commit message.
- A test that recomputes the SHA-256 of the vendored copy and fails if it does not match the recorded value. That catches a hand edit of the vendored contract, which would otherwise be invisible.
- Document the refresh procedure in `docs/ai/CONTEXT.md`: how to pull a new snapshot, what to re-run, what to re-read. The next session must not have to ask.

Generate the types with **`openapi-typescript` 7.13.x**, into `src/app/core/api/contract/schema.d.ts`, committed.

That tool is chosen over `openapi-generator`'s `typescript-angular` with `--global-property models` for one reason: it emits a declaration file and no runtime code **by construction**, so the "types only" decision is enforced by the tool rather than by a flag someone can drop later. If you find it cannot express something this contract needs, stop and report rather than switching generators silently.

Mirror FE-2's established convention for generated files:

- `npm run contract` regenerates `schema.d.ts` from the vendored snapshot
- `npm run contract:check` fails when the committed file differs from a regeneration
- a test that does the same, so `npm test` catches it

Add a test that the generated file declares no runtime value: compiling it must emit no JavaScript.

### 2. Friendly model aliases, and reconcile what FE-2 wrote

`schema.d.ts` from `openapi-typescript` addresses schemas as `components['schemas']['StudentStateView']`. Features must not write that. Add `src/app/core/api/contract/models.ts` aliasing every schema a feature will name — `StudentStateView`, `DailyAgendaView`, `PlanSummaryView`, `GenerationRequestResponse`, `StudyPlanResponse`, `SubjectResponse`, `TopicResponse`, `ProblemDetails`, `ValidationError` and the rest.

**Reconcile the hand-written lists:**

- `enums.ts` — the generated schemas carry each enum as a string-literal union. Add a **type-level** assertion per enum that the hand-written list and the generated union are mutually assignable, so a value added on the server breaks compilation here. Do not delete `enums.ts`: the label catalogue indexes it, and `Record<Enum, string>` needs a concrete list.
- `problem-type.ts` — `PROBLEM_TYPES` is **not in the snapshot** (`STATE.md` F7: `ProblemDetails.type` is a `uri` string). It stays hand-written. Verify the 17 values against `shared/web/problem/ApiErrorType.java` at `46b5b3c` by reading that file, and say in the report that you read it. Keep the source note in the header current.

### 3. `api-routes.ts` — all 59 routes

One file, structured by backend module (`identity`, `planning`, `learningRecord`, `readModel`, `educational`, `dataRights`, `curriculum`), relative paths only, path parameters as functions.

Derive the list mechanically from the snapshot's `paths`, then review it by hand. Add the strongest possible form of rule R2: **a test that asserts the set of paths in `ApiRoutes` equals the set of paths in the vendored snapshot**, both directions. A route the backend has and this file lacks is as much a defect as the reverse.

This is the only file in the repository allowed to contain the literal `/api/`, and `eslint.boundaries.js` already exempts it.

### 4. `ApiProblem` and the transport failure

```ts
type ApiProblem = {
  type: ProblemType;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: { field: string; message: string }[];
};
```

`type`, `title`, `status`, `detail` and `instance` are required in the backend's schema; `errors` appears only on `validation-failed`. Shape it from the generated `ProblemDetails`, narrowing `type` to `ProblemType`.

A type guard per problem type, or one discriminating helper — whichever reads better at the call site. Calling code must write `if (isSetupIncomplete(problem))` without comparing strings inline.

A **separate** type for transport failure: network down, timeout, a body that could not be parsed. Only this one is retryable. Never conflate it with `ApiProblem`: a server that answered is a different situation from a server that did not.

An unparseable error body is a transport failure, not an `ApiProblem` with empty fields.

### 5. `ApiClient`

A thin wrapper over `HttpClient`, and the only file in the repository that imports it (R1).

- paths come from `ApiRoutes`, relative, never absolute
- `withCredentials: true`, so the session cookie travels (`CLAUDE.md` B1)
- `Accept: application/json, application/problem+json`
- `Instant` serialised as ISO-8601 with offset; `LocalDate` as `yyyy-MM-dd`; `LocalTime` as `HH:mm`, **with no timezone conversion on the local types** — the conversion belongs to `AccountTimeService`, which FE-2 built
- a 30 s client timeout, except `GET /api/v1/me/data-export`, which assembles the whole LGPD package and needs a longer one

Expose a read primitive built on `httpResource` and an imperative path for writes. Do not add a cache: ADR-less by decision in `CLAUDE.md` §3, and the read models are already screen-shaped.

### 6. The four interceptors, in this order

Register them in `app.config.ts` with `provideHttpClient(withInterceptors([...]))` — the file currently has no `provideHttpClient` at all.

| # | Interceptor | Behaviour |
|---|---|---|
| 1 | `correlationIdInterceptor` | a correlation id per request, so a user-reported failure can be found in the backend's structured log |
| 2 | `problemDetailInterceptor` | converts `application/problem+json` into `ApiProblem`; **no raw `HttpErrorResponse` escapes this layer** |
| 3 | `sessionExpiryInterceptor` | on 401: clears session state, stores the attempted route, redirects. **Never retries.** The session state is a stub in this task; FE-4 replaces it with the real store |
| 4 | `rateLimitInterceptor` | on 429: exposes `retryAfter` to the UI. **Never retries** |

Order is not decoration: the problem converter must run before anything that reads a problem type.

**Never log personal data.** `CLAUDE.md` and the backend's own rule: no e-mail, no date of birth, no study content, and no invite code — ever, and least of all in the browser console, where the log is visible. Log the correlation id and the route, nothing from a body.

### 7. Retry policy

Network error on a GET only, at most twice, with backoff. Never on any 4xx, never on 429, never on a write method.

The 429 case is not politeness: plan generation is capped at 10 requests per hour per account (`CLAUDE.md` B9), so an automatic retry burns the student's budget for the one thing the product exists to do.

### 8. MSW with generated fixtures

`msw@3`, handlers per backend module under `src/testing/msw/handlers/`.

**Fixtures are generated from the vendored snapshot**, not hand-written. A hand-written fixture encodes what we believe the server returns, which is exactly what needs testing. Derive them from the schemas and their examples; where a schema has no example, generate a minimal valid instance and say so.

Provide handlers for the success path and for the error cases this layer must distinguish: 400 with `errors[]`, 401, 403, the three distinct 409 types, 429 with `retryAfter`, 500, and a network failure.

---

## Backend integration

Two levels, both reported.

**Against MSW** — the full matrix of step 8.

**Against the real server**, under the `local` profile, which is the only way `/api-docs` and the probes exist:

```
export SINAPSE_DB_URL=jdbc:postgresql://localhost:5432/sinapse
export SINAPSE_DB_USERNAME=... SINAPSE_DB_PASSWORD=...
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

| Check | Expected |
|---|---|
| `GET /api/v1/probe/ping` | 200, body parsed |
| `POST /api/v1/probe/validation`, invalid body | 400, `ApiProblem` with `errors[]` populated and mapped |
| `GET /api/v1/probe/failure` | 500 mapped to `internal-error` |
| `GET /api/v1/probe/rate-limited`, past the limit | 429 with `retryAfter`, **not retried** |
| `GET /api/v1/me/state`, anonymous | 401 mapped to `unauthenticated`, expiry path fired exactly once |
| `GET /api-docs` live, under `local` | byte-identical to the vendored copy |

If no local backend is available, say so plainly and report which checks were not run. **Do not claim a verification you did not perform**, and do not substitute a mock for it in the report.

---

## Tests

- Every `ProblemType` maps to a handling path; exhaustiveness proven over the list, not by inspection.
- The three 409 types are told apart by `type`, never by status.
- 401 fires the expiry path once and is not retried; 429 is never retried and surfaces `retryAfter`.
- A network error on a GET retries at most twice; on a POST it never retries.
- Serialisation: `Instant` keeps its offset; `LocalTime` and `LocalDate` are not shifted by the runtime zone. Run the suite under at least two zones, as FE-2 did.
- `ApiRoutes` paths equal the snapshot paths, both directions.
- The vendored snapshot's SHA-256 matches the recorded value.
- `schema.d.ts` matches a regeneration, and emits no JavaScript.
- Each hand-written enum list is mutually assignable with its generated union.

---

## Documentation

- `docs/adr/0002-tipos-gerados-cliente-escrito.md`, in Portuguese.
- `docs/ai/CONTEXT.md`: the vendored contract — where it came from, its SHA, and the refresh procedure. Add the generated types and the vendored snapshot to "Where truth lives", and correct the backend baseline to `46b5b3c` with ADR 0018's consequence for `/api-docs`.
- `CLAUDE.md`: if anything in §7 moved with the backend, correct it **and** the provenance table in `CONTEXT.md`. Add a line to §4 for `core/api/contract/`.
- `docs/ai/STATE.md`: close FE-3 with evidence, close D-FE1 recording the decision and its date, and open a row for FE-4.
- `docs/prompts/002-api-layer.md`: save the prompt you were given. `docs/prompts/` does not exist yet — FE-2's prompt was never committed; note that absence in `STATE.md` rather than reconstructing it.

---

## Acceptance criteria

- [ ] work on `feature/1.0/api-layer`, pull request into `develop`, no commit on `main` or `develop`
- [ ] `npm run lint`, `npm test` and `npm run build` pass
- [ ] only `core/api/**` imports `HttpClient`; the boundary tests still green
- [ ] all 59 routes in `api-routes.ts`, equality with the snapshot proven by test, both directions
- [ ] the vendored snapshot carries its source commit and SHA-256, checked by test
- [ ] `schema.d.ts` is generated, committed, matches a regeneration, and emits no JavaScript
- [ ] each hand-written enum list is tied to its generated union at compile time
- [ ] `PROBLEM_TYPES` verified against `ApiErrorType.java` at `46b5b3c`, and the reading reported
- [ ] no raw `HttpErrorResponse` escapes `core/api`
- [ ] 401 and 429 are never retried, proven by test
- [ ] the four interceptors registered in the declared order
- [ ] MSW fixtures generated, not hand-written
- [ ] probe verification run against a local backend, or its absence reported
- [ ] no personal data in any log
- [ ] `docs/ai/STATE.md` row FE-3 closed with evidence; D-FE1 closed

## Constraints

- Do not generate a client, only types. No generated file may contain runtime code.
- Do not fetch the contract from a live `/api-docs` as the source of truth. The vendored copy is the source; a live fetch is a comparison, and only under the `local` profile.
- Do not delete `core/api/contract/enums.ts` or `problem-type.ts`.
- Do not build the session store, a guard, or any screen — that is FE-4.
- Do not add a server-cache library, a state-management library or a schema-validation library.
- Do not store any token. `POST /api/v1/sessions` returns one in the body; discard it. No `localStorage`.
- Do not retry a 401 or a 429.
- Do not handle an error by HTTP status where a problem type exists.
- Do not log a body, an e-mail, a study content or an invite code.
- Do not invent a route, a field or an enum value.
- Do not build anything in `CLAUDE.md` §9. If the task seems to require it, stop and report.
- Do not commit to `main` or `develop` directly.

## Report

In Portuguese: what was created; the result of the five verifications in "Before implementing", including the snapshot SHA-256, the operation and schema counts, and which npm you used; which probe checks ran against a real backend and which did not, and why; what the reconciliation of `enums.ts` and `problem-type.ts` found; anything in `CLAUDE.md` §7 you had to correct; and any decision you had to make that was not specified here.

Commit in Conventional Commits format, in English, scoped to `api` or `contract`.
