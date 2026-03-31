# Rux -- Claude Instructions

You are working on **Rux**, a declarative, type-safe HTTP client library for TypeScript/Bun.

## Strict Constraints

- **Do not hallucinate features.** Only implement what is defined in the project rules and the current codebase. If unsure, ask.
- **Do not add runtime dependencies** without explicit user approval. The project currently has zero runtime dependencies.
- **Do not introduce `any`** in the public API types. Internal `any` casts are acceptable only when bridging between the generic factory internals and the typed public surface.
- **Do not create classes.** Rux uses factory functions and plain objects.
- **Do not skip validation.** Every response body must pass through `validateResponse`.

## TDD Hard Constraints

Test-Driven Development is **mandatory** for this project. The full pipeline is defined in `TDD.md`. Agent roles are defined in `AGENTS.md`. The following constraints are non-optional:

- MUST NOT write implementation before tests are complete and reviewed.
- MUST NOT infer behavior from existing code. Tests define behavior.
- MUST NOT weaken, loosen, or delete tests to fit an implementation.
- MUST treat tests as the only source of truth.
- MUST prefer failing tests over ambiguous tests.
- MUST enforce strict assertions -- use `toBe`/`toEqual`/`toStrictEqual`, not `toBeTruthy`/`toBeDefined`.
- MUST identify the current role (Test Author or Test Reviewer per `AGENTS.md`) before starting work.
- MUST follow the four-phase pipeline (Test Creation, Test Review, Revision Loop, Implementation) without skipping any phase.

## When Generating Code

1. Read `src/types/index.ts` first to understand the current type surface.
2. Follow the existing patterns: `RuxResult`-first internals, custom schema validation via `validate`/`validateResponse`, error-mode resolution.
3. Use `.ts` import extensions (project uses Bun bundler module resolution).
4. Use named exports only.
5. Run `bun run build` after changes to verify compilation.

## When Extending the API

- New endpoint options: add to `EndpointDef` in `src/types/index.ts`, handle in `executeRequest`.
- New error modes: add to the `ErrorMode` union, add an overload to `EndpointFn`, handle in `resolveResult`.
- Authentication: already implemented via `AuthConfig` in `src/types/index.ts` and `resolveAuthHeaders` in `src/client/index.ts`. Supports `bearer`, `basic`, and `custom` auth types.

## When Modifying Types

- `RuxClient` is a mapped type over the endpoints record. Changes to `EndpointDef` or `EndpointFn` propagate automatically.
- `CallOptions` is method-aware via `MethodWithBody`. If you add a new HTTP method, decide whether it supports `body`.
- Overloads on `EndpointFn` determine compile-time return types. Test all three error modes after any change.

## When Writing Tests

Tests MUST be written **before** implementation. See `TDD.md` for the full mandatory pipeline.

1. Use `bun:test` module (`describe`, `test`, `expect`, `beforeEach`, `afterEach`).
2. Test files live in `tests/` with `.test.ts` extension.
3. Import from `../src/index.ts` for public API tests.
4. Mock `globalThis.fetch` for client tests; restore in `afterEach`.
5. Type-level tests use `Expect<Equal<A, B>>` compile-time patterns.
6. Run with `bun test`. No vitest, no jest.
7. Cover all edge cases, invalid inputs, optional vs required fields, and adversarial scenarios.
8. Use strong, specific assertions -- exact value matching over loose checks.
9. Tests MUST be deterministic, self-contained, and implementation-independent.
10. After writing tests, submit for review (see `AGENTS.md` for the Test Reviewer role). Do NOT proceed to implementation until the reviewer explicitly approves.

## Role Awareness

Before starting any task, you MUST identify which role you are acting in per `AGENTS.md`:

1. **Test Author** -- writing or revising test suites (Phase 1 and Phase 3 of `TDD.md`). You MUST NOT write implementation code in this role.
2. **Test Reviewer** -- reviewing a test suite for completeness and quality (Phase 2 of `TDD.md`). You MUST act adversarially, find weaknesses, and issue an explicit APPROVED or REJECTED verdict.

When handling both roles in a single session, you MUST clearly declare role transitions and never blend authoring and reviewing in the same step.

## Build & Tooling

- Build: `bun run build` (Vite library mode)
- Dev: `bun run dev` (Vite watch mode)
- Test: `bun test`
- Install: `bun install`
- Runtime: Bun (not Node.js)

## Project File Map

| File                    | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `src/index.ts`          | Public barrel exports                                                   |
| `src/types/index.ts`    | All types, interfaces, mapped types                                     |
| `src/schema/index.ts`   | Schema barrel -- re-exports types from `types.ts` and validation functions from `validate.ts` |
| `src/schema/types.ts`   | Schema type definitions (`PrimitiveSchema`, `ObjectSchema`, `ArraySchema`, `SchemaToType`) |
| `src/schema/validate.ts`| Runtime schema validation: `validate`, `validateResponse`, `handleValidation` |
| `src/client/index.ts`   | `defineClient`, `unwrapOrThrow`, `unwrapOrDefault`, internal HTTP logic |
| `tests/validate.test.ts`| Schema validation tests                                                 |
| `tests/client.test.ts`  | Client and defineClient tests                                           |
| `tests/types.test.ts`   | Compile-time type assertions                                            |
| `agent.md`              | General AI agent guidelines                                             |
| `claude.md`             | This file -- Claude-specific instructions                               |
| `TDD.md`                | Mandatory TDD pipeline specification (4 phases)                         |
| `AGENTS.md`             | Agent role definitions (Test Author, Test Reviewer)                     |

## Stable internals

- Keep the `executeRequest` signature in `src/client/index.ts` stable: `(baseUrl, endpoint, clientHeaders, callOptions) => Promise<RuxResult<T>>`.
