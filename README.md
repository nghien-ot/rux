# Rux

A type-safe HTTP client for TypeScript. Rux validates through the [Standard Schema v1](https://standardschema.dev/) protocol and has no runtime dependencies.

## Install

```bash
bun add @nghien-ot/rux
# or: npm install @nghien-ot/rux
```

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

## Layered request options

Request options merge at three levels: client, endpoint, then invocation. Scalar invocation values win. Headers merge case-insensitively in the same order; later values replace earlier values. HTTP method is defined by the endpoint only.

```ts
const api = createClient({
  baseUrl: "https://api.example.com",
  request: { credentials: "include", headers: { "x-source": "client" } },
  endpoints: {
    updateUser: {
      method: "PATCH",
      path: "/users/:id[string]",
      request: { headers: { "x-source": "endpoint" } },
      body: z.object({ name: z.string().trim() }),
      response: user,
    },
  },
});

await api.updateUser({
  params: { id: "42" },
  body: { name: "  Ada  " },
  request: { headers: { "X-Source": "call" } },
  timeoutMs: 1_000,
});
```

Body and query schemas validate before `fetch` and serialize their parsed output. A response or error schema validates parsed JSON before it reaches `RuxResult`. A successful empty response without a response schema returns `undefined`.

## Errors

Every endpoint returns `Promise<RuxResult<Success, Failure>>`. Failure values have a typed `RuxError` with one of these variants:

| Type | Meaning |
| --- | --- |
| `request` | Invalid URL, path input, serialization, timeout, or caller abort |
| `network` | Fetch failed before an HTTP response |
| `http` | Non-2xx response; typed `data` is present when the endpoint has `error` |
| `validation` | Body, query, response, or typed error payload failed validation |

## Migration to v1

- Replace `defineClient` with `createClient`.
- Replace Rux plain-object schemas with Standard Schema v1 schemas. Zod is supported directly.
- Remove `errorMode`, `defaultValue`, and unwrap helpers. Handle the returned `RuxResult` at every call site.
- Move client, endpoint, and call transport settings into `request`; set credentials or authorization headers there. Rux has no auth-specific configuration.
- Replace endpoint `headers` with `request.headers`; replace `queryParams` with an endpoint `query` schema and pass values through call `query`.

No compatibility aliases are provided for removed APIs.

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun run qa:manual
npm pack --dry-run
```

`qa:manual` rebuilds and smoke-tests the published package surface. See [`.qa/MANUAL_QA.md`](.qa/MANUAL_QA.md) for release checks.

## License

[MIT](LICENSE)
