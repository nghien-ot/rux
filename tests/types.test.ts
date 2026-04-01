import { expectTypeOf, test } from "vitest";
import type {
  Infer,
  RuxResult,
  SchemaToType,
} from "../src/index.ts";
import type {
  CallOptions,
  EndpointDef,
  EndpointFn,
  ExtractPathParams,
  InferEndpointResponse,
  InferKeysFor,
  ModeReturn,
  QueryParamsToType,
  ValidPath,
} from "../src/types/index.ts";

// ---------------------------------------------------------------------------
// 7.1 SchemaToType
// ---------------------------------------------------------------------------

test("T-ST-01: SchemaToType<'string'> = string", () => {
  expectTypeOf<SchemaToType<"string">>().toEqualTypeOf<string>();
});

test("T-ST-02: SchemaToType<'number'> = number", () => {
  expectTypeOf<SchemaToType<"number">>().toEqualTypeOf<number>();
});

test("T-ST-03: SchemaToType<'boolean'> = boolean", () => {
  expectTypeOf<SchemaToType<"boolean">>().toEqualTypeOf<boolean>();
});

test("T-ST-04: SchemaToType<'unknown'> = unknown", () => {
  expectTypeOf<SchemaToType<"unknown">>().toEqualTypeOf<unknown>();
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
  expectTypeOf<Result["name"]>().toEqualTypeOf<string>();
  type HasOptionalBio = undefined extends Result["bio"] ? true : false;
  expectTypeOf<HasOptionalBio>().toEqualTypeOf<true>();
});

test("T-ST-06: Array schema -> T[]", () => {
  type S = { readonly type: "array"; readonly items: "number" };
  expectTypeOf<SchemaToType<S>>().toEqualTypeOf<number[]>();
});

test("T-ST-07: Nullable -> T | null", () => {
  type S = { readonly type: "string"; readonly nullable: true };
  expectTypeOf<SchemaToType<S>>().toEqualTypeOf<string | null>();
});

test("T-ST-08: PrimitiveObjectSchema without nullable -> no null", () => {
  type S = { readonly type: "number" };
  expectTypeOf<SchemaToType<S>>().toEqualTypeOf<number>();
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
  expectTypeOf<Result["user"]["name"]>().toEqualTypeOf<string>();
  expectTypeOf<Result["user"]["age"]>().toEqualTypeOf<number>();
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
  expectTypeOf<Result>().toEqualTypeOf<{ id: number }[]>();
});

// ---------------------------------------------------------------------------
// 7.2 ExtractPathParams
// ---------------------------------------------------------------------------

test("T-EP-01: single bracket param", () => {
  expectTypeOf<ExtractPathParams<"/users/:id[string]">>().toEqualTypeOf<"id">();
});

test("T-EP-02: multiple bracket params", () => {
  expectTypeOf<
    ExtractPathParams<"/users/:id[string]/posts/:postId[number]">
  >().toEqualTypeOf<"id" | "postId">();
});

test("T-EP-03: no params", () => {
  expectTypeOf<ExtractPathParams<"/users">>().toBeNever();
});

test("T-EP-04: empty string", () => {
  expectTypeOf<ExtractPathParams<"">>().toBeNever();
});

// ---------------------------------------------------------------------------
// 7.3 ValidPath
// ---------------------------------------------------------------------------

test("T-VP-01: '/foo' extends ValidPath", () => {
  expectTypeOf<"/foo" extends ValidPath ? true : false>().toEqualTypeOf<true>();
});

test("T-VP-02: '' extends ValidPath", () => {
  expectTypeOf<"" extends ValidPath ? true : false>().toEqualTypeOf<true>();
});

test("T-VP-03: 'foo' does not extend ValidPath", () => {
  expectTypeOf<"foo" extends ValidPath ? true : false>().toEqualTypeOf<false>();
});

// ---------------------------------------------------------------------------
// 7.4 ModeReturn
// ---------------------------------------------------------------------------

test("T-MR-01: ModeReturn<string, 'result'> = RuxResult<string>", () => {
  expectTypeOf<ModeReturn<string, "result">>().toEqualTypeOf<RuxResult<string>>();
});

test("T-MR-02: ModeReturn<string, 'throw'> = string", () => {
  expectTypeOf<ModeReturn<string, "throw">>().toEqualTypeOf<string>();
});

test("T-MR-03: ModeReturn<string, 'fallback'> = string", () => {
  expectTypeOf<ModeReturn<string, "fallback">>().toEqualTypeOf<string>();
});

// ---------------------------------------------------------------------------
// 7.5 CallOptions conditional fields
// ---------------------------------------------------------------------------

test("T-CO-01: GET with bracket params path requires params field", () => {
  type Opts = CallOptions<string, "GET", "/users/:id[string]">;
  type HasParams = "params" extends keyof Opts ? true : false;
  expectTypeOf<HasParams>().toEqualTypeOf<true>();
});

test("T-CO-02: GET without params path has no params field", () => {
  type Opts = CallOptions<string, "GET", "/users">;
  type HasParams = "params" extends keyof Opts ? true : false;
  expectTypeOf<HasParams>().toEqualTypeOf<false>();
});

test("T-CO-03: POST with body schema requires body field", () => {
  type BodySchema = { readonly type: "object"; readonly properties: { readonly name: "string" } };
  type Opts = CallOptions<string, "POST", "/users", BodySchema>;
  type HasBody = "body" extends keyof Opts ? true : false;
  expectTypeOf<HasBody>().toEqualTypeOf<true>();
});

test("T-CO-04: POST without body schema has optional body as unknown", () => {
  type Opts = CallOptions<string, "POST", "/users", undefined>;
  type HasBody = "body" extends keyof Opts ? true : false;
  expectTypeOf<HasBody>().toEqualTypeOf<true>();
});

test("T-CO-05: GET endpoint has no body field", () => {
  type Opts = CallOptions<string, "GET", "/users">;
  type HasBody = "body" extends keyof Opts ? true : false;
  expectTypeOf<HasBody>().toEqualTypeOf<false>();
});

test("T-INF-01: Infer<Schema> = SchemaToType", () => {
  expectTypeOf<Infer<"string">>().toEqualTypeOf<string>();
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
  expectTypeOf<HasBody>().toEqualTypeOf<false>();
});

test("T-INF-03: InferKeysFor POST endpoint includes body", () => {
  type Keys = InferKeysFor<CreatePostFn>;
  type HasBody = "body" extends Keys ? true : false;
  expectTypeOf<HasBody>().toEqualTypeOf<true>();
});

test("T-INF-04: Infer<GET EndpointFn, response>", () => {
  type Got = Infer<GetUserFn, "response">;
  expectTypeOf<Got>().toEqualTypeOf<SchemaToType<UserResponse>>();
});

test("T-INF-05: Infer<GET EndpointFn, path>", () => {
  type Got = Infer<GetUserFn, "path">;
  expectTypeOf<Got>().toEqualTypeOf<"/users/:id[string]">();
});

test("T-INF-06: Infer<GET EndpointFn, params>", () => {
  type Got = Infer<GetUserFn, "params">;
  expectTypeOf<Got>().toEqualTypeOf<{ id: string }>();
});

test("T-INF-07: Infer<GET EndpointFn, params> empty path params", () => {
  type ListFn = EndpointFn<string, "result", "GET", "/items", undefined, undefined>;
  type Got = Infer<ListFn, "params">;
  expectTypeOf<Got>().toEqualTypeOf<{}>();
});

test("T-INF-08: Infer<GET EndpointFn, query> without queryParams def", () => {
  type Got = Infer<GetUserFn, "query">;
  expectTypeOf<Got>().toEqualTypeOf<Record<string, string>>();
});

test("T-INF-09: Infer<GET EndpointFn, query> with queryParams def", () => {
  type Got = Infer<SearchFn, "query">;
  expectTypeOf<Got["q"]>().toEqualTypeOf<string>();
  type HasOptionalPage = undefined extends Got["page"] ? true : false;
  expectTypeOf<HasOptionalPage>().toEqualTypeOf<true>();
  expectTypeOf<Got["page"]>().toEqualTypeOf<string | undefined>();
});

test("T-INF-10: Infer<POST EndpointFn, body> with body schema", () => {
  type Got = Infer<CreatePostFn, "body">;
  expectTypeOf<Got>().toEqualTypeOf<SchemaToType<BodySchema>>();
});

test("T-INF-11: Infer<POST EndpointFn, path>", () => {
  type Got = Infer<CreatePostFn, "path">;
  expectTypeOf<Got>().toEqualTypeOf<"/posts">();
});

test("T-INF-12: Infer<EndpointFn> defaults to response", () => {
  type Got = Infer<GetUserFn>;
  expectTypeOf<Got>().toEqualTypeOf<SchemaToType<UserResponse>>();
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
  expectTypeOf<FromInfer>().toEqualTypeOf<FromHelper>();
});

test("T-INF-14: Infer<EndpointDef, path> and params", () => {
  const ep = {
    method: "GET" as const,
    path: "/users/:id[string]" as const,
    response: { type: "object" as const, properties: { id: "string" as const } },
  } satisfies EndpointDef;
  type PathGot = Infer<typeof ep, "path">;
  type ParamsGot = Infer<typeof ep, "params">;
  expectTypeOf<PathGot>().toEqualTypeOf<"/users/:id[string]">();
  expectTypeOf<ParamsGot>().toEqualTypeOf<{ id: string }>();
});

test("T-INF-15: union second arg to Infer resolves to never", () => {
  type Bad = Infer<GetUserFn, "response" | "path">;
  expectTypeOf<Bad>().toBeNever();
});

test("T-QP-01: QueryParamsToType required + optional", () => {
  type Q = {
    readonly a: { readonly type: "string"; readonly required: true };
    readonly b: { readonly type: "number"; readonly required: false };
  };
  type Got = QueryParamsToType<Q>;
  expectTypeOf<Got["a"]>().toEqualTypeOf<string>();
  type HasOptionalB = undefined extends Got["b"] ? true : false;
  expectTypeOf<HasOptionalB>().toEqualTypeOf<true>();
});
