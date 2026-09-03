import { expectTypeOf, test } from "vitest";
import type {
  ClientConfig,
  EndpointDefinition,
  Infer,
  InferInput,
  InferOutput,
  RuxError,
  RuxResult,
  StandardSchemaV1,
} from "../src/index.ts";
import { createClient } from "../src/index.ts";

type Issue = { readonly message: string; readonly path?: readonly PropertyKey[] };
type TestSchema<Input, Output = Input> = StandardSchemaV1<Input, Output>;

const transformedBody = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: unknown) => ({ value: { id: (value as { name: string }).name.length } }),
  },
} satisfies TestSchema<{ name: string }, { id: number }>;

const querySchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: unknown) => ({ value: value as { page: number } }),
  },
} satisfies TestSchema<{ page: string }, { page: number }>;

const responseSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: unknown) => ({ value: value as { id: number } }),
  },
} satisfies TestSchema<unknown, { id: number }>;

const errorSchema = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: unknown) => ({ value: value as { code: string } }),
  },
} satisfies TestSchema<unknown, { code: string }>;

const endpoints = {
  getUser: {
    method: "GET",
    path: "/users/:id[string]",
    query: querySchema,
    response: responseSchema,
    error: errorSchema,
  },
  createUser: {
    method: "POST",
    path: "/users/:id[number]",
    body: transformedBody,
    response: responseSchema,
    error: errorSchema,
  },
} as const satisfies Record<string, EndpointDefinition>;

const api = createClient({
  baseUrl: "https://api.test",
  endpoints,
});

test("StandardSchemaV1 exposes version, vendor, and sync/async validation", () => {
  type Standard = TestSchema<unknown, string>["~standard"];
  expectTypeOf<Standard["version"]>().toEqualTypeOf<1>();
  expectTypeOf<Standard["vendor"]>().toEqualTypeOf<string>();
  expectTypeOf<ReturnType<Standard["validate"]>>().toMatchTypeOf<
    { value: string } | { issues: readonly Issue[] } | Promise<{ value: string } | { issues: readonly Issue[] }>
  >();
});

test("InferOutput is parsed output, InferInput is accepted input, and Infer equals output", () => {
  expectTypeOf<InferInput<typeof transformedBody>>().toEqualTypeOf<{ name: string }>();
  expectTypeOf<InferOutput<typeof transformedBody>>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Infer<typeof transformedBody>>().toEqualTypeOf<InferOutput<typeof transformedBody>>();
});

test("client endpoint result is typed with success and HTTP failure payload", () => {
  type Result = Awaited<ReturnType<typeof api.getUser>>;
  expectTypeOf<Result>().toEqualTypeOf<RuxResult<{ id: number }, { code: string }>>();
  expectTypeOf<ReturnType<typeof api.getUser>>().toEqualTypeOf<Promise<RuxResult<{ id: number }, { code: string }>>>();
  expectTypeOf<Extract<Result, { ok: true }>["value"]>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Extract<Result, { ok: false }>["error"]>().toEqualTypeOf<RuxError<{ code: string }>>();
});

test("endpoint invocation types path params and typed query fields", () => {
  type Options = NonNullable<Parameters<typeof api.getUser>[0]>;
  expectTypeOf<"params" extends keyof Options ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<"query" extends keyof Options ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<Options["params"]>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<Options["query"]>().toMatchTypeOf<{ page: string }>();
  expectTypeOf<Options["query"]>().toMatchTypeOf<Record<string, string | number | boolean | readonly (string | number | boolean)[] | undefined>>();
});

test("POST invocation exposes parsed body input and typed numeric path params", () => {
  type Options = NonNullable<Parameters<typeof api.createUser>[0]>;
  expectTypeOf<"params" extends keyof Options ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<"body" extends keyof Options ? true : false>().toEqualTypeOf<true>();
  expectTypeOf<Options["params"]>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Options["body"]>().toEqualTypeOf<{ name: string }>();
  expectTypeOf<ReturnType<typeof api.createUser>>().toEqualTypeOf<Promise<RuxResult<{ id: number }, { code: string }>>>();
  expectTypeOf<Infer<typeof api.createUser, "response">>().toEqualTypeOf<{ id: number }>();
  expectTypeOf<Infer<typeof api.createUser, "body">>().toEqualTypeOf<{ name: string }>();
});

test("required path, query, and body inputs cannot be omitted", () => {
  if (false) {
    // @ts-expect-error required path params must be present
    api.getUser({ query: { page: "1" } });
    // @ts-expect-error required query must be present
    api.getUser({ params: { id: "user-1" } });
    // @ts-expect-error required body must be present
    api.createUser({ params: { id: 1 } });
  }
});

test("an endpoint without a response schema returns undefined on success", () => {
  const noResponse = createClient({
    baseUrl: "https://api.test",
    endpoints: { ping: { method: "GET", path: "/ping" } },
  });
  expectTypeOf<ReturnType<typeof noResponse.ping>>().toEqualTypeOf<Promise<RuxResult<undefined, unknown>>>();
});

test("endpoint method is not an invocation option and GET has no body", () => {
  if (false) {
    // @ts-expect-error method belongs to the endpoint definition
    api.getUser({ method: "POST" });
    // @ts-expect-error GET endpoints do not accept a body
    api.getUser({ body: { id: 1 } });
    // @ts-expect-error v1 endpoints always return RuxResult; error modes are removed
    api.getUser({ errorMode: "throw" });
  }
});

test("bracket path params map string, number, and boolean segments", () => {
  const typed = createClient({
    baseUrl: "https://api.test",
    endpoints: {
      route: {
        method: "GET",
        path: "/:text[string]/:count[number]/:enabled[boolean]",
        response: responseSchema,
      },
    },
  });
  type Params = NonNullable<Parameters<typeof typed.route>[0]>["params"];
  expectTypeOf<Params>().toEqualTypeOf<{ text: string; count: number; enabled: boolean }>();
  if (false) {
    // @ts-expect-error numeric segment rejects strings
    typed.route({ params: { text: "x", count: "1", enabled: true } });
    // @ts-expect-error boolean segment rejects numbers
    typed.route({ params: { text: "x", count: 1, enabled: 1 } });
  }
});

test("request options omit method and body while retaining RequestInit fields", () => {
  expectTypeOf<ClientConfig["request"]>().toMatchTypeOf<{
    headers?: RequestInit["headers"];
    credentials?: RequestInit["credentials"];
    signal?: RequestInit["signal"];
  } | undefined>();
  if (false) {
    // @ts-expect-error request method is endpoint-only
    const request: ClientConfig["request"] = { method: "POST" };
    // @ts-expect-error request body is supplied through typed invocation body
    const requestWithBody: ClientConfig["request"] = { body: "raw" };
    void request;
    void requestWithBody;
  }
});

test("v1 client configuration has no auth-specific option", () => {
  if (false) {
    // @ts-expect-error v1 request configuration has no auth option
    createClient({ baseUrl: "https://api.test", auth: { type: "bearer", token: "secret" }, endpoints: {} });
  }
});
