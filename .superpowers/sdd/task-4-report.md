# Task 4 report: layered HTTP client

## Implementation

- Replaced legacy `defineClient`/error-mode/auth surface with `createClient`.
- Added v1 `RequestOptions`, endpoint/client config, typed call options, path-param inference, typed result/error inference, and public exports.
- Implemented layered request scalar precedence, case-insensitive header merging, endpoint-owned methods, typed path substitution, query serialization, request/response/error schema validation, JSON serialization errors, URL errors, configured fetch, caller abort composition, and timeout handling.
- Added root entrypoint exports for `createClient` and v1 public types after explicit authorization.

## Files changed

- `src/client/index.ts`
- `src/types/index.ts`
- `src/index.ts` (explicitly authorized)

## Verification

| Command | Result |
| --- | --- |
| `bunx vitest run --typecheck tests/client.test.ts tests/types.test.ts` | PASS: 4 files, 89 tests, no type errors |
| `bun run test` | 110/111 tests passed; `tests/package.test.ts` fails because `package.json.exports` is undefined |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Self-review

- No retries or runtime dependencies added.
- Request `method`/`body` are stripped from layered request settings and method is set solely from the endpoint.
- Non-2xx error-schema validation retains status/phase metadata without changing approved error-object equality expectations.
- Timeout and caller abort return request errors with abort causes.

## Concern / blocker

The full suite package-export assertion is unrelated to Task 4 and requires a `package.json` change, which task instructions prohibit. It was left unchanged.

## Review-fix update

- Wrapped every body, query, response, and error Standard Schema validation call so synchronous throws and rejected promises become validation results.
- Added a final async execution boundary so unexpected client-call failures still resolve as request results rather than rejected promises.
- Removed duplicate Standard Schema declarations from `src/types/index.ts`; canonical types now re-export from `src/schema/types.ts`, including `StandardSchemaV1` and `StandardSchemaTypes`.

## Review-fix verification

| Command | Result |
| --- | --- |
| `bunx vitest run --typecheck tests/client.test.ts` | 67 tests passed; Vitest also typechecked `tests/types.test.ts` and reported its existing `StandardSchemaV1` path-type mismatch as an unhandled type error |
| `bunx vitest run --typecheck tests/client.test.ts tests/types.test.ts` | 88 tests passed, 1 type test failed: `StandardSchemaV1 exposes version, vendor, and sync/async validation` |
| `bun run build` | PASS |
| `git diff --check` | PASS |

## Review-fix concern

The remaining type failure is caused by the approved test expecting `Issue.path` to contain only `PropertyKey`, while canonical Task 3 `StandardSchemaIssue` also permits `{ key: PropertyKey }` path segments. Tests and `src/schema/types.ts` were not modified per instruction.
