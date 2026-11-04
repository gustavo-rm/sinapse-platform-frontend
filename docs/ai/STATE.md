# STATE — sinapse-platform-frontend

Reviewed: 2026-11-04 UTC at the initial commit. Backend read at
`sinapse-platform@c3abbff` (origin/main, 2026-10-25), not executed.

Present only; history is `git log` and the pull request descriptions. Edit only your own row in
**Work**.

## Work

| ID | Title | Status | PR | Depends on | Notes |
|---|---|---|---|---|---|
| FE-1 | Design system and repository bootstrap | done | — | — | `docs/DESIGN_SYSTEM.md`, `src/styles/{tokens.json,tokens.css,sinapse.css}`, `README.md`, `LICENSE`, `.gitignore`, `CLAUDE.md`, `docs/ai/`. 25 component families with guidelines and live previews in the Design System artifact; 74 tokens over seven families; both themes. Inventory derived from the 59 operations of the backend snapshot, READ@c3abbff. Contrast measured, not estimated; the ordinal recall ramp and the categorical chart theme were run through a validator. Verified: `sinapse.css` holds no literal `#rrggbb`, and all 52 tokens it uses are declared in `tokens.css` |
| FE-2 | Angular project, API layer, label catalogue, time service | not started | — | FE-1, D-FE1 | The foundation. Pin TypeScript 6.0.x and Vitest 4.1.x (`CLAUDE.md` §3) |

## Open decisions

Owner of every row: project owner.

| ID | Question | Blocks here | Options | Recommendation |
|---|---|---|---|---|
| D-FE1 | Generate the TypeScript client from the backend's OpenAPI snapshot (openapi-generator `typescript-angular`), or hand-write the API layer against generated types only? | FE-2 | generate the whole client; generate types only and hand-write the client; hand-write both | generate **types** only and hand-write the client: the generated client would bypass the interceptor chain that rules R1 and R6 of `CLAUDE.md` depend on, while generated types keep the contract honest. Owner's call |
| D-FE2 | The four `RecallRating` labels — "Não lembrei", "Lembrei com dificuldade", "Lembrei", "Lembrei com facilidade" | nothing in code; blocks the pilot | approve as proposed; reword | **approve before the pilot starts.** They are a measurement instrument: rewording mid-pilot invalidates comparison across periods |
| D-FE3 | Which icon set to adopt. None was provided; the previews carry minimal inline SVGs that are not a brand asset | nothing | Lucide (1.5px stroke, 24px grid); another set; commission one | Lucide, and record the choice. Owner's call |
| D-FE4 | There is no logo. The name is set in plain type | nothing | commission a mark; keep plain type | keep plain type until a mark exists; never draw one |

## Known issues and limitations

| ID | Description | Status | Evidence | Workaround | Resolved by |
|---|---|---|---|---|---|
| F1 | The frontend plan written in September 2026 (diagnosis, API contracts, screens, flows, roadmap, Claude Code prompts) predates the backend's SP-7 to SP-15 and is **stale**: it reports the catalogue routes as missing, the Core bridge as absent and the route count as 57. It is not committed here for that reason | OBSERVED(2026-11-04, compared against the 59-operation snapshot) | backend `docs/ai/STATE.md` rows SP-7, SP-8, SP-13; `docs/adr/0017` note of 2026-10-05 | use `CONTEXT.md` and the backend snapshot as truth | unassigned: revise the plan against `c3abbff`, then commit it under `docs/` |
| F2 | `GET /api/v1/study-sessions` returns `topicId` and **no** `topicName` or `subjectName`, unlike `/me/agenda` and the teacher panel, which resolve them. The history table must join against the catalogue on the client | READ@c3abbff (`StudySessionResponse` in the snapshot) | — | keep a catalogue map in memory; never show the identifier | by design |
| F3 | `GET /api/v1/me/state` does not expose `roles`, so this client cannot discover whether the account is a teacher. Combined with backend decision P2, the teacher area is unreachable | READ@c3abbff (`StudentStateView` in the snapshot) | — | none. The palliative of reading a 403 from `GET /classrooms` is rejected: it uses an error code as an information channel | the backend, by adding `roles` |
| F4 | `ClassroomRosterView.Student` carries no name and the `account` table has no name column, so a class list would show identifiers | READ@c3abbff | none | an owner decision on identification (product and LGPD) |
| F5 | The backend's `local` profile publishes three consent wordings marked `dev-0` and labelled as not being consent terms. A screen must never present one as a real term | READ@c3abbff (`application-local.yml`) | show the marker visibly in development | by design |

## Unknowns

- Whether `./mvnw verify` passes on the backend today. Not run from here; the backend's own
  `STATE.md` reports its last measured runs.
- The reverse-proxy configuration of any deployed environment.
