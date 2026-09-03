// ---------------------------------------------------------------------------
// Standard Schema v1 structural contract
// ---------------------------------------------------------------------------

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output }
  | { readonly issues: readonly StandardSchemaIssue[] };

export interface StandardSchemaTypes<Input, Output> {
  readonly input: Input;
  readonly output: Output;
}

export interface StandardSchema<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: StandardSchemaTypes<Input, Output> | undefined;
  };
}

/** Compatibility name used by the Standard Schema specification. */
export type StandardSchemaV1<Input = unknown, Output = Input> = StandardSchema<Input, Output>;

export type InferInput<S extends StandardSchema> =
  S extends StandardSchema<infer Input, unknown> ? Input : never;

export type InferOutput<S extends StandardSchema> =
  S extends StandardSchema<unknown, infer Output> ? Output : never;

export type Schema = StandardSchema;
export type SchemaToType<S extends Schema> = InferOutput<S>;

// Legacy names remain type aliases only; they no longer describe a runtime DSL.
export type PrimitiveSchema = Schema;
export type PrimitiveObjectSchema = Schema;
export type ObjectSchema = Schema;
export type ArraySchema = Schema;
