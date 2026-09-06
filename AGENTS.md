# Rux -- Agent Role Definitions

All agents working on Rux MUST follow this TDD workflow for runtime or public API changes. Contribution and security guidance live in `CONTRIBUTION.md` and `SECURITY.md`.

Rux is a declarative, type-safe HTTP client for TypeScript/Bun. This file is the single source for agent instructions; `CLAUDE.md` links here.

## Hard constraints

- Do not invent features. Use approved tests, project docs, and explicit user requirements.
- Do not add runtime dependencies without explicit approval. Rux currently has none.
- Do not use `any` in public API types.
- Do not create classes; use factory functions and plain objects.
- Keep request body, query, response, and configured error payload validation in existing `validate` flow.

## Test Author

Purpose: define behavior before implementation.

- Write deterministic, self-contained Vitest tests for public behavior, types, errors, boundaries, and adversarial inputs.
- Use `describe`, `test`, `expect`, `beforeEach`, and `afterEach` from `vitest`.
- Use `expectTypeOf` for type assertions and run with `--typecheck`.
- Test through public APIs; do not assume private state, internal calls, or code paths.
- Use exact assertions (`toBe`, `toEqual`, `toStrictEqual`) where possible.
- Do not write implementation code or modify `src/` during test creation.
- Submit tests for Test Reviewer approval before implementation.

## Test Reviewer

Purpose: find gaps before implementation starts.

- Check every requirement, public API path, type transformation, error mode, edge case, and adversarial input.
- Reject weak assertions, implementation assumptions, skipped boundaries, and nondeterministic tests.
- Do not write implementation code or lower standards to accelerate delivery.
- Issue explicit `APPROVED` or `REJECTED` verdict.
- A `REJECTED` verdict MUST list actionable issues. Re-review revisions.

## Handoff protocol

```text
Test Author
  -> submits tests
Test Reviewer
  -> APPROVED: implementation may begin
  -> REJECTED: Test Author revises and resubmits
```

Rules:

1. Test Author MUST NOT start implementation before explicit `APPROVED`.
2. Test Author MUST address every rejection item before resubmitting.
3. After approval, implementation MUST NOT weaken or modify tests to fit code.
4. If approved behavior is wrong, return tests to revision and review.

## Documentation-only changes

Docs do not change runtime behavior, so no runtime test is required. Still review factual claims, links, command names, cross-references, security guidance, and line limits. Declare the active role when reviewing docs; keep authoring and review separate.

## Role use

When one session handles both roles, declare each transition and complete one phase before the next. With multiple sessions, assign roles separately.

## Evidence limits

Source code shows current mechanics. Tests show tested behavior. Neither establishes product intent, compatibility promises, supported runtimes, release policy, threat model, maintainer approval, or whether an observed behavior is a bug.

Agents MUST check docs, issue context, and explicit user requirements. If intent or security expectations remain unknown, ask a maintainer instead of inferring them from source code.

## Branch naming

Use `<type>/<area>-<short-description>` for work branches unless user explicitly requests another name. Allowed types: `feature`, `hotfix`, `fix`, `chore`, `docs`, and `release`. Use meaningful grouping such as `feature/client-timeout` or `docs/security-policy`; avoid generic names such as `feature/work`. GitHub enforces this through the `Branch name` status check.

## Commit authorship

Every agent-authored commit MUST include a valid `Co-authored-by: Name <email>` trailer. Use the agent identity supplied by the user or maintainer; if none is configured, ask before committing. Keep human author and agent co-author attribution accurate.

## Code conventions

- Read `src/types/index.ts` before changing the API.
- Use named exports and `.ts` import extensions.
- Reuse existing `RuxResult` internals, `validate`, error resolution, and request-layer patterns.
- `RuxClient` maps endpoint definitions to methods. `EndpointDefinition` and `EndpointFn` changes propagate through that mapping.
- `CallOptions` makes body support method-aware: `POST`, `PUT`, and `PATCH` support typed bodies; `GET` and `DELETE` do not.
- Keep `executeRequest` signature stable unless explicitly required: `(config, endpoint, options)`.

## API facts

- Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- Typed path segments use `:name[string]`, `:name[number]`, and `:name[boolean]`.
- Calls resolve to `Promise<RuxResult<Success, Failure>>`; expected failures are not thrown.
- `request`, `network`, `http`, and `validation` are distinct error variants.
- `error` schemas type non-2xx payloads; without one, HTTP error data is `unknown`.
- Authentication is not a client configuration feature. Callers may provide request headers themselves.

## Build and package checks

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
npm pack --dry-run
```

`tests/package.test.ts` checks the built package surface. Publishing requires `dist/index.d.ts`, referenced by package `types` and `exports`.

## File map

| File | Purpose |
| --- | --- |
| `src/index.ts` | Public barrel exports |
| `src/types/index.ts` | Public types and mapped client types |
| `src/schema/types.ts` | Standard Schema and schema utility types |
| `src/schema/validate.ts` | Standard Schema validation |
| `src/client/index.ts` | `createClient` and request execution |
| `tests/*.test.ts` | Runtime and type-level tests |
| `AGENTS.md` | Canonical agent instructions |
| `CLAUDE.md` | Symlink to `AGENTS.md` |
| `CONTRIBUTION.md` | Contributor workflow |
| `SECURITY.md` | Security reporting and responsibilities |

## References

- Contribution workflow: `CONTRIBUTION.md`
- Security policy: `SECURITY.md`
- Claude-specific instructions: `CLAUDE.md`
