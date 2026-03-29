// ---------------------------------------------------------------------------
// Schema primitives
// ---------------------------------------------------------------------------

export type PrimitiveSchema = "string" | "number" | "boolean" | "unknown";

export interface PrimitiveObjectSchema {
  readonly type: PrimitiveSchema;
  readonly optional?: boolean;
  readonly nullable?: boolean;
}

export interface ObjectSchema {
  readonly type: "object";
  readonly properties: { readonly [key: string]: Schema };
  readonly optional?: boolean;
  readonly nullable?: boolean;
}

export interface ArraySchema {
  readonly type: "array";
  readonly items: Schema;
  readonly optional?: boolean;
  readonly nullable?: boolean;
}

export type Schema =
  | PrimitiveSchema
  | PrimitiveObjectSchema
  | ObjectSchema
  | ArraySchema;

// ---------------------------------------------------------------------------
// Compile-time type inference from schemas
// ---------------------------------------------------------------------------

type Prettify<T> = { [K in keyof T]: T[K] } & {};

type RequiredKeys<P> = {
  [K in keyof P]: P[K] extends { readonly optional: true } ? never : K;
}[keyof P];

type OptionalKeys<P> = {
  [K in keyof P]: P[K] extends { readonly optional: true } ? K : never;
}[keyof P];

type WithNullable<S, T> = S extends { readonly nullable: true } ? T | null : T;

type CoreType<S> = S extends "string"
  ? string
  : S extends "number"
    ? number
    : S extends "boolean"
      ? boolean
      : S extends "unknown"
        ? unknown
        : S extends { readonly type: "object"; readonly properties: infer P }
          ? Prettify<
              { [K in RequiredKeys<P & {}>]: SchemaToType<(P & {})[K]> } &
              { [K in OptionalKeys<P & {}>]?: SchemaToType<(P & {})[K]> }
            >
          : S extends { readonly type: "array"; readonly items: infer I }
            ? SchemaToType<I>[]
            : S extends { readonly type: infer T }
              ? CoreType<T>
              : never;

export type SchemaToType<S> = WithNullable<S, CoreType<S>>;
