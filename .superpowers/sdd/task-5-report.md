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
