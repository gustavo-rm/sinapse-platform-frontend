Frontend — Phase 6 — Account entry: registration and password reset
Repository: `gustavo-rm/sinapse-platform-frontend` Task ID: FE-6 in `docs/ai/STATE.md` Prerequisite: FE-5 merged into `develop`. FE-5 builds `/verificar-email` as a public token route and the consent screen; this task reuses both, and reuses FE-5's token handling rather than writing a second copy of it. Scope: the three public routes that create and recover an account — registration, password-reset request, password-reset confirmation. Out of scope: e-mail verification (FE-5 owns it, because its route is unreachable by the gate chain), the consent screen, the reaffirmation, and the initial setup (FE-7).
Read first: `CLAUDE.md`, `docs/ai/CONTEXT.md`, `docs/ai/STATE.md`, `docs/DESIGN_SYSTEM.md` on forms and on states and interactions. Cross-references here name the section, never its number.
In the backend repository, read these four — they decide most of this task and none of it is in the OpenAPI snapshot:

* `docs/adr/0004-modelo-de-consentimento.md` — which purposes are essential, and why `ACADEMIC_RESEARCH` must be refusable with no penalty
* `docs/FLUXOS_DE_USUARIO_SINAPSE.md` sections 1 and 9 — the registration flow as designed, with its closed decisions
* `docs/DESENVOLVIMENTO_LOCAL.md` — how to create and activate an account on a workstation; you will follow it
* `docs/PROXY_REVERSO.md` — the rate-limit budgets, and why they are shared in local development

Baseline: the backend is at `main = 46b5b3c6372ac8309ed0fc01974e7ebd165aa04b`, which is exactly the commit `provenance.json` records. The contract has not moved. Confirm it yourself, and see the note on line endings below before you touch the vendored file.
The password policy is in the contract, and the form must state it before the person types. `password` and `newPassword` are `minLength: 12, maxLength: 256`. `LoginRequest.password` and `PasswordChangeRequest.currentPassword` are `minLength: 0` on purpose — never validate the length of a password someone is proving they already know. `acceptedTerms` has `minItems: 1`. `email` carries `format: email`, which is a hint, not a validator: the server decides.
Branching

1. `git switch develop && git pull`
2. `git switch -c feature/1.0/account-entry`
3. Commit there, push, open the pull request into `develop`.

Facts that govern this task
Each of these is read from the backend, not assumed. Verify them; if any has changed, report it before building.
There is no e-mail transport. `LoggingAccountNotifier` records that there was a message to deliver and discards it. Under the `local` profile only, `DevOnlyLoggingAccountNotifier` writes the token to the server console marked `DEV ONLY`, together with the call that consumes it. So a token reaches a person today only by reading the server console. This is the single most important constraint on this task.
The frontend's routes are undefined, and the backend is blocked on them. Its own words: the platform does not know the frontend's address, and the frontend's verification route is not defined. Defining them is this task's job, and reporting them is part of the deliverable.
The terms route is open on purpose. `GET /api/v1/terms` needs no session, "because the screen that collects a registration has to show the full text before there is an account to attribute the reading to". Show the full `body`, not a summary and not a link.
The server actively refuses `INSTITUTION_SHARING` at registration — observed in FE-4.1. It answers 400 `validation-failed` with `field: institutionSharingAbsent` and the message "sharing with an institution is consented to when an invite is redeemed". The snapshot states no such rule (K-I). So this is not only a design decision to respect; it is a wire-level error if you get it wrong.
Only two purposes belong on the registration screen. `LEARNING_DATA_PROCESSING` is essential. `ACADEMIC_RESEARCH` is optional and refusable without any prejudice to the service. `INSTITUTION_SHARING` is consented only when an invite is redeemed — closed decision F1 of the flows document, because consenting at registration to something the person may never use is not informed consent. Do not put it on this screen.
`ACADEMIC_RESEARCH` must cost nothing to refuse. No pre-checked box, no "recommended", no warning colour, no extra step, no degraded path, no second ask. The justification is not politeness: ADR 0004 states that if the product degrades on refusal then consent is not free and the data is not usable in a publication. A nudge here invalidates the pilot's data. Treat this as a hard rule of the same weight as semantic colour describes the system, never the student.
The time zone is suggested, never inferred. The client may propose the browser's zone; the person can change it; the server does not guess. It is a required field of the request.
Under-age registration is refused, and there is nothing to offer instead. 422 means the holder is below the configured consent age. The guardian branch exists in the schema and its flow is not implemented (ADR 0004, "Consequência para a v1"). Say so plainly, do not blame the person, and do not ask for a guardian's e-mail — no route would receive it.
A password reset answers the same way whether or not the address exists. Deliberate: "The alternative turns this route into a way of testing who has an account here." The screen must show the identical confirmation in both cases and must never hint otherwise. This is a privacy property that a helpful-looking message destroys.
Rate limits, per address, on every route in this task (base configuration): 5 registrations per hour; 10 e-mail verifications per 5 minutes; 5 password-reset requests per hour; 10 reset confirmations per 5 minutes; and, from FE-4, 10 sign-in attempts per 5 minutes. Behind a proxy with `trusted-proxies` empty — which is the default, and what your development proxy produces — all anonymous callers share one bucket. Five registrations per hour is therefore your whole local budget, not each tester's.
Implementation
1. Registration — `/criar-conta`
`GET /api/v1/terms`, then `POST /api/v1/accounts` with `RegistrationRequest` (`acceptedTerms`, `dateOfBirth`, `email`, `password`, `timeZone`, all required).

* Read the terms first and show the full text of each purpose before its acceptance control. A person who cannot read the wording has not consented to it.
* `acceptedTerms` carries `{purpose, termsVersionId}` per accepted purpose. Send the `id` of the wording the person actually saw — never a remembered or hard-coded one.
* The two outcomes of 201: the response is `RegistrationResponse {accountId, status}` and the status is `PENDING_VERIFICATION`. Do not sign the person in; send them to the verification screen with an explanation of what has to happen next, and in development say where the token is.
* 400: per-field messages (the route declares it, unlike most).
* 422: the under-age message above.
* 409: two meanings in one answer — "Address already registered, or the accepted wording is no longer the one in force". Decide and justify: I recommend re-reading `GET /api/v1/terms` and comparing the version ids against what was submitted. If they differ, the wording moved — say so and re-present the new text for a fresh reading, because a stale acceptance is not consent. If they match, the address is the cause: tell the person the address cannot be used and offer the sign-in and password-reset paths, rather than asserting that an account exists. Record this as a decision and report the ambiguity to the backend.
* 429: the notice must say how long, because an hour-long dead button with no explanation is a broken screen.

2. E-mail verification — owned by FE-5
Registration sends the person to `/verificar-email`, which FE-5 built. Do not rebuild it. The only work here is the handoff: after 201, go there with an explanation of what has to happen next, and in development say where the token is.
 <!-- kept for reference; FE-5 owns this screen ### (reference) E-mail verification — `/verificar-email` `POST /api/v1/email-verifications` with `{token}`. **This route's path and query parameter are the contract the backend is waiting for.** Define them here, record them in `CONTEXT.md`, and state them in the report so they can be carried to the backend. Recommended: `/verificar-email`, with the token in a `token` query parameter. - If `token` is in the URL, consume it on arrival and show the outcome. - If it is not, **show a field for the person to paste one**. This is not a convenience: today it is the only path that works, because the token exists only in the server console. Keep the field when e-mail delivery exists later — a person whose link was mangled by a mail client still needs it. - **The token is a single-use credential.** It must never reach a log, a message, the title or any storage; extend FE-4's leak test to cover it. After consumption, remove it from the URL with a history replacement so it does not sit in the back stack or get copied out of the address bar. - 204: the account is `ACTIVE`. Send the person to sign in with a clear statement of what happened. - 404: unknown, expired **or already used** — the backend conflates the three deliberately. One message for all three; do not speculate about which. - 429: 10 per 5 minutes, with the remaining time. --> 
3. Password reset — `/esqueci-senha` and `/redefinir-senha`
`POST /api/v1/password-resets` with `{email}`, then `POST /api/v1/password-resets/confirmation` with `{token, newPassword}`.

* The request screen: always the same confirmation, whatever the answer. 204 is the only success and it means nothing about the address.
* The confirmation screen mirrors the verification screen: token from the query parameter or from a field, same single-use handling, same URL cleanup. Recommended route `/redefinir-senha`, token in `token`.
* 204 on confirmation ends every session of the account. If the person had a session in this browser, clear it locally — the same rule as the password change, already in `CLAUDE.md` under Session and time, in one place.
* 404 conflated as above. 429: 5 requests per hour, 10 confirmations per 5 minutes.
* The backend reports this path as covered by unit tests but never exercised end to end. Yours will be the first full run. Report exactly what happened, step by step.

4. Wire the entry points
`/entrar` has nowhere to send a new or locked-out person today. Add the two links. Keep the public layout's existing behaviour from FE-4 untouched.
5. Guard the public routes
A person with a live session should not land on registration or password reset. Reuse FE-4's chain rather than writing new logic: these are public routes, so the rule is the mirror of the gate screens' — an authenticated person is sent on to where the chain says they belong. Verification is the exception: a `PENDING_VERIFICATION` account must reach `/verificar-email`, and FE-4's chain already sends it there.
6. The line-ending trap, before anyone re-vendors
The backend's `docs/openapi/openapi.json` checks out with CRLF on Windows: 131,588 bytes, SHA-256 `c8da37dd…c79b`. The vendored copy is the LF form: 127,161 bytes, `d709e504…afb0`. Normalising CRLF to LF reproduces the vendored hash exactly, and a key-by-key comparison of the two documents gives zero differences — the contract is identical.
Make the drift guard immune: normalise line endings before hashing, and keep the recorded hash the LF one. Add a test that a CRLF copy of the snapshot still passes. Report it as K-H so the backend can also add `.gitattributes`.
The observation, which is the point of this task
With the backend running under `local` and the development proxy in place, follow `DESENVOLVIMENTO_LOCAL.md` end to end through the interface, not with curl:

1. Register an account on `/criar-conta`, having read the terms on screen.
2. Find the `DEV ONLY` line in the server console and take the token.
3. Verify on `/verificar-email`, by pasting the token and by the URL parameter — both.
4. Sign in. Confirm the gate chain lands you where it should.
5. Request a password reset, take that token from the console, complete it, and confirm every session ended.
6. Register a second account with a date of birth below the consent age and report what the screen said.

Report what each screen showed. If any step cannot be done, say which and why, and do not report the task as done.
Tests
The Definition of done section of `CLAUDE.md` in full, and specifically:

* Each form: success, each declared error, and 429 with the remaining time rendered.
* The 409 decision of step 1: terms moved, and terms unchanged.
* Verification: token from the URL, token from the field, 404, and the URL cleaned afterwards.
* The leak test extended to verification and reset tokens, with a negative control.
* The reset request shows the same screen for a known and an unknown address — asserted, because this is the test that stops someone from "improving" the message later.
* `ACADEMIC_RESEARCH` refused: the registration succeeds, nothing else changes, and nothing on the screen marks the refusal as a lesser choice. Assert the absence of a default-checked state.
* Accessibility on all four screens: contrast in both themes, the keyboard path, focus, and errors announced in a live region. Measure contrast in a real browser as FE-4 did.
* Green under `TZ=America/Sao_Paulo` and `TZ=Asia/Tokyo` — the date of birth is a local date and must not shift.

Documentation

* `docs/ai/STATE.md`: close FE-5, open FE-6 and FE-7, record the decisions and any new gap.
* `docs/ai/CONTEXT.md`: the two frontend routes and their query parameter, stated as the contract the backend needs.
* `docs/prompts/005-account-entry.md`: this prompt, verbatim.
* An ADR only if you make a decision with real alternatives that this prompt did not settle.

What comes after, and why in this order
FE-6 — consent and reaffirmation: the consent screen for `pendingConsents`, the majority reaffirmation, and the suspended screen's real content. They share `GET /api/v1/terms` and the consent model, and the suspended screen's recovery path is a consent grant. Two things to carry: revoking an essential purpose suspends the account in the same transaction, and the flows document requires the screen to say so unambiguously before the act; and the reaffirmation has a 30-day grace period that the contract does not expose, so the student cannot be told how long they have (K-I).
FE-7 — initial setup: availability and goals, which need the catalogue routes. Closed decisions: require availability and at least one goal and nothing more; goals reference a subject, not a topic; the student declares no effort estimate.
Registration comes first because without it no account can exist except through curl, and because the three routes here share one shape, one rate-limit family and one missing piece.
Report
In Portuguese: what you verified; what you built; the decisions this prompt left open and what you chose; the two routes you defined, for the backend; the full walk-through of the observation with what each screen showed; the numbers; and anything here that turned out to be wrong.
