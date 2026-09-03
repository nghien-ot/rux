export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

export type StandardSchemaResult<Output> =
  | { value: Output }
  | { issues: readonly { message: string }[] };

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) =>
      | StandardSchemaResult<Output>
      | Promise<StandardSchemaResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

export type InferInput<S extends StandardSchemaV1> =
  NonNullable<S["~standard"]["types"]>["input"];
export type InferOutput<S extends StandardSchemaV1> =
  NonNullable<S["~standard"]["types"]>["output"];
export type Schema = StandardSchemaV1;
export type SchemaToType<S extends Schema> = InferOutput<S>;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ValidPath = `/${string}` | "";
export type RequestOptions = Omit<RequestInit, "method" | "body">;

export type EndpointDefinition = {
  method: HttpMethod;
  path: ValidPath;
  request?: RequestOptions;
  timeoutMs?: number;
  query?: StandardSchemaV1;
  body?: StandardSchemaV1;
  response?: StandardSchemaV1;
  error?: StandardSchemaV1;
};

export type ClientConfig<
  E extends Record<string, EndpointDefinition> = Record<string, EndpointDefinition>,
> = {
  baseUrl: string;
  request?: RequestOptions;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch | ((input: string | URL | Request, init?: RequestInit) => Promise<Response>);
  endpoints: E;
};

export type RuxError<Failure = unknown> = {
  type: "request" | "network" | "http" | "validation";
  message: string;
  cause?: unknown;
  status?: number;
  issues?: readonly StandardSchemaIssue[];
  data?: Failure;
  phase?: "body" | "query" | "response" | "error";
};

export type RuxResult<Success, Failure = unknown> =
  | { ok: true; value: Success }
  | { ok: false; error: RuxError<Failure> };

type PathSegmentType<B extends string> =
  B extends "number" ? number
  : B extends "boolean" ? boolean
  : string;

export type PathParamsShape<T extends string> =
  T extends `${string}:${infer Name}[${infer Kind}]/${infer Rest}`
    ? { [K in Name]: PathSegmentType<Kind> } & PathParamsShape<`/${Rest}`>
    : T extends `${string}:${infer Name}[${infer Kind}]`
      ? { [K in Name]: PathSegmentType<Kind> }
      : {};

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type ExtractPathParams<T extends string> = keyof PathParamsShape<T> & string;

type MethodWithBody = "POST" | "PUT" | "PATCH";
type QueryValue = string | number | boolean | null | readonly (string | number | boolean)[] | undefined;
type QueryRecord = Record<string, QueryValue>;

type ResponseOf<E extends EndpointDefinition> =
  E extends { response: infer S extends StandardSchemaV1 } ? InferOutput<S> : undefined;
type ErrorOf<E extends EndpointDefinition> =
  E extends { error: infer S extends StandardSchemaV1 } ? InferOutput<S> : unknown;
type BodyOf<E extends EndpointDefinition> =
  E extends { body: infer S extends StandardSchemaV1 } ? InferInput<S> : never;
type QueryOf<E extends EndpointDefinition> =
  E extends { query: infer S extends StandardSchemaV1 } ? InferInput<S> : QueryRecord;

type ParamsField<E extends EndpointDefinition> =
  keyof PathParamsShape<E["path"]> extends never ? {} : { params: Prettify<PathParamsShape<E["path"]>> };
type QueryField<E extends EndpointDefinition> =
  E extends { query: StandardSchemaV1 } ? { query: QueryOf<E> } : { query?: QueryRecord };
type BodyField<E extends EndpointDefinition> =
  E["method"] extends MethodWithBody
    ? E extends { body: StandardSchemaV1 }
      ? { body: BodyOf<E> }
      : {}
    : {};

export type CallOptions<E extends EndpointDefinition> =
  & { request?: RequestOptions; timeoutMs?: number }
  & ParamsField<E>
  & QueryField<E>
  & BodyField<E>;

type HasRequiredInput<E extends EndpointDefinition> =
  keyof PathParamsShape<E["path"]> extends never
    ? E extends { query: StandardSchemaV1 } | { body: StandardSchemaV1 }
      ? true
      : false
    : true;

export type EndpointFn<E extends EndpointDefinition> =
  (HasRequiredInput<E> extends true
    ? (options: CallOptions<E>) => Promise<RuxResult<ResponseOf<E>, ErrorOf<E>>>
    : (options?: CallOptions<E>) => Promise<RuxResult<ResponseOf<E>, ErrorOf<E>>>)
  & { readonly __ruxEndpointDefinition?: E };

export type RuxClient<E extends Record<string, EndpointDefinition>> = {
  [K in keyof E]: EndpointFn<E[K]>;
};

type InferEndpoint<E extends EndpointDefinition, K extends string> =
  K extends "response" ? ResponseOf<E>
  : K extends "path" ? E["path"]
  : K extends "params" ? Prettify<PathParamsShape<E["path"]>>
  : K extends "body" ? BodyOf<E>
  : K extends "query" ? QueryOf<E>
  : never;

export type InferKeysFor<A> =
  A extends EndpointFn<infer E>
    ? "response" | "path" | "params" | "body" | "query"
    : A extends EndpointDefinition
      ? "response" | "path" | "params" | "body" | "query"
      : never;

export type Infer<A, K extends InferKeysFor<A> | undefined = undefined> =
  A extends StandardSchemaV1 ? InferOutput<A>
  : A extends EndpointFn<infer E>
    ? K extends string ? InferEndpoint<E, K> : ResponseOf<E>
    : A extends EndpointDefinition
      ? K extends string ? InferEndpoint<A, K> : ResponseOf<A>
      : never;
