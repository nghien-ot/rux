# Rux

[![npm package](https://img.shields.io/npm/v/%40nghien-ot%2Frux?logo=npm&label=npm)](https://www.npmjs.com/package/@nghien-ot/rux)
[![GitHub repository](https://img.shields.io/badge/GitHub-rux-181717?logo=github)](https://github.com/nghien-ot/rux)
[![Buy Me a Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/mcpepperoni)

A type-safe HTTP client for TypeScript. Rux validates through the [Standard Schema v1](https://standardschema.dev/) protocol and has no runtime dependencies.

## Install

```bash
bun add @nghien-ot/rux
# or: npm install @nghien-ot/rux
```

Rux ships its TypeScript declarations at `dist/index.d.ts`. TypeScript 7 is used for Rux development, but Rux has no TypeScript peer dependency for consumers.

## `createClient`

Define endpoints with a method, a path, and optional Standard Schema validators. Calls always resolve to `RuxResult`; inspect `ok` before reading `value`.

```ts
import { createClient } from "@nghien-ot/rux";
import { z } from "zod";

const user = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().transform((value) => new Date(value)),
});

const api = createClient({
  baseUrl: "https://api.example.com",
  request: { headers: { "x-client": "web" } },
  timeoutMs: 5_000,
  endpoints: {
    getUser: {
      method: "GET",
      path: "/users/:id[string]",
      response: user,
    },
  },
});

const result = await api.getUser({ params: { id: "42" } });
if (result.ok) {
  result.value.createdAt; // Date: parsed Zod transform output
} else {
  console.error(result.error.type, result.error.message);
}
```

Zod implements Standard Schema v1, so pass a Zod schema directly. Rux does not import or bundle Zod; install Zod only when your application uses it. Any structurally compatible Standard Schema v1 implementation works.

`InferInput<S>` is the input accepted by a schema, `InferOutput<S>` is its parsed output, and `Infer<S>` aliases `InferOutput<S>`.

## Usage guide

### Define schemas

Rux accepts any validator implementing [Standard Schema v1](https://standardschema.dev/). Zod is optional application code, not a Rux dependency:

```bash
npm install @nghien-ot/rux zod
```

```ts
import { z } from "zod";

const userInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const userResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

const apiError = z.object({
  code: z.string(),
  detail: z.string().optional(),
});
```

Zod transforms are applied before Rux returns a value or serializes a request. `InferInput<typeof userInput>` and `InferOutput<typeof userInput>` expose the input/output types when needed.

### Configure endpoints

`createClient` requires one absolute `baseUrl` and an `endpoints` map. Endpoint names become client methods.

```ts
const api = createClient({
  baseUrl: "https://api.example.com/v1",
  endpoints: {
    getUser: {
      method: "GET",
      path: "/users/:id[string]",
      response: userResponse,
      error: apiError,
    },
    createUser: {
      method: "POST",
      path: "/users",
      body: userInput,
      response: userResponse,
      error: apiError,
    },
  },
});
```

Endpoint fields:

| Field | Purpose |
| --- | --- |
| `method` | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. Method belongs to the endpoint. |
| `path` | Relative path beginning with `/`. Typed parameters use `:name[string]`, `:name[number]`, or `:name[boolean]`. |
| `request` | Endpoint-level `RequestInit` options, excluding `method` and `body`. |
| `timeoutMs` | Endpoint timeout override. |
| `query` | Standard Schema for query input. |
| `body` | Standard Schema for `POST`, `PUT`, or `PATCH` body input. |
| `response` | Standard Schema for successful JSON output. |
| `error` | Standard Schema for non-2xx JSON error output. |

### Call endpoints

Path parameters, query input, body input, request overrides, and timeout are supplied at invocation:

```ts
const result = await api.createUser({
  body: { name: "Ada", email: "ada@example.com" },
  request: { headers: { "x-request-id": "request-123" } },
  timeoutMs: 3_000,
});

if (result.ok) {
  console.log(result.value.id);
}
```

Typed path parameters are encoded with `encodeURIComponent`:

```ts
await api.getUser({ params: { id: "user/42" } });
// Requests /users/user%2F42
```

Query values support strings, numbers, booleans, `null`, `undefined`, and arrays. `undefined` is omitted, `null` becomes an empty query value, and arrays produce repeated query parameters. A query schema receives input before serialization, so schema transforms can normalize it.

Body schemas receive call input before serialization. Rux serializes their parsed output as JSON and adds `content-type: application/json` when no content type was supplied. `GET` and `DELETE` endpoints do not expose a typed `body` option.

### Layer request options

Transport options resolve from client to endpoint to invocation. Later values override earlier scalar values:

```ts
const api = createClient({
  baseUrl: "https://api.example.com",
  request: {
    credentials: "include",
    headers: { "x-source": "client", "x-shared": "client" },
  },
  timeoutMs: 10_000,
  endpoints: {
    updateUser: {
      method: "PATCH",
      path: "/users/:id[string]",
      request: {
        cache: "no-store",
        headers: { "X-Source": "endpoint", "x-endpoint": "true" },
      },
      body: userInput,
      response: userResponse,
    },
  },
});

await api.updateUser({
  params: { id: "42" },
  body: { name: "Ada", email: "ada@example.com" },
  request: {
    headers: { "X-SOURCE": "call", "x-shared": "call" },
  },
  timeoutMs: 2_000,
});
```

The final request has `x-source: call`, `x-shared: call`, `x-endpoint: true`, `credentials: "include"`, and `cache: "no-store"`. Header names merge case-insensitively. `baseUrl` and injected `fetch` are client-only; endpoint method, path parameters, query, and body are endpoint/call concerns.

### Handle results and typed errors

Calls never throw for expected request failures. Every call resolves to `RuxResult<Success, Failure>`:

```ts
const result = await api.getUser({ params: { id: "42" } });

if (result.ok) {
  // result.value: InferOutput<typeof userResponse>
  console.log(result.value.name);
} else {
  switch (result.error.type) {
    case "http":
      console.error(result.error.status, result.error.data);
      break;
    case "validation":
      console.error(result.error.phase, result.error.issues);
      break;
    case "network":
      console.error(result.error.message, result.error.cause);
      break;
    case "request":
      console.error(result.error.message, result.error.cause);
      break;
  }
}
```

Error variants:

- `request`: invalid URL, invalid path parameters, body serialization, timeout, or caller abort.
- `network`: fetch failed before receiving an HTTP response.
- `http`: non-2xx response. `status` is always present. Without `error`, Rux parses JSON into `data: unknown`, falling back to raw response text when it is not JSON. With `error`, `data` is the validated parsed output of the configured schema.
- `validation`: body, query, response, or error payload failed validation. `phase` identifies the boundary and `issues` contains Standard Schema issues.

Response JSON is validated after parsing, so response transforms return parsed output. Empty successful responses return `undefined` when no response schema is configured. A non-empty successful response requires `response`; otherwise Rux returns a validation error. Invalid JSON returns a validation error.

### Timeout, abort, and testing

Use `timeoutMs` for automatic cancellation. Pass an `AbortSignal` through any `request` layer for caller-controlled cancellation; Rux combines it with its timeout signal:

```ts
const controller = new AbortController();

const pending = api.getUser({
  params: { id: "42" },
  request: { signal: controller.signal },
});

controller.abort();
const result = await pending;
// result.ok === false && result.error.type === "request"
```

Inject `fetch` through client configuration for deterministic tests or custom runtimes:

```ts
const api = createClient({
  baseUrl: "https://api.example.com",
  fetch: async (input, init) => {
    // test double, fetch wrapper, or runtime-specific implementation
    return fetch(input, init);
  },
  endpoints: {
    health: { method: "GET", path: "/health" },
  },
});
```

## Errors

Every endpoint returns `Promise<RuxResult<Success, Failure>>`. Failure values have a typed `RuxError` with one of these variants:

| Type | Meaning |
| --- | --- |
| `request` | Invalid URL, path input, serialization, timeout, or caller abort |
| `network` | Fetch failed before an HTTP response |
| `http` | Non-2xx response. Without `error`, `data` is parsed JSON when possible or raw text when not JSON. With `error`, `data` is the typed schema output. |
| `validation` | Body, query, response, or typed error payload failed validation |

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
npm pack --dry-run
```

`tests/package.test.ts` smoke-tests the published package surface after `bun run build`.

The build must produce `dist/index.d.ts` before publishing. This file is referenced by the package `types` and `exports` fields.

## License

[MIT](LICENSE)
