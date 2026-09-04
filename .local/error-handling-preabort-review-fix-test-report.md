# Pre-abort cleanup regression test report

## Status

RED confirmed.

## Regression added

`tests/client.test.ts` now covers an already-aborted public client call with layered request headers. The endpoint layer contains an invalid header value while client and invocation layers contain valid headers. The test asserts the exact request error message and abort cause, and verifies the configured fetch implementation is not called.

## Verification

Command:

```text
npx vitest run tests/client.test.ts --typecheck
```

Result:

- Exit code: `1`
- Test files: `1 failed`
- Tests: `1 failed`, `90 passed`
- Type errors: `0`

Observed regression failure:

```text
Expected: { ok: false, error: { type: "request", message: "cancelled before invalid headers", cause: abortReason } }
Received: { ok: false, error: { type: "request", message: "Request failed", cause: TypeError("Headers.append: \"invalid\nvalue\" is an invalid header value.") } }
```

This confirms the current source constructs layered headers before honoring an already-aborted caller signal.
