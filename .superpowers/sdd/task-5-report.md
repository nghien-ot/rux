# Task 5 report — Public surface and packaging

## Role and scope

Acted as Task 5 Implementer. Tasks 1–4 were approved before this work.

Changed release and public-surface integration only. Did not modify `src/`, client/schema implementation, or tests. Root barrel required no change because it already exports `createClient` and Standard Schema types.

## Files

- `package.json` — ESM/CJS/types exports map, MIT metadata, corrected package QA script; runtime `dependencies` remains `{}`.
- `.github/workflows/publish.yaml` — frozen Bun install, typecheck, full tests, build, and package-surface smoke check before publish.
- `README.md` — v1 `createClient`, Standard Schema/Zod, parsed output, layered options, error variants, and migration guidance.
- `.qa/MANUAL_QA.md` — release QA checklist and published-package smoke instructions.
- `LICENSE` — MIT license text.

## Verification

| Command | Result |
| --- | --- |
| `bun test tests/package.test.ts` before edits | RED: 1 failed because `package.json.exports` was absent; 1 passed. |
| `bun run typecheck` | Passed. |
| `bun run build` | Passed; generated ESM, CJS, and declarations. |
| `bun run test` | Passed: 10 test files, 111 tests, no type errors. |
| `bun run qa:manual` | Passed: build plus package-surface test, 2 passed. |
| `npm pack --dry-run` | Passed: six files, including `LICENSE`, `README.md`, and `dist/`. |
| `rg -i 'zod' dist/index.js dist/index.cjs dist/index.d.ts` | No runtime or declaration references. |
| metadata assertion | Passed: `@nghien-ot/rux`, MIT, empty runtime dependencies, required exports map. |
| `git diff --check` | Passed. |

## Self-review

- Exports exactly map `types`, `import`, and `require` to the generated declaration, ESM, and CJS files.
- Package smoke imports `@nghien-ot/rux` through both module systems.
- README removed obsolete client APIs, plain-object schemas, auth configuration, and error-mode guidance.
- CI verification precedes publishing and uses `bun install --frozen-lockfile`.
- No retries, auth APIs, or compatibility aliases added.
- Existing Task 3/4 artifacts remain unstaged and unchanged by this task.

## Concerns

- `vite-plugin-dts` reports its bundled TypeScript 5.8.2 is older than the project TypeScript 5.9.3. Build and typecheck pass; warning is pre-existing tooling version drift.
- `.qa/*` is ignored by repository policy. `MANUAL_QA.md` must be force-added intentionally.

## Critical fix — CI build order

### File

- `.github/workflows/publish.yaml`

### Root cause and fix

The `verify` job ran `bun run test` before `bun run build`. `tests/package.test.ts` imports the package through its `exports` map and therefore reads `dist/`; before the build, that can be stale checkout output rather than the release candidate. Moved the existing build step to immediately after typecheck and before the full test suite. The package-surface smoke test remains after the full suite.

### Verification

| Command | Result |
| --- | --- |
| `bun run build` | Passed; emitted ESM, CJS, and declarations. |
| `bun run test` | Passed: 10 test files, 111 tests, no type errors. |
| `bun run typecheck` | Passed. |
| `npm pack --dry-run` | Passed: six files, including `LICENSE`, `README.md`, and `dist/`. |

### Self-review

- Build now precedes every package-export import in the CI test flow.
- Only the workflow order and required Task 5 report changed; tests and implementation remain untouched.
- `verify` still uses frozen dependencies and still gates `publish`.

## Final review fix wave — legacy validation surface and discriminated errors

### Scope

- Removed legacy public validation wrappers so v1 exposes a single async Standard Schema validation path: `validate`.
- Tightened `RuxError` into a discriminated union so narrowing exposes request, network, HTTP, and validation-specific fields.
- Preserved visible runtime result shapes while attaching hidden validation metadata where runtime already tracks it.

### Files

- `src/schema/validate.ts`
- `src/schema/index.ts`
- `src/index.ts`
- `src/types/index.ts`
- `src/client/index.ts`
- `tests/types.test.ts`
- `tests/package.test.ts`
- `tests/client.test.ts`
- `tests/standard-schema.test.ts`

### TDD

- Acting as Test Author, added focused contracts for:
  - no public `handleValidation` or `validateResponse` export from the published package
  - exact `RuxError` discriminant narrowing for `request`, `network`, `http`, and `validation`
- Acting as Test Reviewer, approved the new suite before implementation.
- Red proof before source edits:

```text
bun run test -- tests/types.test.ts tests/package.test.ts

FAIL tests/package.test.ts > expected "handleValidation" export to be absent
FAIL tests/types.test.ts > RuxError discriminates precise request, network, http, and validation fields
```

### Verification

| Command | Result |
| --- | --- |
| `bun run build` | Passed; rebuilt `dist/` with legacy validation wrappers removed from the public package surface. |
| `bun run test -- tests/types.test.ts tests/package.test.ts` | Passed: 4 test files, 28 tests, no type errors. |
| `bun run typecheck` | Passed. |
| `bun run test` | Passed: 10 test files, 113 tests, no type errors. |
| `bun run build` | Passed; emitted updated ESM, CJS, and declarations. |
| `bun run qa:manual` | Passed: rebuild plus package smoke test, 2 passed. |

### Self-review

- `validateResponse` and `handleValidation` are removed from both schema and root barrels; `validate` remains the sole public validation entrypoint.
- `RuxError` now narrows precisely: request has message and optional cause, network has message and cause, HTTP has required status/message with optional typed data, validation has message/issues with optional phase/status/cause.
- Validation metadata added for body/query/response/error phases stays non-enumerable, so existing result equality behavior remains unchanged.
- Existing tests that accessed variant-only fields now narrow first; behavior assertions did not weaken.
- Unrelated worktree changes in `.superpowers/sdd/task-4-report.md` and untracked `task-*-brief.md` files remain untouched.
