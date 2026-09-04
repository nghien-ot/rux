# Cancellation Matrix Implementation Report

Status: complete

Commit: `ded6dd0`

## Changes

- `src/client/index.ts`
  - Added layered request-signal resolution across client, endpoint, and invocation request options.
  - Checked the effective signal before `mergeHeaders` so already-aborted requests return the request abort result without hitting header construction or fetch.
  - Preserved existing request option precedence and normal runtime behavior.
- `README.md`
  - Updated the HTTP error summary to distinguish no-schema `data` (`unknown`, parsed JSON or raw text fallback) from typed schema `data` when `error` is configured.

## Verification

- Focused client cancellation check:
  - `bunx vitest run tests/client.test.ts -t "pre-abort|already aborted" --typecheck`
  - Result: 2 test files passed, 12 tests passed, 93 skipped, 0 type errors.
- Full package test run:
  - `bun run test`
  - Result: build passed, then 10 test files passed, 155 tests passed, 0 type errors.
- Standalone typecheck:
  - `bun run typecheck`
  - Result: passed.
- Standalone build:
  - `bun run build`
  - Result: passed.
- Pack dry-run:
  - `npm pack --dry-run`
  - First run failed with local npm cache `EPERM` on `C:\Users\KN\AppData\Local\npm-cache\_cacache\tmp\ede8e6c3`.
  - Rerun with elevated permission passed and produced `nghien-ot-rux-0.1.4.tgz` dry-run output.
- Diff hygiene:
  - `git diff --check`
  - Result: no diff errors; only CRLF conversion warnings for the edited files.

## Concerns

- `npm pack --dry-run` depended on elevated permission because the local npm cache path returned `EPERM` in the default sandboxed run.
- Git reported LF-to-CRLF warnings on the edited files, but no content or whitespace errors.
