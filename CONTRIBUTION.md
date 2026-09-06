# Contributing to Rux

Rux is a type-safe TypeScript HTTP client with zero runtime dependencies.

## Before you start

- Read `README.md`, `AGENTS.md`, and `CLAUDE.md`.
- Check existing issues and tests before proposing behavior changes.
- Keep changes focused. Do not add runtime dependencies without maintainer approval.
- Do not include secrets, private URLs, or real user data in issues, tests, or commits.

## Development setup

Rux uses Bun for development.

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
npm pack --dry-run
```

`bun run test` builds the package and runs Vitest with type checking. `tests/package.test.ts` checks the built package surface. `dist/index.d.ts` must exist before publishing.

## Change workflow

1. Describe intended behavior before coding.
2. For runtime or public API changes, write deterministic Vitest tests first.
3. Have Test Reviewer approve tests before implementation.
4. Implement the smallest change matching approved behavior.
5. Run typecheck, tests, build, and package smoke checks.
6. Update README or design docs when public behavior changes.

Tests are the behavior contract. Do not weaken or delete a test to fit an implementation. Use exact assertions and test invalid, boundary, and adversarial inputs.

Documentation-only changes do not need runtime tests, but must pass the review checklist below.

## Branch naming

Use `feature/<area>-<short-description>` for work branches. Choose meaningful grouping such as `docs`, `security`, `client`, or `schema`; avoid generic names such as `feature/work`.

## Commit authorship

Every agent-assisted commit MUST include a valid `Co-authored-by: Name <email>` trailer. Use identity supplied by the user or maintainer. If no agent identity is configured, confirm it before committing. Keep author and co-author attribution accurate.

## Project conventions

- Use named exports and `.ts` import extensions.
- Preserve factory functions and plain objects; do not add classes.
- Keep public types free of `any`.
- Validate request body, query, response, and configured error payloads through existing validation paths.
- Reuse installed dependencies and existing patterns.
- Keep `executeRequest` signature stable unless the change explicitly requires otherwise.

## What source code cannot tell you

Source code can show current mechanics. It cannot establish product intent, compatibility promises, supported runtimes, release policy, threat model, maintainer approval, or whether an observed behavior is a bug.

Do not infer those facts from an implementation, a passing test, or a type declaration. Check project docs and issue context. If still unknown, ask a maintainer and document the decision before changing behavior.

## Pull requests

Include:

- What changed and why.
- Tests and commands run.
- Public API or compatibility impact.
- Security or data-handling impact, if any.
- Any unresolved assumption or follow-up.
- Required `Co-authored-by:` trailer for agent-assisted commits.

Keep generated `dist` output out of commits unless maintainers request it. Use specific commit messages. Review your diff for accidental files and secrets before submitting.

## License

Contributions are accepted under the repository's [MIT License](LICENSE).
