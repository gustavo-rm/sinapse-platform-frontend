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
| What must not be built | `CLAUDE.md`, *Hard prohibitions* here |

A claim about the backend that none of those supports is not a fact. Say so rather than assuming.

**Read the operations' descriptions, not only the schemas.** In this snapshot, contract facts live
in each operation's `description` and response descriptions as well as in `required`: 38 of 56
schemas declare nothing required, yet `GET /api/v1/me/state` says in prose which members "come
back empty". A schema that says nothing is not a contract that says nothing — both errors of the
FE-4 review came from reading only the schema. And what neither says, run the backend and look
(`README.md`, running against a local backend).

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
3. `sha256sum src/app/core/api/contract/openapi.json` — of the LF form: a Windows checkout of the
   backend has CRLF (no `.gitattributes` there), and the drift test hashes the LF-normalised bytes
   (K-J), so normalise before recording (`sed -i 's/\r$//'`) — and update
   `src/app/core/api/contract/provenance.json`: source commit, last commit touching the file, SHA-256,
   the counted paths, operations and schemas (`scripts/contract.test.mjs` checks the hash and the
   counts), and the date.
4. `npm run contract` to regenerate `schema.d.ts`.
5. `npm run lint && npm test && npm run build`, and read what fails — that is the contract change:
   - `enums.contract.ts` fails to compile → an enum gained, lost or renamed a value: update
     `enums.ts` and its label catalogue in `shared/labels/` (`RecallRating` labels are the owner's
     call, `CLAUDE.md`, *The design system is binding*);
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

## The setup contract, in one place (FE-7)

Row 8 of the chain (`setupComplete` false → `/configurar`), the only gate a real account reaches
today. Built in `features/setup/`; the decisions are H1–H11 in `STATE.md`.

**What makes `setupComplete` true** — the server's condition, stated once in the backend
(`PlanningDirectoryService.isReadyToPlan`, closed decision F2) and read both by `/me/state` and by the
generation job, so a client that trusts the flag is never refused:

- at least one goal with `status` `ACTIVE`; **and**
- at least one availability window effective at some point between the server's today and the end
  of the plan horizon (four weeks, F3). The server's today is in the application zone (UTC), not the
  account's (K-V). A window that starts more than four weeks out, or one that already ended, does
  not count.

Neither half is in the contract, which types the flag as a bare boolean. This client never decides
it: after every write of availability or goals it calls `SessionStore.refresh()`; `/configurar`
offers "Continuar" only when the store holds `setupComplete: true`, and "Continuar" is
`settle('setup')` — the chain routes (to `/hoje`). In the account area a write that makes the flag
false keeps the person on the screen with a note; the chain sends them to `/configurar` at the next
navigation. With the example catalogue (one subject, F24) closing the only goal does exactly that.

**Asked for, and nothing else:** availability and goals (F2). No effort estimate, difficulty or
self-assessment (L1). A goal is a whole subject (`subjectId`); every topic enters (L3), and the
topics are shown as context, never as choices. The target date is a prioritisation constraint, not
the horizon (F3): no countdown, no "until".

**Direction of `priority`:** 1 to 5, **5 the most pressing**, 3 the default — the backend's source
and the Core, not the contract (K-S).

**`PATCH /goals/{goalId}` replaces:** `priority` is required and an omitted `targetDate` clears the
date (K-T). The revision form starts from the values read and always sends both.

**Local times on the wire (F19)** — one place, `core/time/local-time.ts`:

| Direction | Accepts | Produces |
|---|---|---|
| in (`localTimeFromWire`) | `HH:mm` (the contract's examples) and `HH:mm:ss[.fffffffff]` (what the server echoes, observed on `46b5b3c` on every availability response) | `HH:mm` |
| out (`localTimeToWire`) | `HH:mm`, or `HH:mm:ss` from an `<input type="time">` | `HH:mm` |

No zone is applied either way: the server reads them in the account's zone. A window cannot cross
midnight (`endTime` strictly after `startTime`, the server's own rule). A local date
(`effectiveFrom`, `targetDate`) is shown with `AccountTimeService.formatLocalDate`, as the calendar
day it names.

**Which windows apply today** is the server's answer to `GET /api/v1/availability?on=<date>`, the date
being `AccountTimeService.today()` — today in the ACCOUNT's zone. The read without `on` (every window,
closed ones included) gives the record; the screen lists apart what the server did not return for
today, by id. A closed window is a record: same ink, its period written, never struck through
(F22). Closing asks for the last day it applies, inclusive; a day before it began is refused by the
form because the server answers it with a 500 (K-U); a past day is allowed.

## The plan cycle, end to end (FE-8)

Built in `features/plan/`; the decisions are J1–J12 in `STATE.md`, the poll is ADR 0005. Read
against `sinapse-platform@44f3d1f` (snapshot byte-identical to the vendored one) and the Core at
`exam-optimizer-application@2d182c8`, engine `greedy-baseline`, and walked live (`STATE.md`, *FE-8
walk-through*).

**Where the screens are.** `/hoje` is a router of state (`docs/DESIGN_SYSTEM.md` §2.2): `app.routes.ts`
sends it to the plan's screen (`PlanStartPage`) when `/me/state` has no `activePlanId` or has an
`activeGenerationJobId` (`todayShowsPlan`, a `canMatch`), and to the day (FE-9) otherwise — so
neither feature imports the other (R3). `/plano` is the plan in force; `/plano/historico` the
history. A plan being made is never a gate.

**Asking.** `POST /api/v1/study-plans/generation-requests`, no body → 201 with the job (`id`,
`status: PENDING`, `attemptCount: 0`, horizon), no `Location`. Then `/me/state` is read again
(`activeGenerationJobId`), which is what lets the wait survive a reload or a change of screen. The
client never asks while the store names a running job: it follows that one.

| Answer | Type | This client |
|---|---|---|
| 201 | — | follow the job |
| 409 | `conflict` — a job is running (another tab) | `SessionStore.refresh()`, follow `activeGenerationJobId`; no second POST |
| 409 | `setup-incomplete` — nothing to plan yet | `settle('app')`: the chain takes the person to `/configurar` |
| 403 | `access-denied` | `settle('app')` |
| 429 | `rate-limit-exceeded` — 10 per hour per account, 409s included | the wait, the action disabled for it; never asked again by itself |

The two 409s carry two problem TYPES; the type decides (R6), the session state keeps the request
from being made at all. The 409 body does not name the running job: `/me/state` does.

**Following.** `GET …/generation-requests/{requestId}`, by `GenerationWatch` (provided per component,
cleared on destroy): every 3 s for a minute, then every 10 s, stopping at five minutes with one manual
check; paused in a hidden tab (ADR 0005). The worker claims one job per 10-second pass; with the
default engine the call takes under a second, so READY lands at the first or second pass (measured:
7.5–10.2 s from the click). `PENDING` with `attemptCount ≥ 1` is the server trying again after the
Core did not answer — "Tentativas feitas até agora: N" — up to three attempts, 30 s then 60 s apart
(measured: 120.7 s to `FAILED`). `RUNNING` lasts as long as the Core call and was never seen by the
poll. `progress` is never read and nothing implies a proportion.

**Ending.** Every end reads `/me/state` again.

| Status | Screen |
|---|---|
| `READY` (`planId`) | from `/hoje`, to `/plano`; on `/plano`, the plan is read again and a note says the old one is in the history |
| `FAILED` + `CORE_UNAVAILABLE` | the service did not answer, even after the server's retries; "Pedir de novo" — the only failure that offers it |
| `FAILED` + `CORE_REJECTED` | the optimiser refused the request; asking again unchanged gets the same refusal; links to availability and goals. **Also what a Core that answers 404 produces** (F28) |
| `FAILED` + `NOTHING_TO_PLAN` | nothing to plan when the job ran (not the 409: there the request was not even accepted); links to availability and goals |
| `FAILED` + `INTERNAL` | a defect of the platform; nothing to repeat now |
| `CANCELLED` | handled; no code of the backend assigns it today (F29); no cancel control exists anywhere |

A failure leaves the plan in force untouched, and the screen says so.

**Reading the plan.** `GET /study-plans/current` names it — **404 is the state "no plan"**, never the
error screen; then `GET /study-plans/{planId}/summary` and `/sessions`. Ids differ: `id` on the plan,
`planId` on the summary. The sessions carry `topicId` only (F2): the catalogue map is built once per
screen from `GET /subjects/{subjectId}/topics` of the summary's subjects and reused by every list; a
topic it lacks is said in words. `fitness` (with the Core's `engine` and `build`, K17) is dropped at
the parse and proven absent from text, attributes, title, console and storage (`no-leak.spec.ts`).

**The horizon** is the server's: four weeks from the SERVER's date in UTC (K-V) — at 22:27 in São
Paulo a plan generated on 12/11 runs from 13/11 to 11/12. It does not run to a goal's target date,
and the screen says both without claiming it starts "today".

**Adherence** (`summary.adherence`) counts only sessions that fell due. No `ratio` = nothing fell due
yet: words, no bar, never 0. A ratio: "Você concluiu X de Y sessões previstas até aqui", a
`primary-fill` bar as support, no percentage, no judging colour. A plan can be born with sessions
already due: the optimiser fills windows of the horizon's first day that are already over (F26) —
observed `plannedElapsed: 2, executed: 0, ratio: 0.0` seconds after READY; the screen says those
sessions were scheduled before the plan existed.

**Re-planning** (F6, manual) is the same request with a plan in force. Its consequence is written on
`/plano` before the button, and confirmed with an ordinary `ConfirmDialog` (J8). On READY the old plan
is `SUPERSEDED` with `supersededAt` and `supersededByPlanId`; its sessions stay readable by
`/study-plans/{planId}/sessions`. The history lists every plan, newest first, the superseded ones as
a record.

## How the session works, end to end

Built in FE-4. Everything below is in `src/app/core/session/` unless named otherwise.

**The session is the server's.** `POST /api/v1/sessions` sets an opaque token as an `HttpOnly;
Secure; SameSite=Strict; Path=/api/v1` cookie and also returns it in the body for bearer clients.
This client sends cookies (`withCredentials`), drops the body as it arrives (`features/auth/data/
sign-in.ts`), and writes nothing anywhere: no web storage, no IndexedDB, no cookie by script
(`scripts/style-literals.test.mjs` refuses them in production code; `no-leak.spec.ts` proves no
password, token or e-mail reaches the console or storage through every flow). Because the cookie is
`HttpOnly`, this client can never remove it: only the server ends a session.

**One store, one read.** `SessionStore` (`session-store.ts`) is the only caller of
`GET /api/v1/me/state`. `ensureLoaded()` shares one in-flight read and keeps the answer;
`refresh()` reads again without a navigation — call it after anything that changes the state
(consent given, setup done, a plan generation finished, a sign-in) — and keeps the state it had
if it fails. The read is imperative and the state is exposed as signals (ADR 0003). Statuses:
`unknown` → `loading` → `signed-in` | `signed-out` | `failed`.

**The body is read strictly** (`account-state.ts`, decision D1 in `STATE.md`). `accountStatus`
is always required; for an ACTIVE account so are `requiresMajorityReaffirmation`, `timeZone`,
`pendingConsents` and `setupComplete`: one missing or out of contract makes the bootstrap a
`TransportFailure('unreadable')`, never a default. For any other status those four may be empty
(C7: the chain decides those statuses by `accountStatus` alone). The three identifiers accept
absent and `null`; the server omits them. The bodies actually observed are in `STATE.md`,
*Observed bootstrap bodies*.

**The guard chain** (`gate.ts`, a pure function; `session-guards.ts`, the guards). Every child of
the student layout runs `sessionGuard`; each gate screen runs `gateGuard(gate)` and opens only for
the person the chain sends there. Precedence: 401 → `/entrar` (remembering the route) ·
`ANONYMIZED` → `/conta-encerrada` (store cleared, no way back) · `SUSPENDED` → `/conta-suspensa` ·
`PENDING_VERIFICATION` → `/verificar-email` · `PENDING_GUARDIAN_CONSENT` →
`/consentimento-do-responsavel` · `requiresMajorityReaffirmation`, unless deferred this session →
`/reafirmar-consentimento` · `pendingConsents` holding a purpose that cannot be declined freely
(`holdsOnConsentScreen`: `LEARNING_DATA_PROCESSING` only — FE-5, K-H) → `/consentimentos` ·
`setupComplete` false → `/configurar` · else the requested route. A plan being generated is never a
gate. A bootstrap that failed — network, unreadable, 5xx, 429 — goes to `/indisponivel`, which shows
the error or the rate-limit notice and asks again. These paths are this client's screens, not
backend routes. `/verificar-email` is a **public** route with no guard (FE-5): row 4 still names it.

**The public screens that create and recover an account** (FE-6) — `/criar-conta`,
`/esqueci-senha`, `/redefinir-senha` — run `publicGuard`, the mirror of a gate screen's guard
(`accessToPublic` in `gate.ts`): a person with no session is let through; one with a session is sent
on to where the chain says they belong (`PENDING_VERIFICATION` → `/verificar-email`, row 4), by a
redirect that REPLACES the history entry, so a reset link's `?token=` does not stay in the back
stack. It reads the state through `SessionStore.peek()`: the same single read, but its 401 is a
visitor, not an expiry — no redirect to sign in, no notice, no remembered route. A failed read lets
the person through: these screens depend on no session. `/entrar` and `/verificar-email` have no
guard.

**Unreachable rows, kept.** Rows 2, 4 and 5 were measured unreachable in FE-4.1, rows 6 and 7 read
unreachable in FE-5 (`gate.ts` gives each reason). They stay: each status exists in the contract,
and `readAccountState` rejects an unknown one. Reachable today: sign-in, suspended, setup.

**After a write, `SessionStore.settle(target)`** re-reads the state and navigates only where the
chain sends the person from the screen guarded as `target` (`'app'` for a screen of the
application). No screen navigates by hand after consenting, reaffirming or withdrawing an erasure
request. The chain's context besides the bootstrap — the reaffirmation deferral — is in memory,
per session (`SessionStore.chainContext`).

**Ending a session.** Three ways, all in the store, all landing on `/entrar`:

- `expire()` — a request answered `urn:sinapse:problem:unauthenticated`. Called by
  `sessionExpiryInterceptor`, once per session however many requests fail together; it remembers
  the route the person was on (or was navigating to), and the sign-in screen says the session
  ended if the person had been signed in. Not for the three requests whose caller handles the 401:
  `POST /sessions` (one message for every refusal, never probed), `POST /password-changes` (D2
  below) and `DELETE /sessions/current` (signing out).
- `signOut()` — `DELETE /api/v1/sessions/current`. 204 or 401: clear and go. Anything else: clear
  and go, and say the server did not confirm, so the session may still work in this browser.
- `end('password-changed')` — after the 204 of `POST /api/v1/password-changes`, which ends every
  session of the account; nobody waits for a 401.
- `end('password-reset')` — after the 204 of `POST /api/v1/password-resets/confirmation` (FE-6),
  which ends every session of the account in the same transaction; whatever this browser held is
  cleared at once.

**The password-change probe** (decision D2, `features/account/data/password-change.ts`). That
route's 401 means either "no session" or "wrong current password". On a 401 the store re-reads the
state once: signed in → the current password is wrong, shown on its field; signed out → the probe's
own 401 has gone through `expire()`; failed → nothing can be told, the error state shows and the
session is kept. Delete the probe when the backend gives a refused credential its own problem type
(K-C).

**After sign-in** the caller runs `SessionStore.establish()`: it `begin()`s a new session
(forgetting the remembered route, which lives only in memory and only until then), reads the
state, and returns where to go — the remembered route or `/hoje`, through the guard chain, which a
sign-in never bypasses. A 401 on that read means the browser did not keep the session (a refused
cookie): not an expiry, but the notice `session-not-established`, the person stays on `/entrar`,
and the route is kept (C8).

**The account time zone.** After every successful read the store passes `timeZone` to
`AccountTimeService.setAccountZone`, which validates it by building a formatter inside a
try/catch; an unusable name keeps UTC and warns once in development. Ending the session empties it.

## The two token routes — the contract the backend needs (F18, FE-5, FE-6)

The backend's documentation says it does not know this client's address nor its routes. Its e-mail
links must be built exactly so — one path per purpose, the same query parameter, `token`
(`TOKEN_PARAM` in `features/auth/pages/single-use-token.ts`), the value exactly as the consuming
route takes it in its body:

| Purpose (`AccountTokenPurpose`) | Link | Consumed by |
|---|---|---|
| `EMAIL_VERIFICATION` | `<origin of this client>/verificar-email?token=<token>` | `POST /api/v1/email-verifications` `{token}` |
| `PASSWORD_RESET` | `<origin of this client>/redefinir-senha?token=<token>` | `POST /api/v1/password-resets/confirmation` `{token, newPassword}` |

Both screens take the token out of the URL the one way (`takeTokenFromUrl`): a history replacement
to the bare path, BEFORE anything is done with it. Both offer a field to paste a token, which is
today the only path that works (no e-mail transport; the token is in the backend console under
`local` only, in the `DEV ONLY` line). Both conflate 404 — unknown, expired or already used — into
one message. `MAJORITY_REAFFIRMATION` has no link: the reaffirmation is a gate screen of a signed-in
holder, `POST /api/v1/consents/reaffirmation` with `{}`, and takes no token (K-M).

### `/redefinir-senha` (FE-6)

- **Path** `/redefinir-senha`, under the public layout, guarded by `publicGuard` (a person with a
  session is sent into the application; the redirect replaces the history entry).
- With `?token=`: the token is held in memory (never in a form control) and the screen asks only for
  the new password — 12 to 256 characters, stated before typing. Without one, or after a held token
  was refused: a field to paste it.
- 204 → every session of the account ended; this browser's store is cleared (`end('password-reset')`)
  and the sign-in screen says so. 404 → one message and a link to `/esqueci-senha`. 429 → the wait.
- The request screen, `/esqueci-senha`, shows ONE confirmation for every 204, worded to hold
  whether or not the address has an account, interpolating nothing (the server answers the same
  way on purpose; a spec asserts the two renders are byte-identical).

### `/verificar-email` (FE-5)

- **Path** `/verificar-email`, under the public layout, no session needed (`app.routes.ts`).
- **Query parameter** `token` (`VERIFICATION_TOKEN_PARAM` in
  `features/auth/pages/verify-email-page.ts`), the value exactly as `POST /api/v1/email-verifications`
  takes it in `{token}`. The token is base64url (43 characters observed), so it needs no escaping;
  a percent-encoded value is decoded by the router.
- On arrival the client replaces the URL with `/verificar-email` (a history replacement, before the
  request), then posts the token in the body. Without the parameter the screen offers a field to
  paste it.
- 204 → the sign-in screen, saying the address was confirmed. 404 → one message for unknown,
  expired and already used. 429 → the wait.
- Reached from `/criar-conta` after a 201 (FE-6), it also says the account was created and what has
  to happen next — read from the navigation state (`REGISTERED_STATE_KEY`), a flag and nothing of
  the account. A development build says where the token is (`DevTokenNote`).

Until the backend sends e-mail, the token is in the backend console under `local` only, in the
`DEV ONLY` line of `DevOnlyLoggingAccountNotifier`; paste it, or open the link above.

## The consent model, in one place

From backend ADR 0004, its flows document (sections 1 and 8), the snapshot and — where they are
silent — its source and FE-5's measurements against `46b5b3c`.

| Purpose | Kind | Asked | Refused / withdrawn | This client |
|---|---|---|---|---|
| `LEARNING_DATA_PROCESSING` | essential | at registration, required | withdrawal suspends the account and revokes every session, in the same transaction. **Granting it again does not reactivate** (measured, FE-5): no operation of the contract does (K-L) | the only purpose row 7 holds on; withdrawal warned on the screen and confirmed by typing `SUSPENDER` |
| `INSTITUTION_SHARING` | conditional | only when an invite is redeemed (F1); registration refuses it (K-I) | a teacher's reads stop at once (checked at each read) | never granted from a consent screen; withdrawal by an ordinary confirmation, no word of suspension |
| `ACADEMIC_RESEARCH` | optional | at registration, optional | "no effect on the service" | never a gate (K-H); offered at `/criar-conta` and `/conta/consentimentos` on the same terms as the essential one — never pre-checked, never recommended, no warning, no extra step; withdrawn with no confirmation |

- **`pendingConsents`** lists the purposes "never acted on" and "requested on [their] own" (backend
  `AccountDirectoryService`): in practice research declined at registration. A withdrawn one is
  not listed again. No operation records a refusal.
- **Registration** (FE-6, `/criar-conta`) offers exactly `LEARNING_DATA_PROCESSING` (required) and
  `ACADEMIC_RESEARCH` (optional), each with its full text before its control, and sends the
  `termsVersionId` of the wording on screen. Its 409 `conflict` means "address already registered,
  or the accepted wording is no longer the one in force" (K-O): the client reads `GET /api/v1/terms`
  again and compares (decision G2 in `STATE.md`).
- **A grant** sends the `termsVersionId` of the wording on screen; the server refuses with 409
  `conflict` both a purpose already in force and a wording no longer current — one type for both.
  The wording in force is the most recently published (`GET /api/v1/terms` lists every version).
- **The reaffirmation** (`POST /api/v1/consents/reaffirmation`, body `{}` with a session) takes no
  `termsVersionId`: the server records the wording in force at that moment (K-M). backend ADR 0004: the
  account is not blocked during the grace period, so the screen can be deferred (decision E2).
- **Suspension** has two causes this version can produce — the essential consent withdrawn, an
  erasure request — and the bootstrap cannot tell them apart. The suspended screen reads
  `GET /api/v1/me/erasure-requests` and `GET /api/v1/consents`. Cancelling an open erasure request
  reactivates the account, provided the essential consent is in force; otherwise 409 and the
  cancellation is rolled back.
- **Never call the reaffirmation route outside its gate.** Measured in FE-5: it reactivates a
  SUSPENDED adult account whatever the cause — even one with an erasure request still open (K-L).

## Conventions

In `CLAUDE.md`: language standard, Conventional Commits, branch naming, the architecture rules
enforced by lint, and the definition of done.

Branches: work happens on `<type>/<version>/<description>` and the pull request targets `develop`,
created from `main` in FE-2. Nothing is committed to `main` or `develop` directly; a release into
`main` is a separate, deliberate act. Which branch is the GitHub default is a repository setting
and the owner's call — DECISION(owner, FE-2 task prompt) for the flow; the default branch is
unchanged (`main`).
