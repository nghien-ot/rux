# Rux Error Handling Design

Status: approved design

## Goal

Give every request a stable Rux-owned error wrapper without forcing users to define an API error shape. Allow typed, validated API error payloads when users provide a Standard Schema validator.

## Public types

`RuxError` remains generic with `unknown` as its default payload type:

```ts
type RuxError<Failure = unknown> =
  | { type: "request"; message: string; cause?: unknown }
  | { type: "network"; message: string; cause: unknown }
  | { type: "validation"; message: string; issues: readonly StandardSchemaIssue[]; phase?: ValidationPhase; status?: number; cause?: unknown }
  | { type: "http"; status: number; message: string; data?: Failure };

type RuxResult<Success, Failure = unknown> =
  | { ok: true; value: Success }
  | { ok: false; error: RuxError<Failure> };
```

The `type` field discriminates variants. `RuxResult` remains the only call wrapper.

## Endpoint configuration

`error` is optional:

```ts
endpoint: {
  method: "GET",
  path: "/users/:id[string]",
  response: userSchema,
  error: apiErrorSchema,
}
```

When `error` exists, its Standard Schema output defines `Failure`. No separate error type declaration is needed. Without `error`, `Failure` is `unknown`.

## Error response flow

For any non-2xx response:

1. Always return `type: "http"` unless configured error validation fails.
2. Preserve HTTP `status` and `message`.
3. If no `error` schema exists, parse JSON when possible and return parsed value as `data: unknown`.
4. If parsing as JSON fails and no `error` schema exists, return raw response text as `data: string`.
5. If `error` exists, parse JSON and validate through Standard Schema. Return parsed output as typed `data`.
6. Invalid JSON or failed error-schema validation returns `type: "validation"`, with `phase: "error"` and response status metadata.

This means callers can consume unknown server errors without defining a schema, while schemas provide stronger guarantees when available.

## Non-HTTP failures

- `request`: invalid URL/path input, body serialization, timeout, or caller abort.
- `network`: fetch fails before an HTTP response.
- `validation`: body, query, response, or configured error payload fails validation.

Expected failures resolve through `RuxResult`; they are not thrown.

## Examples

No error contract required:

```ts
const result = await api.getUser({ params: { id: "42" } });

if (!result.ok && result.error.type === "http") {
  console.log(result.error.status, result.error.data); // unknown or string
}
```

Typed and validated error contract:

```ts
const apiError = z.object({ code: z.string(), detail: z.string().optional() });

const result = await api.getUser({ params: { id: "42" } });
if (!result.ok && result.error.type === "http") {
  result.error.data?.code; // string | undefined
}
```

## Test requirements

Add coverage for:

- HTTP JSON error without an error schema returns `data: unknown`.
- HTTP text error without an error schema returns raw `data: string`.
- Configured error schema returns parsed typed output.
- Invalid JSON with configured error schema returns validation failure.
- Error-schema issues retain `phase: "error"` and status metadata.
- `RuxError` narrows correctly by `type`.
- No type-only error override exists.
