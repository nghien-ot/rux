# Rux

[![GitHub](https://img.shields.io/badge/GitHub-repository-181717?logo=github)](https://github.com/nghien-ot/rux)

> [!WARNING]
> **Development preview** — This library is still in active development. **Breaking changes are expected** until a stable **1.x** release. Pin dependency versions and check release notes before upgrading.

A declarative, type-safe HTTP client for TypeScript with zero runtime dependencies.

Define your API with `defineClient` and get typed endpoint methods, runtime validation for bodies and responses, and flexible error handling.

## Features

- **Zero runtime dependencies** — no third-party runtime packages; schemas are plain objects
- **Declarative schemas** — plain object literals; use `as const` where you want literal inference
- **Compile-time inference** — `SchemaToType` / `Infer` derive TypeScript types from schemas
- **Path params** — bracket DSL `:name[string]`, `:name[number]`, `:name[boolean]` for typed `params` and URL substitution
- **Runtime validation** — request body (when defined), `queryParams` (when defined), and every response body
- **Error modes** — per-client or per-call: `result`, `throw`, or `fallback` (with `defaultValue`)
- **Method-aware types** — `body` only on `POST`, `PUT`, `PATCH`
- **Auth** — bearer, basic, and custom header configuration
- **Standalone validation** — `validate`, `validateResponse`, `handleValidation` for non-HTTP use

## Installation

```bash
bun add @nghien-ot/rux
```

Or with npm/pnpm:

```bash
npm install @nghien-ot/rux
```

## Quick start

```typescript
import { defineClient } from "@nghien-ot/rux";

const userResponse = {
  type: "object",
  properties: {
    id: "string",
    name: "string",
    email: "string",
  },
} as const;

const api = defineClient({
  baseUrl: "https://api.example.com",
  errorMode: "result",
  endpoints: {
    getUser: {
      method: "GET",
      path: "/users/:id[string]",
      response: userResponse,
    },
    createUser: {
      method: "POST",
      path: "/users",
      response: userResponse,
      body: {
        type: "object",
        properties: { name: "string", email: "string" },
      },
    },
    deleteUser: {
      method: "DELETE",
      path: "/users/:id[string]",
      response: { type: "object", properties: { success: "boolean" } } as const,
    },
  },
});
```

Use **`:id[string]`** (or `[number]` / `[boolean]`) so `params` is typed and segments are substituted in the URL. A plain `:id` without brackets is **not** replaced at runtime.

## Schema format

| Schema                                    | TypeScript type                    |
| ----------------------------------------- | ---------------------------------- |
| `"string"`                                | `string`                           |
| `"number"`                                | `number`                           |
| `"boolean"`                               | `boolean`                          |
| `"unknown"`                               | `unknown`                          |
| `{ type: "object", properties: { ... } }` | Object with required/optional keys |
| `{ type: "array", items: ... }`           | `T[]`                              |

Optional object fields use `{ type: "string", optional: true }`. Nullable fields use `nullable: true`.

```typescript
import type { SchemaToType } from "@nghien-ot/rux";

type User = SchemaToType<typeof userResponse>;
```

## `Infer` usage (schema, client methods, and endpoint definitions)

`Infer` maps schemas to TypeScript types and can pick a single slice from a client endpoint function or an endpoint definition.

- **Schema:** `Infer<S>` is the same as `SchemaToType<S>`.
- **Client method:** `Infer<typeof api.getUser, K>` where `K` is one of `"response"`, `"path"`, `"params"`, `"query"`, or `"body"` (only for POST/PUT/PATCH). Omit the second argument to get the response type: `Infer<typeof api.getUser>`.
- **Endpoint definition:** same keys, e.g. `Infer<(typeof endpoints)["getUser"], "response">`.
- **Second argument:** pass exactly one key per call (not a union of keys). TypeScript will only accept keys that make sense for the endpoint (e.g. GET/DELETE do not allow `"body"`).

```typescript
import type { Infer } from "@nghien-ot/rux";

const userResponse = {
  type: "object",
  properties: { id: "string", name: "string" },
} as const;

type User = Infer<typeof userResponse>; // { id: string; name: string }

const endpoints = {
  getUser: {
    method: "GET",
    path: "/users/:id[string]",
    response: userResponse,
  },
} as const;

type GetUserResponse = Infer<(typeof endpoints)["getUser"], "response">;
type GetUserPath = Infer<(typeof endpoints)["getUser"], "path">;
type GetUserParams = Infer<(typeof endpoints)["getUser"], "params">;
```

After `defineClient`, use `typeof api.getUser` the same way:

```typescript
type Id = Infer<typeof api.getUser, "params">["id"];
```

## Usage

### Result mode (default)

Each call returns `RuxResult<T>`:

```typescript
const result = await api.getUser({ params: { id: "1" } });

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```

### Throw mode

Unwraps success or throws a **`RuxError` object** (not `instanceof Error`):

```typescript
const user = await api.getUser({
  params: { id: "1" },
  errorMode: "throw",
});
```

### Fallback mode

On failure, returns `defaultValue`:

```typescript
const user = await api.getUser({
  params: { id: "1" },
  errorMode: "fallback",
  defaultValue: { id: "", name: "Unknown", email: "" },
});
```

If the client uses `errorMode: "fallback"`, every call must supply `defaultValue` (or the promise rejects with a clear error).

### Client-level error mode

```typescript
const api = defineClient({
  baseUrl: "https://api.example.com",
  errorMode: "throw",
  endpoints: {
    /* ... */
  },
});

const user = await api.getUser({ params: { id: "1" } });
```

### Path parameters (bracket DSL)

Typed `params` are derived from `:name[string]`, `:name[number]`, or `:name[boolean]` in `path`. Example:

```typescript
path: "/users/:id[string]/posts/:postId[number]";
// params: { id: string; postId: number }
```

### Request body

Only on `POST`, `PUT`, `PATCH`. With a `body` schema, the payload is typed and validated before `fetch`.

### Query string

- **`query`**: `Record<string, string>` (and values that stringify for arrays — see below). Extra keys are allowed when `queryParams` is defined (they are still appended to the URL).
- **`queryParams`** on the endpoint: describe typed query arguments (`required`, `nullable`, `type: "array"` with `items`). Invalid query objects fail validation before the request is sent.

Non-array **object** values in `query` are skipped when serializing (no nested JSON in the query string).

### Auth configuration

```typescript
const api = defineClient({
  baseUrl: "https://api.example.com",
  auth: { type: "bearer", token: "my-jwt-token" },
  endpoints: { /* ... */ },
});

// Basic auth
auth: {
  type: "basic",
  credentials: { username: "admin", password: "secret" },
},

// Custom header
auth: {
  type: "custom",
  header: { name: "x-api-key", value: "my-key" },
},
```

Default header merge order: `content-type`, auth, client `headers`, endpoint `headers`, per-call `headers` (later wins).

### `unwrapOrThrow` / `unwrapOrDefault`

```typescript
import { unwrapOrThrow, unwrapOrDefault } from "@nghien-ot/rux";

const result = await api.getUser({ params: { id: "1" } });
const user = unwrapOrThrow(result);
const safe = unwrapOrDefault(result, { id: "", name: "?", email: "" });
```

### Standalone validation

```typescript
import { validate, validateResponse, handleValidation } from "@nghien-ot/rux";

const schema = {
  type: "object",
  properties: { name: "string", age: "number" },
} as const;

validate(schema, { name: "John", age: 30 }); // true

const checked = validateResponse<typeof schema>(schema, data);

// Modes for handleValidation use the string "default" (not "fallback"):
const asResult = handleValidation(schema, data, "result");
const value = handleValidation(schema, data, "throw");
const fallback = handleValidation(schema, data, "default", {
  name: "",
  age: 0,
});
```

**Naming note:** the HTTP client uses `errorMode: "fallback"` and `defaultValue`. **`handleValidation`** uses mode **`"default"`** and a fourth argument named **`fallback`**.

## Error types

```typescript
interface RuxError {
  type: "network" | "validation" | "http";
  status?: number;
  message: string;
  cause?: unknown;
}
```

| `type`       | When                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `network`    | `fetch` throws (e.g. DNS, timeout)                                    |
| `http`       | Response status is not 2xx                                            |
| `validation` | Body/query/response failed schema validation, or response is not JSON |

## API reference

### `defineClient(config)`

| Field       | Description                                                                             |
| ----------- | --------------------------------------------------------------------------------------- |
| `baseUrl`   | Base URL for all requests (`new URL(path, baseUrl)`). Must be valid for the URL parser. |
| `errorMode` | `"result"` (default), `"throw"`, or `"fallback"`                                        |
| `headers`   | Default headers for all endpoints                                                       |
| `auth`      | `AuthConfig` (bearer / basic / custom)                                                  |
| `endpoints` | Map of endpoint definitions                                                             |

### Endpoint definition

| Field         | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `method`      | `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE`                             |
| `path`        | Path starting with `/` or `""`; use `:name[string]` (etc.) for substitution |
| `response`    | Schema for the JSON response body                                           |
| `body`        | Optional request body schema (`POST` / `PUT` / `PATCH` only)                |
| `queryParams` | Optional typed query schema                                                 |
| `headers`     | Per-endpoint headers                                                        |

### Call options

| Field          | Description                                          |
| -------------- | ---------------------------------------------------- |
| `params`       | Path parameters (when the path uses the bracket DSL) |
| `query`        | Query string values                                  |
| `body`         | JSON body (body methods only)                        |
| `headers`      | Per-call headers                                     |
| `errorMode`    | Override client error mode                           |
| `defaultValue` | Required when using `errorMode: "fallback"`          |

## Caveats

- Path substitution only applies to `:name[type]` segments; plain `:id` is left as-is.
- `JSON.stringify` for `body` is not wrapped: circular data or `BigInt` can cause a rejected promise.
- For more edge cases and manual QA commands, see [`.qa/MANUAL_QA.md`](.qa/MANUAL_QA.md).

## Development (contributors)

```bash
bun install
bun run build      # emit dist/
bun run test       # tests/ + ./.qa/live-api.test.ts (live tests skip unless RUN_LIVE_API=1)
bun run qa:manual  # build + manual QA against `import "@nghien-ot/rux"` (see .qa/test.ts)
```

Optional live smoke tests (network): set `RUN_LIVE_API=1` and run `bun test ./.qa/live-api.test.ts` (documented in `MANUAL_QA.md`).

## License

MIT
