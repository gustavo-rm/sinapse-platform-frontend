# core/api/contract — the vendored API contract

What this client knows about the server's contract, and where each piece came from.

| File              | What                                                                 | Written by                                                          |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `openapi.json`    | byte copy of the backend's OpenAPI snapshot                          | vendored, never edited                                              |
| `schema.d.ts`     | TypeScript declarations of `openapi.json`                            | `npm run contract` (openapi-typescript), never edited               |
| `models.ts`       | friendly aliases of the generated schemas, the names features import | hand                                                                |
| `enums.ts`        | every enum as a runtime list, for the label catalogue                | hand; tied to `schema.d.ts` at compile time by `enums.contract.ts`  |
| `problem-type.ts` | the 17 `urn:sinapse:problem:*` types                                 | hand, from `ApiErrorType.java`: the snapshot does not list them     |
| `provenance.json` | where `openapi.json` came from, and its SHA-256                      | hand, by the refresh procedure; read by `scripts/contract.test.mjs` |

## Provenance of `openapi.json`

The provenance record is [`provenance.json`](./provenance.json): source repository, source path,
source commit, the last commit that touched the file, SHA-256, the counted paths, operations and
schemas, the date it was vendored and the generator. `scripts/contract.test.mjs` reads that file —
not this README — and fails if the vendored `openapi.json` does not hash to the recorded SHA-256 or
does not have the recorded counts. Change the snapshot and the record together, and only by the
refresh procedure.

The record is JSON, not a table here, because the check that guards against drift must not depend
on how a formatter lays out markdown: Prettier reformatting the former table once broke its parser.

## Refresh

The procedure is in `docs/ai/CONTEXT.md`, "The vendored contract".
