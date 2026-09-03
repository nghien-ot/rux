# Task 1 Report — Test Author Revision 3

## Status

THIRD_REVISION_SUBMITTED_FOR_REREVIEW. Structural Standard Schema fixtures now declare explicit `~standard.types` metadata so inference is tested against information available on the fixture itself; no `src/` files were modified.

## Commits

- Initial contract tests: `ec894e6` (`test: define rux v1 layered client contract`)
- Revision tests: `624b7a3` (`test: address rux v1 contract review findings`)
- Second revision tests: `5cfb6f4` (`test: address sagan task 1 findings`)

## Test command and output

Focused type suite after the third revision:

```text
bun run test -- tests/types.test.ts
```

Exit code: `1` (expected red)

The direct `InferInput`/`InferOutput` fixture test now type-checks. Remaining failures belong to unimplemented client/package contracts and existing client/type incompatibilities, including the absent root `createClient` export and pre-v1 `RuxResult`/`RuxError` shapes.

Expected red contract command after the third revision:

```text
bun run test -- tests/client.test.ts tests/standard-schema.test.ts tests/validate.test.ts tests/types.test.ts tests/package.test.ts
```

Exit code: `1`

Exact final summary:

```text
Test Files  5 failed | 5 passed (10)
Tests  47 failed | 53 passed (100)
Type Errors  8 failed
Errors  5 errors
error: script "test" exited with code 1
```

Focused red suite:

```text
bun run test -- tests/client.test.ts tests/standard-schema.test.ts tests/validate.test.ts tests/types.test.ts tests/package.test.ts
```

Exit code: `1`

Exact final summary:

```text
Test Files  9 failed | 1 passed (10)
Tests  66 failed | 34 passed (100)
Type Errors  17 failed
error: script "test" exited with code 1
```

Full suite:

```text
bun run test
```

Exit code: `1`

Exact final summary:

```text
Test Files  9 failed | 1 passed (10)
Tests  51 failed | 30 passed (81)
Type Errors  16 failed
error: script "test" exited with code 1
```

Failures are expected red-test evidence for missing v1 behavior/exports in current `src/`, plus missing built package artifacts/exports. Revised test files have no incidental type errors. Zod resolves from `devDependencies`; it is not in runtime `dependencies`.

## Revision evidence

- All four structural schemas in `tests/types.test.ts` now declare `~standard.types.input` and `~standard.types.output`: transformed body, query, response, and HTTP-error schemas. `satisfies StandardSchemaV1<Input, Output>` alone validates assignability but does not place generic information onto a structural value for `InferInput`/`InferOutput` to recover.
- Type assertions retain root-level imports of `Infer`, `InferInput`, `InferOutput`, and `StandardSchemaV1`; the revision does not bypass the final package export surface through internal imports.
- Real Zod Standard Schema integration tests in `tests/standard-schema.test.ts` remain unchanged.

- Failed fetch asserts exactly one fetch attempt.
- Circular request data passes through the body schema unchanged and fails during JSON serialization before fetch.
- No response schema is the optional-response case and returns `undefined` for an empty success; a declared response schema rejects an empty body.
- Exact `Promise<RuxResult<Success, Failure>>` assertions and compile-time required path/query/body presence checks were added, including omission errors.
- Package tests assert the `exports` map, `main`/`module`/`types`, package-name ESM/CJS resolution, and no Zod text in either published bundle.
- Timeout assertions use the exact result shape and verify one fetch call, aborted signal, and exact `TimeoutError` reason/message.
- Query input type uses exact `toEqualTypeOf<{ page: string }>()` while omission checks remain.
- Actual Zod invalid input is asserted as a normalized validation error with exact message and issue path.
- Invalid runtime HTTP method and 500/503 HTTP failures are asserted.
- Required body and query schemas reject null, empty object, empty array, empty string, and unexpected fields with exact validation results and zero fetch calls.

## Self-review

- Standard Schema v1 sync/async results, parsed transforms, issue paths, and actual Zod integration remain covered.
- Precedence, case-insensitive headers, endpoint-only method, bracket params, query serialization, validation-before-fetch, HTTP/error schemas, empty responses, 204, invalid URL, serialization, JSON, network, timeout, caller abort, and configured fetch remain covered.
- Type assertions cover `Infer`, `InferInput`, `InferOutput`, request input shapes, response/error payloads, exact Promise results, required inputs, and forbidden legacy options.
- Assertions use exact values or exact relevant fields; no implementation internals are tested.
- Only `tests/` changed in second-revision commit `5cfb6f4`; unrelated worktree files were not staged.
- The third revision changes only `tests/types.test.ts` and this Task 1 report. The pre-existing untracked `task-3-brief.md` is unrelated and remains unstaged.

## Re-review verdict

**APPROVED.** The reviewer verified that every structural fixture used by `InferInput`, `InferOutput`, endpoint response inference, or endpoint body/query inference declares explicit `~standard.types` metadata. The direct inference assertions still import public types from `../src/index.ts`; no internal-import bypass was introduced. The actual Zod integration coverage is unchanged, no `src/` file is modified, and the current red failures are attributable to remaining Task 1 client/package work rather than this fixture correction.

## Concerns

- Package smoke tests intentionally require built `dist` artifacts and package exports; they remain red until packaging/build implementation lands.
- Empty required-response and timeout error wording/shapes are contract choices asserted by these tests and should be retained or explicitly revised before implementation.
- `zod@4.5.4` is dev-only for the real Standard Schema integration test.
- Focused tests remain red until the v1 implementation is added; no focused run hung.
