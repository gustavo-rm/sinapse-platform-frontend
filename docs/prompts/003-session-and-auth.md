# Frontend — Phase 3 — Session store, guards, sign-in and sign-out

**Repository:** `gustavo-rm/sinapse-platform-frontend`
**Task ID:** FE-4 in `docs/ai/STATE.md`
**Prerequisite:** FE-3 merged into `develop` (PR #2).
**Scope:** the session store fed by `GET /api/v1/me/state`, the guard chain that decides where an account may go, the sign-in screen, sign-out, the local clear on a password change, and wiring the account time zone.
**Out of scope:** registration, e-mail verification, password reset, the consent screens, the reaffirmation flow, the session list, and setup (availability and goals). Those are FE-5. This task routes **to** them and builds placeholders, nothing more. Do not anticipate them.

**Read first, in this order, as the *How to work* section of `CLAUDE.md` requires:** `CLAUDE.md`, `docs/ai/CONTEXT.md`, `docs/ai/STATE.md`, `docs/adr/0002-tipos-gerados-cliente-escrito.md`, and `docs/DESIGN_SYSTEM.md` on states and interactions, forms, and time.

**Cross-references in this prompt name the section, not its number.** The numbers in the FE-3 prompt were wrong (F11) and cost a round of confusion. One step of this task fixes the cause.

Everything this prompt says is subordinate to `CLAUDE.md`. If the two disagree, `CLAUDE.md` wins and you report the conflict instead of working around it.

---

## Branching

Per the *Language and Git conventions* section of `CLAUDE.md`:

1. `git switch develop && git pull`
2. `git switch -c feature/1.0/session-and-auth`
3. Commit there, push, open the pull request **into `develop`**.

No commit on `main` or `develop`. No merge into `main`.

---

## What FE-3 left you

- `ApiClient` is the only holder of `HttpClient`. Use it. Never inject `HttpClient` outside `core/api/**` (rule R1).
- The interceptor chain is registered in `app.config.ts` in an order that is **deliberately not** the order the behaviours run in: Angular runs the response side in reverse registration order. `api-interceptors.spec.ts` locks the resulting sequence. **Do not reorder it.** If you believe it is wrong, stop and report.
- `core/session/session-expiry.ts` is a stub with an in-memory flag. **You replace it, keeping its observable contract:** `expire()` acts once per session however many requests fail together, remembers the route the person was on, and sends them to sign in.
- `POST /api/v1/sessions` and `POST /api/v1/password-changes` are exempt from the expiry path (F13). That exemption stays; this task decides what happens instead.
- `AccountTimeService` exists and falls back to UTC with a development warning. Its `setAccountZone` is never called by anything yet.
- MSW handlers exist for all 59 operations plus the error matrix. Reuse them; do not write new fixtures by hand.

---

## Decisions this task carries

Three are decided here, with the reasoning, because each one is a place where guessing would encode an unjustified assumption. The fourth stays open and this task takes the reversible option.

### D1 — In the bootstrap payload, an absent member is a failure, not a default

`StudentStateView` marks **no** property as required, so every member of the generated type is optional. That is not the server's behaviour; it is a gap in how the contract is published (38 of the 56 schemas declare no `required`, and all 38 are responses — the backend's Bean Validation annotations exist on requests only). The gap is being reported to the backend as **K-A**.

Until the backend declares what it guarantees, this client must not invent defaults for the route that decides where a person may go. The failure modes are not cosmetic:

- `setupComplete` defaulted to `false` sends a configured student back to setup; defaulted to `true` sends an unconfigured one to a screen with nothing to show.
- `accountStatus` defaulted either way decides between admitting and suspending an account.
- `timeZone` defaulted to UTC shifts every date three hours for a student in `America/Sao_Paulo`, so a session studied at night is counted on the following day. That corrupts adherence and the temporal attribution of the recall ratings, which are the pilot's measurement instrument.

**Therefore:** map the bootstrap response through a mapper that treats `accountStatus`, `setupComplete`, `requiresMajorityReaffirmation`, `timeZone` and `pendingConsents` as **required**. If any is absent, the bootstrap fails as `TransportFailure('unreadable')` — the same path as a body this client cannot read — and the screen shows the error state. Do not log the payload.

`activePlanId`, `activeGenerationJobId` and `openSessionId` are the exception: each identifies something that may not exist, so **absent and `null` are both valid and mean "none"**. Whether the server omits them or sends `null` is not something I have verified — accept both and say so in a comment.

Write the mapper in `core/session/`, not in a feature, and test it against: a complete payload; one missing each required member; `null` for each of the three identifiers; and each absent.

### D2 — After a 401 on a password change, probe the state route

`POST /api/v1/password-changes` answers 401 `urn:sinapse:problem:unauthenticated` for **two different situations**, in the snapshot's own words: `No usable session, or the current password does not match`. The client cannot tell them apart, and the two need opposite responses — stay on the form with a field message, or leave for the sign-in screen.

**Therefore:** on a 401 from that route only, issue `GET /api/v1/me/state` once. A 200 means the session is alive, so the current password is wrong: show it on the `currentPassword` field and stay. A 401 means the session is gone: route through the expiry path. A transport failure on the probe is treated as "cannot tell" — show the generic error state and do not clear the session.

The cost is one request on an error path, which buys a definite answer instead of a guess. This is reported to the backend as **K-C**; a distinct problem type for a refused credential on an already-authenticated route would make the probe unnecessary, and the probe is written so it can be deleted in one place when that lands.

**Do not probe after a 401 from `POST /api/v1/sessions`.** There the ambiguity is deliberate and correct: distinguishing an unknown address from a wrong password would leak whether an account exists. The sign-in form says one thing for all three cases.

### D3 — Handle a 400 the snapshot does not declare

`LoginRequest` declares `email` and `password` required, but `POST /api/v1/sessions` declares only 201, 401 and 429. Twelve of the fifteen operations whose request body has required fields declare no 400, while three do — so the omission is an inconsistency in the published contract, not a statement that validation cannot fail. FE-3 proved against the running backend that a validation failure is a 400 `validation-failed` carrying `errors[{field, message}]`.

**Therefore:** every form in this task handles `validation-failed` with per-field messages, whether or not the snapshot declares a 400 for that operation. Reported to the backend as **K-D**. Do not add the 400 to the vendored snapshot — it is a byte copy and a test enforces that.

### D4 — Which consents are essential is unknown, so do not guess

An account is suspended when essential consent is revoked or erasure is requested. Nothing in the snapshot says **which** of `LEARNING_DATA_PROCESSING`, `INSTITUTION_SHARING` and `ACADEMIC_RESEARCH` is essential. It is tempting to assume the first; do not. The suspended screen in this task states the situation and nothing more, and the gap is recorded as a limitation. FE-5 resolves it with an answer from the backend.

---

## Before implementing

Verify each, and report what you found — do not trust this prompt:

1. The vendored snapshot still has SHA-256 `d709e504097b1bb0d97b7c7c702493cc4784c8fbc0a61d2806982a4290d8afb0`. If the backend has moved, stop and report before writing anything: the bootstrap schema is the input to every decision above.
2. `StudentStateView` in `schema.d.ts` still has every member optional. If the backend has fixed K-A, D1 becomes unnecessary — report it and ask.
3. The 401 description of `POST /api/v1/password-changes` still carries both meanings. If it no longer does, D2 is unnecessary.
4. Angular's default HTTP backend in the installed version. FE-3 found it is now fetch rather than `XMLHttpRequest`; confirm it in the installed `@angular/common`, because it governs how a timeout and an unreadable body surface, and the session store sits on top of that.
5. Whether a `CanActivateFn` in the installed Angular may return a `Promise` or an `Observable`, and how a zoneless application handles a guard that resolves asynchronously. State what you confirmed.

---

## Implementation

### 1. The session store

One store, in `core/session/`. It is the only caller of `GET /api/v1/me/state`; screens read the store and never that route.

Requirements, stated as behaviour so you choose the mechanism:

- **Exactly one bootstrap request for a cold navigation through several guarded routes.** Prove it with a test that navigates through three guarded routes and counts requests.
- **A screen never renders before the bootstrap has resolved.** No flash of a signed-in shell for a signed-out person, and no flash of setup for a configured one.
- **An explicit refresh** that re-reads the state after something that changes it (consent granted, setup completed, a plan generation finished). It must be callable without a navigation.
- **`expire()` acts once.** Ten requests failing together produce one expiry, one navigation, one cleared store.
- **Nothing is persisted.** No `localStorage`, no `sessionStorage`, no cookie written by this client. The session is the server's `HttpOnly` cookie; the token in the body of `POST /api/v1/sessions` is **discarded** — do not store it, do not log it, do not pass it anywhere.
- The attempted route is kept in memory only, and only until the next successful sign-in.

Build it on signals, consistent with the zoneless decision (ADR 0001). If you use `httpResource` for the bootstrap, say how you kept the guard from rendering early and from firing a second request; if you use an imperative read, say why. Either is acceptable; the untested claim is not.

### 2. The guard chain

One precedence chain, evaluated in this order, as a pure function of the mapped bootstrap state so it can be tested without a router:

| # | Condition | Destination |
|---|---|---|
| 1 | bootstrap answered 401 | `/entrar`, remembering the attempted route |
| 2 | `accountStatus = ANONYMIZED` | terminal screen; clear the store; offer no way back |
| 3 | `accountStatus = SUSPENDED` | suspended screen (D4: state the situation, promise nothing) |
| 4 | `accountStatus = PENDING_VERIFICATION` | verify-e-mail placeholder |
| 5 | `accountStatus = PENDING_GUARDIAN_CONSENT` | guardian placeholder |
| 6 | `requiresMajorityReaffirmation` | reaffirmation placeholder |
| 7 | `pendingConsents` not empty | consent placeholder |
| 8 | `setupComplete` false | setup placeholder |
| 9 | none of the above | the requested route |

`activeGenerationJobId` is **not** a gate. A plan being generated is a state the plan screen shows with the design system's `GenerationProgress`; it never blocks navigation.

**Test this as a state machine, table-driven, over every combination** of the five required members — not a few happy paths. The order is the substance of this task and an inverted pair here is a bug nobody sees until a pilot participant hits it.

Each placeholder is one screen with a heading, a sentence and no controls, marked in code as FE-5's. Do not build the flows behind them. Do not invent a route for them: four of the five have no backend operation that completes the flow, and one has none at all — record that below.

### 3. Sign-in

The screen at `/entrar`. `POST /api/v1/sessions` with `LoginRequest`.

- One message for every 401, revealing nothing about which part was wrong — the backend deliberately gives the same answer for an unknown address, a wrong password and an inactive account, and the interface must not undo that.
- `validation-failed` → per-field messages (D3).
- `rate-limit-exceeded` → the design system's `RateLimitNotice`, with no control that retries.
- On success: discard the token from the body, refresh the store, and navigate to the remembered route, or to `/hoje` if there is none. Run the guard chain on arrival — a sign-in does not bypass it.
- The password field is never logged, never put in a query string, and never echoed back in a message.

### 4. Sign-out

`DELETE /api/v1/sessions/current`.

- On 204: clear the store and go to `/entrar`.
- On 401: the session was already gone. Clear and go to `/entrar` anyway. Never trap a person on a screen because signing out failed.
- On a transport failure: clear locally, go to `/entrar`, and say the server may still hold the session. Do not silently pretend it succeeded — this is a security-relevant statement.

### 5. The password-change local clear, and D2's probe

The *Session and time, in one place* section of `CLAUDE.md`: a password change revokes **every** session, and the response is 204, so clear locally without waiting for a 401.

- On 204: clear the store and route to `/entrar` with a message saying the password changed and every session ended.
- On 401: the probe of D2 decides.

The form itself belongs to the account area; keep it minimal, and do not build the rest of that area.

### 6. The account time zone

After a successful bootstrap, pass `timeZone` to `AccountTimeService.setAccountZone`.

**Validate it before setting it.** An unknown zone string would throw deep inside a template at format time. Check it against the platform's own list, or by constructing a formatter with it inside a try/catch, and if it is not usable keep the UTC fallback and emit the existing development warning. A wrong zone must be visible in development and must never crash a screen in production.

Test: a valid zone is applied; an unusable string keeps UTC and warns; the zone survives a store refresh; dates render identically under `TZ=America/Sao_Paulo` and `TZ=Asia/Tokyo` because the account zone governs, not the browser's.

### 7. Hygiene carried over from FE-3

Three small items. Each is here rather than in its own task because each fixes a mechanism that will otherwise keep producing the same class of error.

**(a) The section references of `CLAUDE.md`.** F11 happened because more than forty numbered references to `CLAUDE.md` sections are scattered through the repository and nothing checks them. The file also contains a broken one of its own: *What this repository is* tells you to record a gap "see §7", and §7 is the design system — gaps go to `docs/ai/STATE.md`.

- Rewrite cross-references to name the section (*the Architecture rules section*), keeping the rule identifiers `R1`–`R7`, which are stable names rather than positions.
- Fix the broken reference in *What this repository is*.
- Add `scripts/claude-md-refs.test.mjs`: every `§N` and every `R\d` mentioned anywhere under `src/`, `docs/`, `scripts/` and in `CLAUDE.md` itself must resolve to a heading or a rule that exists. It fails the build if not. Run it in `npm test`.

**(b) The contract provenance.** The provenance check parses a markdown table, and Prettier reformatting it already broke the parser once. Move the fields — source repository, source commit, SHA-256, date — into `src/app/core/api/contract/provenance.json`, have the test read that file, and have the folder's `README.md` cite it. A drift guard must not depend on a formatter.

**(c) What the green CI means.** `live-backend.spec.ts` is the only test that touches a real server, and it is skipped unless `SINAPSE_LIVE_API` is set, so **nothing in CI proves this client can talk to the backend.** Do not change that — CI has no backend. Record it as a limitation in `docs/ai/STATE.md` with its consequence, and add to the *Definition of done* section of `CLAUDE.md` that the live spec must be run, against the backend commit named in `provenance.json`, before any tag on `main`.

---

## Backend gaps to record

Add these to the limitations table of `docs/ai/STATE.md`, each with its evidence read from the snapshot, not from this prompt:

| Gap | What is missing |
|---|---|
| K-A | No response schema declares required properties (38 of 56). The bootstrap route's every member is optional, which is why D1 exists |
| K-B | Five nested records occupy the global schema namespace under bare names: `Day`, `Entry`, `Execution`, `Point`, `Student`. This client therefore exports a global type named `Student` that is a roster row with no person's name |
| K-C | The 401 of `POST /api/v1/password-changes` carries two meanings, which is why D2 exists |
| K-D | Twelve of fifteen operations with required request fields declare no 400, including `POST /api/v1/sessions` |
| K-E | No operation completes the guardian-consent flow. An account in `PENDING_GUARDIAN_CONSENT` has no path forward in this client, so screen 5 of the chain is a dead end by necessity, not by choice |
| K-F | `POST /api/v1/email-verifications` confirms a token; no operation re-sends the e-mail. A person who lost it cannot recover from this client |
| K-G | Which consent purposes are essential — the ones whose revocation suspends the account — is not stated anywhere in the contract (D4) |

K-E, K-F and K-G are findings of this task. Verify each before recording it; if any is wrong, say so.

---

## Tests

The *Definition of done* section of `CLAUDE.md` applies in full. Specifically:

- The bootstrap mapper: complete payload, each required member absent, each identifier `null` and absent.
- The guard chain: table-driven over every combination of the five required members, asserting the destination.
- One bootstrap request for a cold navigation across three guarded routes.
- `expire()` once for ten simultaneous failures.
- Sign-in: 201, 401, `validation-failed` with two field errors, 429.
- Sign-out: 204, 401, transport failure.
- Password change: 204 clears locally; 401 then a 200 probe keeps the form; 401 then a 401 probe expires; 401 then a transport failure on the probe clears nothing.
- The time zone: valid, unusable, surviving a refresh, and identical rendering under both `TZ` values.
- A test proving no password, token or e-mail reaches the console or any storage API, in the style of FE-3's log test.
- Accessibility on the sign-in screen and each placeholder: contrast in both themes, the keyboard path, the focus ring, and the error announced in a live region.

Run `npm run lint`, `npm test` and `npm run build`, and the tests under both time zones. Report the numbers.

---

## Documentation

- `docs/ai/STATE.md`: close FE-4 with what was observed, open FE-5, add the gaps above.
- `docs/adr/0003-*.md`, in Portuguese, if and only if you make a decision with real alternatives that this prompt did not settle. D1 to D4 are settled here; record them in `STATE.md`, not as ADRs. The store's mechanism is a candidate for an ADR if you chose between genuinely different designs.
- `CLAUDE.md`: update the *State* section, and the two changes of step 7.
- `docs/prompts/003-session-and-auth.md`: this prompt, verbatim.
- `docs/ai/CONTEXT.md`: how the session works end to end, in one place, for the next session.

---

## Acceptance criteria

1. One store, the only caller of `GET /api/v1/me/state`; one bootstrap per cold navigation, proven.
2. The bootstrap mapper fails on an absent required member instead of defaulting, proven per member.
3. The guard chain matches the table, tested over every combination.
4. Sign-in, sign-out and the password-change clear behave as specified, including the D2 probe and its three outcomes.
5. The account time zone is validated before use, and unusable input keeps UTC and warns.
6. Nothing is persisted: no `localStorage`, `sessionStorage`, cookie or token anywhere, proven by test.
7. No placeholder grows into a flow.
8. `npm run lint`, `npm test`, `npm run build` clean; green under both time zones.
9. The three hygiene items of step 7 are done, including the reference test failing on a bad reference.
10. The gaps are recorded with evidence.

---

## Constraints

- Never invent a route, a field, an enum value or a validation rule. Where something is missing, record it as a gap — the limitations table of `docs/ai/STATE.md`, not a guess in code.
- Never log, store or echo a password, a token, an e-mail address, a date of birth or an invite code.
- Rule R1: only `core/api/**` touches `HttpClient`. The store uses `ApiClient`.
- Rule R6: handle errors by the problem `type`, never by the HTTP status. Three problem types share 409.
- Do not reorder the interceptors.
- Do not edit the vendored snapshot or any generated file.
- Do not build anything in the *Hard prohibitions* section of `CLAUDE.md`, and do not build a teacher route: no operation grants the teacher role and the bootstrap exposes no `roles`.
- Implement incrementally, in reviewable commits. Do not produce the whole task in one pass.

---

## Report

State, in Portuguese:

1. What you verified before implementing, with the values you measured.
2. What you built, by step.
3. The decisions this prompt did not settle, and what you chose, with the reasoning.
4. Anything in this prompt you found to be wrong. FE-3 found two such things and both corrections were right; say so plainly again if you find more.
5. The test and build numbers, and the two time-zone runs.
6. What is open for FE-5.
