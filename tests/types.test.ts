import { test } from "bun:test";
import type {
  SchemaToType,
  ExtractPathParams,
  ValidPath,
  ModeReturn,
  RuxResult,
  Schema,
  Infer,
  QueryParamsToType,
} from "../src/index.ts";
import type {
  CallOptions,
  EndpointFn,
  EndpointDef,
  InferKeysFor,
  InferEndpointResponse,
} from "../src/types/index.ts";

// ---------------------------------------------------------------------------
// Compile-time assertion utilities
// ---------------------------------------------------------------------------

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// 7.1 SchemaToType
// ---------------------------------------------------------------------------

test("T-ST-01: SchemaToType<'string'> = string", () => {
  type _T = Expect<Equal<SchemaToType<"string">, string>>;
});

test("T-ST-02: SchemaToType<'number'> = number", () => {
  type _T = Expect<Equal<SchemaToType<"number">, number>>;
});

test("T-ST-03: SchemaToType<'boolean'> = boolean", () => {
  type _T = Expect<Equal<SchemaToType<"boolean">, boolean>>;
});

test("T-ST-04: SchemaToType<'unknown'> = unknown", () => {
  type _T = Expect<Equal<SchemaToType<"unknown">, unknown>>;
});

test("T-ST-05: Object schema -> mapped type with required/optional keys", () => {
  type S = {
    readonly type: "object";
    readonly properties: {
      readonly name: "string";
      readonly bio: { readonly type: "string"; readonly optional: true };
    };
  };
  type Result = SchemaToType<S>;
  type _T1 = Expect<Equal<Result["name"], string>>;
  type HasOptionalBio = undefined extends Result["bio"] ? true : false;
  type _T2 = Expect<Equal<HasOptionalBio, true>>;
});

test("T-ST-06: Array schema -> T[]", () => {
  type S = { readonly type: "array"; readonly items: "number" };
  type _T = Expect<Equal<SchemaToType<S>, number[]>>;
});

test("T-ST-07: Nullable -> T | null", () => {
  type S = { readonly type: "string"; readonly nullable: true };
  type _T = Expect<Equal<SchemaToType<S>, string | null>>;
});

test("T-ST-08: PrimitiveObjectSchema without nullable -> no null", () => {
  type S = { readonly type: "number" };
  type _T = Expect<Equal<SchemaToType<S>, number>>;
});

test("T-ST-09: Nested objects", () => {
  type S = {
    readonly type: "object";
    readonly properties: {
      readonly user: {
        readonly type: "object";
        readonly properties: {
          readonly name: "string";
          readonly age: "number";
        };
      };
    };
  };
  type Result = SchemaToType<S>;
  type _T1 = Expect<Equal<Result["user"]["name"], string>>;
  type _T2 = Expect<Equal<Result["user"]["age"], number>>;
});

test("T-ST-10: Array of objects", () => {
  type S = {
    readonly type: "array";
    readonly items: {
      readonly type: "object";
      readonly properties: {
        readonly id: "number";
      };
    };
  };
  type Result = SchemaToType<S>;
  type _T = Expect<Equal<Result, { id: number }[]>>;
});

// ---------------------------------------------------------------------------
// 7.2 ExtractPathParams
// ---------------------------------------------------------------------------

test("T-EP-01: single bracket param", () => {
  type _T = Expect<Equal<ExtractPathParams<"/users/:id[string]">, "id">>;
});

test("T-EP-02: multiple bracket params", () => {
  type _T = Expect<
    Equal<
      ExtractPathParams<"/users/:id[string]/posts/:postId[number]">,
      "id" | "postId"
    >
  >;
});

test("T-EP-03: no params", () => {
  type _T = Expect<Equal<ExtractPathParams<"/users">, never>>;
});

test("T-EP-04: empty string", () => {
  type _T = Expect<Equal<ExtractPathParams<"">, never>>;
});

// ---------------------------------------------------------------------------
// 7.3 ValidPath
// ---------------------------------------------------------------------------

test("T-VP-01: '/foo' extends ValidPath", () => {
  type _T = Expect<Equal<"/foo" extends ValidPath ? true : false, true>>;
});

test("T-VP-02: '' extends ValidPath", () => {
  type _T = Expect<Equal<"" extends ValidPath ? true : false, true>>;
});

test("T-VP-03: 'foo' does not extend ValidPath", () => {
  type _T = Expect<Equal<"foo" extends ValidPath ? true : false, false>>;
});

// ---------------------------------------------------------------------------
// 7.4 ModeReturn
// ---------------------------------------------------------------------------

test("T-MR-01: ModeReturn<string, 'result'> = RuxResult<string>", () => {
  type _T = Expect<Equal<ModeReturn<string, "result">, RuxResult<string>>>;
});

test("T-MR-02: ModeReturn<string, 'throw'> = string", () => {
  type _T = Expect<Equal<ModeReturn<string, "throw">, string>>;
});

test("T-MR-03: ModeReturn<string, 'fallback'> = string", () => {
  type _T = Expect<Equal<ModeReturn<string, "fallback">, string>>;
});

// ---------------------------------------------------------------------------
// 7.5 CallOptions conditional fields
// ---------------------------------------------------------------------------

test("T-CO-01: GET with bracket params path requires params field", () => {
  type Opts = CallOptions<string, "GET", "/users/:id[string]">;
  type HasParams = "params" extends keyof Opts ? true : false;
  type _T = Expect<Equal<HasParams, true>>;
});

test("T-CO-02: GET without params path has no params field", () => {
  type Opts = CallOptions<string, "GET", "/users">;
  type HasParams = "params" extends keyof Opts ? true : false;
  type _T = Expect<Equal<HasParams, false>>;
});

test("T-CO-03: POST with body schema requires body field", () => {
  type BodySchema = { readonly type: "object"; readonly properties: { readonly name: "string" } };
  type Opts = CallOptions<string, "POST", "/users", BodySchema>;
  type HasBody = "body" extends keyof Opts ? true : false;
  type _T = Expect<Equal<HasBody, true>>;
});

test("T-CO-04: POST without body schema has optional body as unknown", () => {
  type Opts = CallOptions<string, "POST", "/users", undefined>;
  type HasBody = "body" extends keyof Opts ? true : false;
  type _T = Expect<Equal<HasBody, true>>;
});

test("T-CO-05: GET endpoint has no body field", () => {
  type Opts = CallOptions<string, "GET", "/users">;
  type HasBody = "body" extends keyof Opts ? true : false;
  type _T = Expect<Equal<HasBody, false>>;
});

test("T-INF-01: Infer<Schema> = SchemaToType", () => {
  type _T = Expect<Equal<Infer<"string">, string>>;
});

// ---------------------------------------------------------------------------
// 7.6 Infer (endpoint / EndpointFn)
// ---------------------------------------------------------------------------

type UserResponse = {
  readonly type: "object";
  readonly properties: { readonly id: "string"; readonly name: "string" };
};

type BodySchema = {
  readonly type: "object";
  readonly properties: { readonly title: "string" };
};

type QDef = {
  readonly q: { readonly type: "string"; readonly required: true };
  readonly page: { readonly type: "string"; readonly required: false };
};

/** GET /users/:id[string], no queryParams */
type GetUserFn = EndpointFn<
  SchemaToType<UserResponse>,
  "result",
  "GET",
  "/users/:id[string]",
  undefined,
  undefined
>;

/** POST with body schema */
type CreatePostFn = EndpointFn<
  { ok: boolean },
  "result",
  "POST",
  "/posts",
  BodySchema,
  undefined
>;

/** GET with queryParams */
type SearchFn = EndpointFn<
  string,
  "result",
  "GET",
  "/search",
  undefined,
  QDef
>;

test("T-INF-02: InferKeysFor GET endpoint excludes body", () => {
  type Keys = InferKeysFor<GetUserFn>;
  type HasBody = "body" extends Keys ? true : false;
  type _T = Expect<Equal<HasBody, false>>;
});

test("T-INF-03: InferKeysFor POST endpoint includes body", () => {
  type Keys = InferKeysFor<CreatePostFn>;
  type HasBody = "body" extends Keys ? true : false;
  type _T = Expect<Equal<HasBody, true>>;
});

test("T-INF-04: Infer<GET EndpointFn, response>", () => {
  type Got = Infer<GetUserFn, "response">;
  type _T = Expect<Equal<Got, SchemaToType<UserResponse>>>;
});

test("T-INF-05: Infer<GET EndpointFn, path>", () => {
  type Got = Infer<GetUserFn, "path">;
  type _T = Expect<Equal<Got, "/users/:id[string]">>;
});

test("T-INF-06: Infer<GET EndpointFn, params>", () => {
  type Got = Infer<GetUserFn, "params">;
  type _T = Expect<Equal<Got, { id: string }>>;
});

test("T-INF-07: Infer<GET EndpointFn, params> empty path params", () => {
  type ListFn = EndpointFn<string, "result", "GET", "/items", undefined, undefined>;
  type Got = Infer<ListFn, "params">;
  type _T = Expect<Equal<Got, {}>>;
});

test("T-INF-08: Infer<GET EndpointFn, query> without queryParams def", () => {
  type Got = Infer<GetUserFn, "query">;
  type _T = Expect<Equal<Got, Record<string, string>>>;
});

test("T-INF-09: Infer<GET EndpointFn, query> with queryParams def", () => {
  type Got = Infer<SearchFn, "query">;
  type _T1 = Expect<Equal<Got["q"], string>>;
  type HasOptionalPage = undefined extends Got["page"] ? true : false;
  type _T2 = Expect<Equal<HasOptionalPage, true>>;
  type _T3 = Expect<Equal<Got["page"], string | undefined>>;
});

test("T-INF-10: Infer<POST EndpointFn, body> with body schema", () => {
  type Got = Infer<CreatePostFn, "body">;
  type _T = Expect<Equal<Got, SchemaToType<BodySchema>>>;
});

test("T-INF-11: Infer<POST EndpointFn, path>", () => {
  type Got = Infer<CreatePostFn, "path">;
  type _T = Expect<Equal<Got, "/posts">>;
});

test("T-INF-12: Infer<EndpointFn> defaults to response", () => {
  type Got = Infer<GetUserFn>;
  type _T = Expect<Equal<Got, SchemaToType<UserResponse>>>;
});

test("T-INF-13: Infer<EndpointDef, response> matches internal response helper", () => {
  const ep = {
    method: "GET" as const,
    path: "/users/:id[string]" as const,
    response: {
      type: "object" as const,
      properties: { id: "string" as const },
    },
  } satisfies EndpointDef;
  type FromInfer = Infer<typeof ep, "response">;
  type FromHelper = InferEndpointResponse<typeof ep>;
  type _T = Expect<Equal<FromInfer, FromHelper>>;
});

test("T-INF-14: Infer<EndpointDef, path> and params", () => {
  const ep = {
    method: "GET" as const,
    path: "/users/:id[string]" as const,
    response: { type: "object" as const, properties: { id: "string" as const } },
  } satisfies EndpointDef;
  type PathGot = Infer<typeof ep, "path">;
  type ParamsGot = Infer<typeof ep, "params">;
  type _P = Expect<Equal<PathGot, "/users/:id[string]">>;
  type _Q = Expect<Equal<ParamsGot, { id: string }>>;
});

test("T-INF-15: union second arg to Infer resolves to never", () => {
  type Bad = Infer<GetUserFn, "response" | "path">;
  type _T = Expect<Equal<Bad, never>>;
});

test("T-QP-01: QueryParamsToType required + optional", () => {
  type Q = {
    readonly a: { readonly type: "string"; readonly required: true };
    readonly b: { readonly type: "number"; readonly required: false };
  };
  type Got = QueryParamsToType<Q>;
  type _T1 = Expect<Equal<Got["a"], string>>;
  type HasOptionalB = undefined extends Got["b"] ? true : false;
  type _T2 = Expect<Equal<HasOptionalB, true>>;
});
