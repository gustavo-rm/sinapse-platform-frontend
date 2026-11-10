Frontend — Fix — Run it against the real backend, and say what happened
Repository: `gustavo-rm/sinapse-platform-frontend` Task ID: FE-4.1 in `docs/ai/STATE.md` Prerequisite: FE-4 merged into `develop` (PR #3). Scope: three small fixes that together let a person actually run and see this application: the development proxy, honest feedback when a session cannot be established, and the bootstrap's tolerance for a non-ACTIVE account. Out of scope: everything behind the five gate placeholders, the suspended-account recovery paths, and any new screen. That is FE-5.
Read first: `CLAUDE.md`, `docs/ai/CONTEXT.md`, `docs/ai/STATE.md`, and `docs/adr/0003-leitura-imperativa-do-estado-de-sessao.md`. Cross-references here name the section, never its number.
This task is not finished by tests. It is finished by looking. Three tasks have now been completed against MSW and a bundle with no server behind it, which means nobody has yet seen this application work. The point of this one is to change that, and the report must say what was observed on screen, not only what passed.
It needs the backend running locally (`sinapse-platform`, profile `local`, PostgreSQL). If you cannot reach it, do step 1, say so, and stop — do not substitute mocks for the observation and do not report the task as done.
Branching

1. `git switch develop && git pull`
2. `git switch -c fix/1.0/local-run-and-session-feedback`
3. Commit there, push, open the pull request into `develop`.

1. The development proxy
The problem, verified: there is no `proxy.conf.json` and the `serve` target of `angular.json` has no `proxyConfig`. The backend configures no CORS — same origin behind a reverse proxy is the deployment decision — and `ApiClient` issues relative paths. So `ng serve` serves the application on one origin and sends `/api/v1/...` to a dev server that has nothing there, and every protected route lands on `/indisponivel`. The application cannot be run at all today.
Do:

* Add a proxy that maps `/api/v1` to the local backend, and register it on the `development` configuration of the `serve` target. Confirm first that the installed `@angular/build:dev-server` accepts `proxyConfig` by reading the builder's own schema in `node_modules`; if it does not, report what it does accept instead of guessing.
* Do not rewrite the path: the backend serves `/api/v1/...` and the client asks for `/api/v1/...`.
* Do not hard-code a port anywhere in `src/`. The proxy file is configuration; `ApiClient` stays on relative paths.
* Rewrite the README's section on running against the local backend after it has worked, in both languages, describing what you actually did.

Then observe, with the backend running. Sign up or use a seeded account and walk through: sign in, the home route, sign out, a wrong password, a wrong current password on the password change. Report for each what the screen showed.
Pay attention to the cookie, because it is the one thing no test here has ever exercised: it is opaque, `HttpOnly`, `SameSite=Strict`, `Path=/api/v1`. Report whether it is set, whether it travels on the next request, and what its attributes are as the browser shows them. The `local` profile is expected to issue it without `Secure` — verify that rather than assuming it, and say what you found.
2. A sign-in that succeeds and then bounces
The problem, reported at the end of FE-4: if `POST /api/v1/sessions` answers 201 and the bootstrap that follows answers 401 — a cookie the browser refused, for instance — the person is returned to `/entrar` with no message. They will retry forever with no information. This is the worst failure mode in the application, because it is silent.
Do: distinguish the two situations and say which one happened.

* A 401 on a bootstrap that follows a successful sign-in in this same navigation is not an expired session. It means the session could not be established in this browser. Say that, in the student's language, impersonally, without naming a cookie or a header — and leave the person on the sign-in screen rather than looping.
* A 401 on any other bootstrap stays exactly as it is today: the expiry path, untouched.
* The distinction lives in the store, not in the sign-in page: the page already has enough jobs, and a second caller of the same sequence must get the same behaviour.

Test it: 201 then 401 shows the new message and does not loop; 201 then 200 behaves as before; a 401 with no preceding sign-in still expires. Then reproduce it for real if you can — serving the application on an origin the cookie refuses is one way — and report what you saw.
3. The bootstrap and a non-ACTIVE account
The problem: FE-4 correctly scoped `setupComplete` to ACTIVE accounts, on the strength of the route's own description — "the plan, the job, the open session and the readiness flag come back empty". But `readAccountState` still requires `timeZone`, `pendingConsents` and `requiresMajorityReaffirmation` for every status, and an ANONYMIZED account plausibly has no time zone (it is personal data, and anonymising usually clears it) and no pending consents. If so, the bootstrap fails as `unreadable` and the person sees the error screen instead of the terminal screen — the same bug FE-4 fixed, one status over. Neither the schema nor the prose settles it.
Do, in this order:

1. Observe what you can. A SUSPENDED account is one call away: withdraw an essential consent (`DELETE /api/v1/consents/{purpose}`), which suspends the account and ends its sessions in the same transaction. Report the exact body `GET /api/v1/me/state` returns for it, member by member. Do the same for `PENDING_VERIFICATION`, which registration produces directly.
2. ANONYMIZED is probably not reachable in a local session — erasure runs on a window. Say whether you could produce it.
3. Only if you could not observe it, apply the symmetric relaxation as insurance: `timeZone`, `pendingConsents` and `requiresMajorityReaffirmation` may be empty when `accountStatus` is not ACTIVE, carried in the type the same way `setupComplete` already is. Rows 2–5 of the gate chain read `accountStatus` alone, and no gate screen renders a date or a consent list, so nothing downstream needs them. `AccountTimeService` keeps UTC when there is no zone, without the development warning in that case — an absent zone for a terminal account is not a misconfiguration.

Whichever path the evidence takes you down, record in `STATE.md` what you observed and what you assumed, kept apart.
4. One small question
On a 429, FE-4 disables the submit button for the duration of `Retry-After` (decision C6). Check whether the notice tells the person how long. A dead silent button is worse than a visible wait. If it does not, add the remaining time to the notice text — no retry control, per the design system.
Definition of done

1. `ng serve` reaches the local backend and a person can sign in, land, and sign out.
2. The README's local-run section describes what actually worked, in both languages.
3. A sign-in that cannot establish a session says so and does not loop.
4. Step 3 resolved by observation where possible, by the symmetric relaxation where not, with the two kept apart in `STATE.md`.
5. `npm run lint`, `npm test`, `npm run build` clean; green under `TZ=America/Sao_Paulo` and `TZ=Asia/Tokyo`.
6. `live-backend.spec.ts` run against the running backend, with its five checks reported. Note that the proxy does not make this spec runnable without a backend — it talks to `SINAPSE_LIVE_API` directly.
7. `STATE.md` closes FE-4.1; `CONTEXT.md` gains one line that is worth more than the rest of this task: in this snapshot, contract facts live in the operations' descriptions as well as in `required`, so a schema that says nothing is not a contract that says nothing. Both of the review's errors came from reading only the schema.

Report
In Portuguese: what you observed on screen and in the cookie, with the real bodies you saw for each account status; what you changed; what you could not observe and what you assumed instead; the numbers; and anything in this prompt that turned out to be wrong.
