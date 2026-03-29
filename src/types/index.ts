// ---------------------------------------------------------------------------
// Schema types (re-exported from src/schema/types.ts)
// ---------------------------------------------------------------------------

export type {
  ArraySchema, ObjectSchema, PrimitiveObjectSchema, PrimitiveSchema, Schema,
  SchemaToType
} from "../schema/types.ts";

import type { Schema, SchemaToType } from "../schema/types.ts";

// ---------------------------------------------------------------------------
// Path utilities (bracket DSL: /:name[string], /:id[number], /:x[boolean])
// ---------------------------------------------------------------------------

export type ValidPath = `/${string}` | "";

type PathSegmentType<B extends string> =
  B extends "number" ? number
  : B extends "boolean" ? boolean
  : string;

type PathParamsShape<T extends string> =
  T extends `${string}:${infer N}[${infer B}]/${infer Rest}`
    ? { [K in N]: PathSegmentType<B> } & PathParamsShape<`/${Rest}`>
    : T extends `${string}:${infer N}[${infer B}]`
      ? { [K in N]: PathSegmentType<B> }
      : {};

/** Path param names from bracket path template (e.g. `/u/:id[string]` → `"id"`). */
export type ExtractPathParams<T extends string> = keyof PathParamsShape<T> & string;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

// ---------------------------------------------------------------------------
// Query param descriptors (EndpointDef.queryParams)
// ---------------------------------------------------------------------------

export type QueryPrimitiveType = "string" | "number" | "boolean";

export type QueryParamDef =
  | ({ readonly type: QueryPrimitiveType } & QueryParamDefOptions)
  | ({
      readonly type: "array";
      readonly items: QueryPrimitiveType;
    } & QueryParamDefOptions);

type QueryParamDefOptions = {
  readonly required?: boolean;
  readonly nullable?: boolean;
};

export type QueryParamsDef = { readonly [key: string]: QueryParamDef };

type QueryItemType<P extends QueryPrimitiveType> =
  P extends "string" ? string
  : P extends "number" ? number
  : boolean;

type QueryScalar<D extends QueryParamDef> =
  D extends { type: "array"; items: infer I extends QueryPrimitiveType }
    ? (D extends { nullable: true } ? QueryItemType<I>[] | null : QueryItemType<I>[])
    : D extends { type: infer T extends QueryPrimitiveType }
      ? (D extends { nullable: true } ? QueryItemType<T> | null : QueryItemType<T>)
      : never;

type HasRequiredQuery<Q extends QueryParamsDef> = true extends {
  [K in keyof Q]: Q[K] extends { readonly required: true } ? true : never;
}[keyof Q]
  ? true
  : false;

export type QueryParamsToType<Q extends QueryParamsDef> = Prettify<{
  [K in keyof Q as Q[K] extends { readonly required: true } ? K : never]: QueryScalar<Q[K]>;
} & {
  [K in keyof Q as Q[K] extends { readonly required: true } ? never : K]?: QueryScalar<Q[K]>;
}>;

type OpenQuery<T> = Prettify<T & Record<string, string>>;

type QueryCallField<Q extends QueryParamsDef | undefined> =
  [Q] extends [QueryParamsDef]
    ? HasRequiredQuery<Q> extends true
      ? { query: OpenQuery<QueryParamsToType<Q>> }
      : { query?: OpenQuery<QueryParamsToType<Q>> }
    : { query?: Record<string, string> };

// ---------------------------------------------------------------------------
// Result type (replaces neverthrow)
// ---------------------------------------------------------------------------

export type RuxResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RuxError };

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type ErrorMode = "result" | "throw" | "fallback";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type MethodWithBody = "POST" | "PUT" | "PATCH";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface RuxError {
  type: "network" | "validation" | "http";
  status?: number;
  message: string;
  cause?: unknown;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthConfig {
  type: "bearer" | "basic" | "custom";
  token?: string;
  credentials?: { username: string; password: string };
  header?: { name: string; value: string };
}

// ---------------------------------------------------------------------------
// Endpoint definition
// ---------------------------------------------------------------------------

type EndpointBody<M extends HttpMethod, BS extends Schema | undefined> =
  M extends MethodWithBody ? { body?: BS } : {};

export type EndpointDef<
  S extends Schema = Schema,
  M extends HttpMethod = HttpMethod,
  P extends ValidPath = ValidPath,
  BS extends Schema | undefined = Schema | undefined,
  Q extends QueryParamsDef | undefined = undefined,
> = {
  method: M;
  path: P;
  response: S;
  headers?: Record<string, string>;
  queryParams?: Q;
} & EndpointBody<M, BS>;

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface ClientConfig<
  M extends ErrorMode = "result",
  E extends Record<string, EndpointDef> = Record<string, EndpointDef>,
> {
  baseUrl: string;
  errorMode?: M;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  endpoints: E;
}

// ---------------------------------------------------------------------------
// Per-call options
// ---------------------------------------------------------------------------

type ParamsField<P extends string> = keyof PathParamsShape<P> extends never
  ? {}
  : { params: PathParamsShape<P> };

type BodyField<M extends HttpMethod, BS> = M extends MethodWithBody
  ? BS extends Schema
    ? { body?: SchemaToType<BS> }
    : { body?: unknown }
  : {};

type BaseCallFields = {
  headers?: Record<string, string>;
};

type ErrorModeOverride<T> =
  | { errorMode?: undefined }
  | { errorMode: "result" }
  | { errorMode: "throw" }
  | { errorMode: "fallback"; defaultValue: T };

export type CallOptions<
  T,
  M extends HttpMethod,
  P extends string = string,
  BS extends Schema | undefined = undefined,
  Q extends QueryParamsDef | undefined = undefined,
> =
  & BaseCallFields
  & ParamsField<P>
  & BodyField<M, BS>
  & QueryCallField<Q>
  & ErrorModeOverride<T>;

// ---------------------------------------------------------------------------
// Return-type resolution
// ---------------------------------------------------------------------------

export type ModeReturn<T, M extends ErrorMode> = M extends "result"
  ? RuxResult<T>
  : T;

// ---------------------------------------------------------------------------
// Overloaded callable for a single endpoint
// ---------------------------------------------------------------------------

type MergeCall<
  T,
  HttpM extends HttpMethod,
  P extends string,
  BS extends Schema | undefined,
  Q extends QueryParamsDef | undefined,
> =
  & BaseCallFields
  & ParamsField<P>
  & BodyField<HttpM, BS>
  & QueryCallField<Q>;

export interface EndpointFnNormal<
  T,
  CM extends ErrorMode,
  HttpM extends HttpMethod,
  P extends string,
  BS extends Schema | undefined,
  Q extends QueryParamsDef | undefined = undefined,
> {
  (
    options?: MergeCall<T, HttpM, P, BS, Q> & ErrorModeOverride<T> & { errorMode?: undefined },
  ): Promise<ModeReturn<T, CM>>;
  (
    options: MergeCall<T, HttpM, P, BS, Q> & { errorMode: "result" },
  ): Promise<RuxResult<T>>;
  (
    options: MergeCall<T, HttpM, P, BS, Q> & { errorMode: "throw" },
  ): Promise<T>;
  (
    options: MergeCall<T, HttpM, P, BS, Q> & {
      errorMode: "fallback";
      defaultValue: T;
    },
  ): Promise<T>;
}

export interface EndpointFnClientFallback<
  T,
  HttpM extends HttpMethod,
  P extends string,
  BS extends Schema | undefined,
  Q extends QueryParamsDef | undefined = undefined,
> {
  (
    options: MergeCall<T, HttpM, P, BS, Q> & {
      defaultValue: T;
      errorMode?: undefined;
    },
  ): Promise<T>;
  (
    options: MergeCall<T, HttpM, P, BS, Q> & {
      errorMode: "fallback";
      defaultValue: T;
    },
  ): Promise<T>;
  (
    options: MergeCall<T, HttpM, P, BS, Q> & {
      errorMode: "result";
      defaultValue: T;
    },
  ): Promise<RuxResult<T>>;
  (
    options: MergeCall<T, HttpM, P, BS, Q> & {
      errorMode: "throw";
      defaultValue: T;
    },
  ): Promise<T>;
}

export type EndpointFn<
  T,
  CM extends ErrorMode,
  HttpM extends HttpMethod,
  P extends string = string,
  BS extends Schema | undefined = undefined,
  Q extends QueryParamsDef | undefined = undefined,
> = CM extends "fallback"
  ? EndpointFnClientFallback<T, HttpM, P, BS, Q>
  : EndpointFnNormal<T, CM, HttpM, P, BS, Q>;

// ---------------------------------------------------------------------------
// Infer helper (schema / endpoint response)
// ---------------------------------------------------------------------------

export type Infer<S extends Schema> = SchemaToType<S>;

export type InferEndpointResponse<
  E extends { readonly response: Schema },
> = SchemaToType<E["response"]>;

// ---------------------------------------------------------------------------
// The client type: maps endpoint keys → callable methods
// ---------------------------------------------------------------------------

type InferBodySchema<E> =
  E extends { readonly body?: infer BS }
    ? BS extends Schema
      ? BS
      : undefined
    : undefined;

type InferQueryParams<E> =
  E extends { queryParams?: infer Q extends QueryParamsDef } ? Q : undefined;

export type RuxClient<
  CM extends ErrorMode,
  E extends Record<string, EndpointDef>,
> = {
  [K in keyof E]: E[K] extends {
    response: infer S extends Schema;
    method: infer M extends HttpMethod;
    path: infer P extends string;
  }
    ? EndpointFn<
        SchemaToType<S>,
        CM,
        M,
        P,
        InferBodySchema<E[K]>,
        InferQueryParams<E[K]>
      >
    : never;
};
