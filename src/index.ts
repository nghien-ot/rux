export { createClient } from "./client/index.ts";

export { validate } from "./schema/index.ts";

export type {

  // Client surface
  ClientConfig,
  EndpointDefinition,
  HttpMethod,
  RequestOptions,
  RuxError,
  RuxResult,
  ValidPath,
  // Schema surface
  Schema,
  SchemaToType,
  StandardSchemaV1,
  StandardSchemaIssue,
  StandardSchemaResult,
  InferInput,
  InferOutput,
  // Inference (public; access via Infer<> only)
  Infer
} from "./types/index.ts";

