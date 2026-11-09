# core/api/contract — the vendored API contract

What this client knows about the server's contract, and where each piece came from.

| File              | What                                                                 | Written by                                                         |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `openapi.json`    | byte copy of the backend's OpenAPI snapshot                          | vendored, never edited                                             |
| `schema.d.ts`     | TypeScript declarations of `openapi.json`                            | `npm run contract` (openapi-typescript), never edited              |
| `models.ts`       | friendly aliases of the generated schemas, the names features import | hand                                                               |
| `enums.ts`        | every enum as a runtime list, for the label catalogue                | hand; tied to `schema.d.ts` at compile time by `enums.contract.ts` |
| `problem-type.ts` | the 17 `urn:sinapse:problem:*` types                                 | hand, from `ApiErrorType.java`: the snapshot does not list them    |

## Provenance of `openapi.json`

The test `scripts/contract.test.mjs` reads the SHA-256 below and fails if the vendored file does
not hash to it. Change the two together, and only by the refresh procedure.

| Field                         | Value                                                                |
| ----------------------------- | -------------------------------------------------------------------- |
| Source repository             | `gustavo-rm/sinapse-platform`                                        |
| Source path                   | `docs/openapi/openapi.json`                                          |
| Source commit                 | `46b5b3c6372ac8309ed0fc01974e7ebd165aa04b` (origin/main, 2026-11-09) |
| Last commit touching the file | `d1a09242980c106d785d30aa1a52157230467f69` (2026-10-25)              |
| SHA-256                       | `d709e504097b1bb0d97b7c7c702493cc4784c8fbc0a61d2806982a4290d8afb0`   |
| Counted                       | OpenAPI 3.1.0, 51 paths, 59 operations, 56 schemas                   |
| Vendored on                   | 2026-11-09                                                           |
| Generator                     | openapi-typescript 7.13.0, in `tools/contract/`                      |

## Refresh

The procedure is in `docs/ai/CONTEXT.md`, "The vendored contract".
