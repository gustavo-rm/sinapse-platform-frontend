Frontend — Phase 5 — Consent, verification and the suspended account
Repository: `gustavo-rm/sinapse-platform-frontend` Task ID: FE-5 in `docs/ai/STATE.md` Prerequisite: FE-4.1 merged into `develop` (PR #4). Scope: the gate screens that a real account actually reaches — the consent screen, the majority reaffirmation, the suspended account — plus `/verificar-email` as a public token route, plus the fix to K-H. Out of scope: registration and password reset (FE-6), the initial setup of availability and goals (FE-7), and the guardian branch, which has no backend flow.
Read first: `CLAUDE.md`, `docs/ai/CONTEXT.md`, `docs/ai/STATE.md` — above all its Observed bootstrap bodies table and rows K-H and K-I, which were measured in FE-4.1 and decide most of this task.
In the backend repository, read these three: `docs/adr/0004-modelo-de-consentimento.md`, `docs/FLUXOS_DE_USUARIO_SINAPSE.md` sections 1 and 8, and `src/main/resources/application.yml` under `sinapse.identity` and `sinapse.data-rights`.
Baseline: backend `main = 46b5b3c6372ac8309ed0fc01974e7ebd165aa04b`, the commit in `provenance.json`. The contract has not moved. Confirm it, and read step 0 before you touch the vendored file.
Branching

1. `git switch develop && git pull`
2. `git switch -c feature/1.0/consent-and-verification`
3. Commit there, push, open the pull request into `develop`.

Facts established by measurement, not assumption
From FE-4.1's observations and the backend's configuration. Verify them; report anything that has changed.
Which purposes are essential — settled. ADR 0004: `LEARNING_DATA_PROCESSING` is essential; `INSTITUTION_SHARING` is conditional and is consented only when an invite is redeemed (closed decision F1); `ACADEMIC_RESEARCH` is optional and refusable without any prejudice to the service. The snapshot's wavering between "an essential purpose" and "the essential consents" is loose wording, not an open rule. This closes K-G.
Three of the eight gate rows cannot be reached, and this was measured. `POST /api/v1/sessions` refuses an account that is not active, so no session can exist for `PENDING_VERIFICATION`, and `/me/state` never returns it: row 4 is dead. The erasure sweep removes every session and anonymises the row, so row 2 is dead for any client. Row 5 is not producible, because registration refuses a holder below the consent age. The reachable gates are: unauthenticated, SUSPENDED, reaffirmation, consent, setup.
A suspended account can sign in and hold a session — observed, both when an essential consent was withdrawn and when erasure was requested.
The bootstrap cannot tell the two causes of suspension apart. Both produced the same body, with `pendingConsents` empty. So the suspended screen has to ask another route which cause it is.
Token lifetimes, from configuration: e-mail verification 24h, password reset 1h, majority reaffirmation 30d. The erasure window is 7 days. The majority grace period is 30 days and is not exposed anywhere in the contract (K-K).
Timings: the session cookie is `sinapse_session`, `Path=/api/v1`, `HttpOnly`, `SameSite=Strict`, no `Secure` under `local`; idle timeout 7 days, absolute 30 days.
Under `local` the three published wordings are placeholders that say "Development placeholder. Not a consent term." (version `dev-0`). Any screen that shows a term must show that marker visibly, so nobody in development mistakes it for a real term (F5).
Step 0 — K-H: the gate currently invalidates the research consent
Observed in FE-4.1: an ACTIVE account that declined `ACADEMIC_RESEARCH` at registration receives `"pendingConsents":["ACADEMIC_RESEARCH"]`, and row 7 of the chain holds it on the consent screen. No operation records a refusal — `POST /consents` grants and `DELETE /consents/{purpose}` withdraws what is in force — so a student who declines research can be held there indefinitely.
This is not a usability complaint. ADR 0004 states that `ACADEMIC_RESEARCH` is refusable without any prejudice to the service, and gives the reason: if the product degrades on refusal then the consent is not freely given and the data is not usable in a publication. Holding a student on a screen until they grant it is the maximum possible degradation. While this behaviour ships, the research consent collected is not free and the pilot's data is not publishable.
Fix it here, in the frontend, first. Row 7 holds only on purposes the student cannot decline without consequence. `ACADEMIC_RESEARCH` is still offered on the consent screen — never required, never a gate. Keep the chain a pure function and extend its table-driven test with the declined-research case, which must now reach the application.
Do not wait for the backend. The backend side (`pendingConsents` should not list an optional purpose, or a refusal should be recordable) is reported as K-H and is the owner's and the backend's call; this fix is correct independently of it, because the gate is this client's decision.
State in `STATE.md` which of the two fixes you made and that the other is still open.
Implementation
1. The consent screen — the `consent` gate
`GET /api/v1/terms` (open, no session), `POST /api/v1/consents` with `{purpose, termsVersionId}`.

* Show the full `body` of each pending purpose before its control. A person who has not read the wording has not consented to it. Show the `version`, and show the `dev-0` placeholder marker when it is there.
* Send the `termsVersionId` of the wording actually displayed. Never a remembered one.
* 409 on grant means the purpose is already in force — refresh the session state rather than reporting an error the person cannot act on.
* After a successful grant, call `SessionStore.refresh()` and let the chain decide where the person goes next. Do not navigate by hand.
* `ACADEMIC_RESEARCH`, when offered here: no pre-checked control, no "recommended", no warning colour, no second ask, and a visible way to continue without granting it. Assert that absence in a test.

2. Withdrawing a consent, and the warning the flows document requires
`DELETE /api/v1/consents/{purpose}`.
The flows document states it plainly: withdrawing an essential purpose suspends the account in the same transaction, and the screen has to say so unambiguously beforehand. So:

* For `LEARNING_DATA_PROCESSING`: before the act, say that the account will be suspended and the session ended, in the student's own language, and require a deliberate confirmation. Not a tooltip, not fine print.
* For `ACADEMIC_RESEARCH`: no warning beyond what it does, because the contract says it has no effect on the service. A scary confirmation here would be the same pressure the ADR forbids.
* For `INSTITUTION_SHARING`: it ends a teacher's access immediately. Say that, and say nothing about suspension.
* After a withdrawal that suspends, the session is already dead: let the expiry path do its work rather than racing it.

3. The suspended screen — the real content
Two causes, the same bootstrap body. Read `GET /api/v1/me/erasure-requests` to tell them apart.

* An erasure request inside its window: say the account is suspended because erasure was requested, say the window is 7 days and when it ends if the route tells you, and offer the two things that exist — cancel the request (`POST /api/v1/me/erasure-requests/{requestId}/cancellation`) and export the data (`GET /api/v1/me/data-export`, which `ApiClient` already gives 120 s). This closes F17.
* No erasure request: the cause is a withdrawn essential consent. Offer to grant it again, reusing the consent screen's component.
* Verify, do not assume, whether granting the essential consent again reactivates the account. ADR 0004's invariant is "an ACTIVE account has a consent in force", but nothing states that a new grant moves `SUSPENDED` back to `ACTIVE`; only the reaffirmation route says it "puts the account back to active". Produce a suspended account locally — one `DELETE /consents/LEARNING_DATA_PROCESSING` does it — grant again, and report what `accountStatus` becomes. If it does not reactivate, say so on the screen instead of offering an action that does nothing, and record it as a gap.
* If the export is offered, the request takes as long as it takes: show the loading state, never a fake progress bar.

4. The majority reaffirmation — the `reaffirmation` gate
`POST /api/v1/consents/reaffirmation`. Either a token or a session identifies the holder; here the person has a session, so send what the route needs and nothing more.

* Explain what is being asked: a consent a guardian gave is being reaffirmed in the person's own name.
* Do not invent a deadline. The grace period is 30 days and ends in suspension, but the contract exposes neither the deadline nor the date of birth, so this client cannot compute it (K-K). Say that reaffirmation is needed and that the account stays usable meanwhile — which ADR 0004 states — and no more.
* After success, `refresh()` and let the chain route.

5. `/verificar-email` — a public route, not a gate screen
Row 4 of the chain is unreachable, so the verification screen cannot live behind a session. Move it out of the gate set and make it a public route. `POST /api/v1/email-verifications` with `{token}`.
This route's path and query parameter are the contract the backend is waiting on — its own documentation says the platform does not know the frontend's address and that the frontend's verification route is not defined. Decide it here, record it in `CONTEXT.md`, and state it in the report. Recommended: `/verificar-email`, token in a `token` query parameter. This closes F18.

* Token in the URL: consume it on arrival.
* No token in the URL: show a field to paste one. There is no e-mail transport — `LoggingAccountNotifier` discards the message, and under `local` only, `DevOnlyLoggingAccountNotifier` writes the token to the server console marked `DEV ONLY`. Pasting is the only path that works today, and it stays useful when a mail client mangles a link.
* The token is a single-use credential: it must never reach a log, a message, the page title or any storage — extend FE-4's leak test to cover it — and must be removed from the URL with a history replacement after consumption.
* 204: the account is ACTIVE. Send the person to sign in, saying what happened.
* 404 covers unknown, expired and already used, deliberately conflated. One message; do not speculate.
* 429: 10 per 5 minutes, and the notice says how long, as C6 already does.

6. Mark the dead rows, do not delete them
Rows 2, 4 and 5 stay in the chain: the `accountStatus` values exist in the contract and `readAccountState` rejects an unknown status, so removing them would turn a future server state into an unreadable body. Mark each in code and in `STATE.md` as unreachable today, with the measured reason. Row 4's screen moves to the public route of step 5; its gate row stays.
7. The line-ending trap, before anyone re-vendors
The backend's `docs/openapi/openapi.json` checks out with CRLF on Windows: 131,588 bytes, SHA-256 `c8da37dd…c79b`. The vendored copy is the LF form: 127,161 bytes, `d709e504…afb0`. Normalising CRLF to LF reproduces the vendored hash exactly, and a key-by-key comparison gives zero differences — the contract is identical. The backend has no `.gitattributes`.
Make the drift guard immune: normalise line endings before hashing, keep the recorded hash the LF one, and add a test that a CRLF copy still passes. Reported as K-J.
The observation
With the backend under `local` and `ng serve` through the proxy, produce each account and walk its screen. All of these are producible — FE-4.1 produced them:

1. An ACTIVE account that declined research: confirm it now reaches the application instead of being held (step 0), and that the consent screen still offers research if the person goes there.
2. The same account granting research from the consent screen: `refresh()`, then where the chain sends it.
3. A suspended account by `DELETE /consents/LEARNING_DATA_PROCESSING`: the screen, and whether granting again reactivates.
4. A suspended account by erasure request: the screen, the cancellation, and the state afterwards.
5. Withdrawing the essential consent from the consent screen: the warning, the confirmation, and the session dying.
6. Verification by URL token and by pasted token, plus a second use of the same token.

Report what each screen showed and what each response was. If a step cannot be done, say which and why, and do not report the task as done.
Tests
The Definition of done section of `CLAUDE.md` in full, and specifically: the gate chain's table extended with declined research; each screen's success and declared errors; the essential-withdrawal confirmation required before the call is made; the absence of any default-granted or recommended state on research; the suspended screen for both causes; verification by URL and by field, 404, and the URL cleaned; the leak test extended to the verification token; contrast measured in a real browser; and green under `TZ=America/Sao_Paulo` and `TZ=Asia/Tokyo`.
Documentation
`STATE.md`: close FE-5, open FE-6 (registration and password reset) and FE-7 (setup), record the decisions, the dead rows, and what you measured about reactivation. `CONTEXT.md`: the verification route and its parameter, as the contract the backend needs, and the consent model in one place. `docs/prompts/005-consent-and-verification.md`: this prompt, verbatim. An ADR only for a decision with real alternatives that this prompt did not settle.
Report
In Portuguese: what you verified; what you built; the verification route you defined, for the backend; whether granting an essential consent again reactivates a suspended account; the full walk-through with what each screen showed; the numbers; and anything here that turned out to be wrong. FE-3 and FE-4 each found real errors in their prompts and both corrections were right — keep doing that.
