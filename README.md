# Rux

A declarative, type-safe HTTP client for TypeScript with zero runtime dependencies.

Define your entire API surface in one place with `defineClient` and get fully typed endpoint methods with compile-time type inference, runtime validation, and flexible error handling.

## Features

- **Zero dependencies** -- no Zod, no neverthrow, no external runtime libraries
- **Declarative schemas** -- plain object literals with `as const` for full type inference
- **Compile-time safety** -- `SchemaToType` infers TypeScript types directly from schemas
- **Path param inference** -- `:param` segments in paths become required, typed `params` keys
- **Runtime validation** -- every request body and response validated against schemas
- **Flexible error handling** -- `result`, `throw`, or `default` mode per-client or per-call
- **Method-aware types** -- `body` only available on POST/PUT/PATCH at the type level
- **Auth support** -- bearer, basic, and custom auth out of the box

## Installation

```bash
bun add rux
```

Or with npm/pnpm:

```bash
npm install rux
```

## Quick Start

```typescript
import { defineClient } from "rux";

const userSchema = {
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
      path: "/users/:id",
      schema: userSchema,
    },
    createUser: {
      method: "POST",
      path: "/users",
      schema: userSchema,
      bodySchema: {
        type: "object",
        properties: { name: "string", email: "string" },
      } as const,
    },
    deleteUser: {
      method: "DELETE",
      path: "/users/:id",
      schema: { type: "object", properties: { success: "boolean" } } as const,
    },
  },
});
```

## Schema Format

Schemas are plain object literals declared with `as const`. Supported types:

| Schema | TypeScript type |
|--------|----------------|
| `"string"` | `string` |
| `"number"` | `number` |
| `"boolean"` | `boolean` |
| `"unknown"` | `unknown` |
| `{ type: "object", properties: { ... } }` | `{ [key]: ... }` |
| `{ type: "array", items: ... }` | `T[]` |

Schemas compose recursively:

```typescript
const orderSchema = {
  type: "object",
  properties: {
    id: "string",
    total: "number",
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product: "string",
          quantity: "number",
        },
      },
    },
  },
} as const;
// Inferred type: { id: string; total: number; items: { product: string; quantity: number }[] }
```

Use `SchemaToType` to extract the type from any schema:

```typescript
import type { SchemaToType } from "rux";

type Order = SchemaToType<typeof orderSchema>;
// { id: string; total: number; items: { product: string; quantity: number }[] }
```

## Usage

### Result mode (default)

Every call returns `RuxResult<T>`, so you explicitly handle success and failure:

```typescript
const result = await api.getUser({ params: { id: "1" } });

if (result.ok) {
  console.log(result.value); // { id: "...", name: "...", email: "..." }
} else {
  console.error(result.error); // RuxError
}
```

### Throw mode

Unwraps the result and throws `RuxError` on failure:

```typescript
const user = await api.getUser({
  params: { id: "1" },
  errorMode: "throw",
});
// `user` is typed as { id: string; name: string; email: string }
```

### Default mode

Returns a fallback value on failure instead of throwing:

```typescript
const user = await api.getUser({
  params: { id: "1" },
  errorMode: "default",
  defaultValue: { id: "", name: "Unknown", email: "" },
});
// `user` is always { id: string; name: string; email: string }
```

### Client-level error mode

Set the default for all endpoints at client creation:

```typescript
const api = defineClient({
  baseUrl: "https://api.example.com",
  errorMode: "throw",
  endpoints: { /* ... */ },
});

const user = await api.getUser({ params: { id: "1" } });
// Returns T directly, throws on error
```

### Type-safe path params

Path parameters are extracted from the path string at compile time. The `params` field is required when parameters exist and each key is type-checked:

```typescript
// path: "/users/:id" → params: { id: string } is required
await api.getUser({ params: { id: "1" } });

// Compile errors:
await api.getUser({});                          // missing 'params'
await api.getUser({ params: { uid: "1" } });    // 'uid' doesn't exist, expected 'id'
```

When the path has no parameters, `params` is not available:

```typescript
// path: "/users" → no params field
await api.listUsers();
```

### Type-safe body handling

`body` is only available on endpoints defined with POST, PUT, or PATCH. When `bodySchema` is provided, the body is fully typed:

```typescript
// bodySchema infers: { name: string; email: string }
await api.createUser({ body: { name: "John", email: "john@test.com" } });

// Compile-time error — getUser is GET, no body allowed:
await api.getUser({ body: {} });
```

Request bodies are validated at runtime against `bodySchema` before the request is sent.

### Auth configuration

```typescript
// Bearer token
const api = defineClient({
  baseUrl: "https://api.example.com",
  auth: { type: "bearer", token: "my-jwt-token" },
  endpoints: { /* ... */ },
});

// Basic auth
const api = defineClient({
  baseUrl: "https://api.example.com",
  auth: {
    type: "basic",
    credentials: { username: "admin", password: "secret" },
  },
  endpoints: { /* ... */ },
});

// Custom header
const api = defineClient({
  baseUrl: "https://api.example.com",
  auth: {
    type: "custom",
    header: { name: "x-api-key", value: "my-key" },
  },
  endpoints: { /* ... */ },
});
```

### Standalone helpers

For working with `RuxResult` values outside of a client:

```typescript
import { unwrapOrThrow, unwrapOrDefault } from "rux";

const result = await api.getUser({ params: { id: "1" } });

const user = unwrapOrThrow(result);
const safeUser = unwrapOrDefault(result, { id: "", name: "?", email: "" });
```

### Standalone validation

Use `validate` and `handleValidation` independently of the HTTP client:

```typescript
import { validate, handleValidation } from "rux";

const schema = {
  type: "object",
  properties: { name: "string", age: "number" },
} as const;

validate(schema, { name: "John", age: 30 }); // true
validate(schema, { name: "John" });           // false (missing 'age')

// Mode-aware validation
const result = handleValidation(schema, data, "result");   // RuxResult
const value  = handleValidation(schema, data, "throw");    // T or throws
const safe   = handleValidation(schema, data, "default", fallback); // T
```

## Error Types

All errors are represented as `RuxError`:

```typescript
interface RuxError {
  type: "network" | "validation" | "http";
  status?: number;  // present for http errors
  message: string;
  cause?: unknown;  // original Error
}
```

| Type | When |
|------|------|
| `network` | `fetch` itself fails (DNS, timeout, connection refused) |
| `http` | Server responds with a non-2xx status code |
| `validation` | Request body or response fails schema validation |

## API Reference

### `defineClient(config)`

Creates a typed client instance.

| Config field | Type | Default | Description |
|-------------|------|---------|-------------|
| `baseUrl` | `string` | -- | Base URL for all endpoints |
| `errorMode` | `'result' \| 'throw' \| 'default'` | `'result'` | Default error handling mode |
| `headers` | `Record<string, string>` | `{}` | Default headers for all requests |
| `auth` | `AuthConfig` | -- | Auth configuration (bearer/basic/custom) |
| `endpoints` | `Record<string, EndpointDef>` | -- | Map of endpoint definitions |

### Endpoint definition

| Field | Type | Description |
|-------|------|-------------|
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'PATCH' \| 'DELETE'` | HTTP method |
| `path` | `string` | URL path, supports `:param` placeholders (must start with `/`) |
| `schema` | `Schema` | Response schema for validation and type inference |
| `bodySchema` | `Schema` | Request body schema (optional, POST/PUT/PATCH only) |
| `headers` | `Record<string, string>` | Per-endpoint headers |

### Call options

| Field | Type | Availability | Description |
|-------|------|-------------|-------------|
| `params` | `Record<string, string>` | When path has `:param` segments | Path parameter substitution (required, type-checked) |
| `query` | `Record<string, string>` | All methods | Query string parameters |
| `body` | `SchemaToType<bodySchema>` | POST, PUT, PATCH only | Request body (typed when bodySchema defined) |
| `headers` | `Record<string, string>` | All methods | Per-call header overrides |
| `errorMode` | `ErrorMode` | All methods | Override client error mode |
| `defaultValue` | `T` | With `errorMode: 'default'` | Fallback value |

## License

MIT
