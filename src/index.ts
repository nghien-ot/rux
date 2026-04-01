export {
  defineClient, unwrapOrDefault, unwrapOrThrow
} from "./client/index.ts";

export { handleValidation, validate, validateResponse } from "./schema/index.ts";

export type {

  // Client surface
  AuthConfig,
  ClientConfig,
  EndpointDef,
  ErrorMode,
  HttpMethod,
  RuxError,
  RuxResult,
  ValidPath,
  // Schema surface
  Schema,
  SchemaToType,
  // Inference (public; access via Infer<> only)
  Infer
} from "./types/index.ts";

