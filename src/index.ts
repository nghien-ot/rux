export {
  defineClient,
  unwrapOrThrow,
  unwrapOrDefault,
} from "./client/index.ts";

export { validate, validateResponse, handleValidation } from "./schema/index.ts";

export type {
  PrimitiveSchema,
  PrimitiveObjectSchema,
  ObjectSchema,
  ArraySchema,
  Schema,
  SchemaToType,
  ValidPath,
  ExtractPathParams,
  RuxResult,
  ErrorMode,
  HttpMethod,
  MethodWithBody,
  RuxError,
  AuthConfig,
  EndpointDef,
  ClientConfig,
  CallOptions,
  ModeReturn,
  EndpointFn,
  RuxClient,
  QueryParamDef,
  QueryParamsDef,
  QueryParamsToType,
  QueryPrimitiveType,
  Infer,
  InferEndpointResponse,
} from "./types/index.ts";
