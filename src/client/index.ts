import { validate, validateResponse } from "../schema/validate.ts";
import type {
  AuthConfig,
  ClientConfig,
  EndpointDefRecordValue,
  ErrorMode,
  QueryParamDef,
  QueryParamsDef,
  RuxClient,
  RuxError,
  RuxResult,
  Schema,
} from "../types/index.ts";

// ---------------------------------------------------------------------------
// Helpers (exported for ad-hoc use)
// ---------------------------------------------------------------------------

export function unwrapOrThrow<T>(result: RuxResult<T>): T {
  if (result.ok) return result.value;
  throw result.error;
}

export function unwrapOrDefault<T>(result: RuxResult<T>, fallback: T): T {
  if (result.ok) return result.value;
  return fallback;
}

// ---------------------------------------------------------------------------
// Internal: resolve auth config → header entries
// ---------------------------------------------------------------------------

function resolveAuthHeaders(auth?: AuthConfig): Record<string, string> {
  if (!auth) return {};

  switch (auth.type) {
    case "bearer":
      return auth.token ? { authorization: `Bearer ${auth.token}` } : {};
    case "basic": {
      if (!auth.credentials) return {};
      const encoded = btoa(
        `${auth.credentials.username}:${auth.credentials.password}`,
      );
      return { authorization: `Basic ${encoded}` };
    }
    case "custom":
      return auth.header ? { [auth.header.name]: auth.header.value } : {};
  }
}

// ---------------------------------------------------------------------------
// Internal: queryParams → object Schema for validate()
// ---------------------------------------------------------------------------

function queryParamDefToPropertySchema(def: QueryParamDef): Schema {
  const optional = def.required !== true;
  const nullable = def.nullable === true;
  if (def.type === "array") {
    return {
      type: "array",
      items: def.items,
      ...(nullable ? { nullable: true } : {}),
      ...(optional ? { optional: true } : {}),
    };
  }
  return {
    type: def.type,
    ...(nullable ? { nullable: true } : {}),
    ...(optional ? { optional: true } : {}),
  };
}

function queryParamsToObjectSchema(qp: QueryParamsDef): Schema {
  const properties: Record<string, Schema> = {};
  for (const [key, def] of Object.entries(qp)) {
    properties[key] = queryParamDefToPropertySchema(def);
  }
  return { type: "object", properties };
}

function encodePathParamValue(value: string | number | boolean): string {
  return encodeURIComponent(String(value));
}

/** Replace every :name[type] segment for each params key. */
function applyPathParams(
  path: string,
  params?: Record<string, string | number | boolean>,
): string {
  let resolved = path;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      const re = new RegExp(`:${key}\\[[^\\]]+\\]`, "g");
      resolved = resolved.replace(re, encodePathParamValue(value));
    }
  }
  return resolved;
}

function appendSearchParams(
  url: URL,
  query: Record<string, unknown>,
): void {
  for (const [key, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (v === null) {
      url.searchParams.set(key, "");
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        url.searchParams.append(key, String(item));
      }
    } else if (typeof v === "object") {
      continue;
    } else {
      url.searchParams.set(key, String(v));
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: build full URL with path-param substitution + query
// ---------------------------------------------------------------------------

function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean>,
  query?: Record<string, unknown>,
): string {
  const resolvedPath = applyPathParams(path, params);
  const url = new URL(resolvedPath, baseUrl);

  if (query && Object.keys(query).length > 0) {
    appendSearchParams(url, query);
  }

  return url.toString();
}

// ---------------------------------------------------------------------------
// Internal: execute a single request → always returns RuxResult
// ---------------------------------------------------------------------------

async function executeRequest<T>(
  baseUrl: string,
  endpoint: EndpointDefRecordValue,
  clientHeaders: Record<string, string>,
  callOptions?: {
    params?: Record<string, string | number | boolean>;
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<RuxResult<T>> {
  const ep = endpoint as {
    response: Schema;
    body?: Schema;
    queryParams?: QueryParamsDef;
  };

  if (ep.body && callOptions?.body !== undefined) {
    if (!validate(ep.body, callOptions.body)) {
      return {
        ok: false,
        error: {
          type: "validation",
          message: "Request body failed schema validation",
        },
      };
    }
  }

  if (ep.queryParams) {
    const q = callOptions?.query ?? {};
    const schema = queryParamsToObjectSchema(ep.queryParams);
    if (!validate(schema, q)) {
      return {
        ok: false,
        error: {
          type: "validation",
          message: "Query parameters failed schema validation",
        },
      };
    }
  }

  const url = buildUrl(
    baseUrl,
    endpoint.path,
    callOptions?.params,
    callOptions?.query,
  );

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...clientHeaders,
    ...endpoint.headers,
    ...callOptions?.headers,
  };

  const init: RequestInit = {
    method: endpoint.method,
    headers,
  };

  if (callOptions?.body !== undefined) {
    init.body = JSON.stringify(callOptions.body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    return {
      ok: false,
      error: {
        type: "network",
        message: cause instanceof Error ? cause.message : "Network error",
        cause,
      },
    };
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      message = await response.text();
    } catch {
      // keep statusText
    }
    return {
      ok: false,
      error: { type: "http", status: response.status, message },
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    return {
      ok: false,
      error: {
        type: "validation",
        message: "Response body is not valid JSON",
        cause,
      },
    };
  }

  return validateResponse<T>(ep.response, json);
}

// ---------------------------------------------------------------------------
// Resolve error mode and surface result accordingly
// ---------------------------------------------------------------------------

async function resolveResult<T>(
  resultPromise: Promise<RuxResult<T>>,
  mode: ErrorMode,
  defaultValue?: T,
): Promise<unknown> {
  const result = await resultPromise;

  switch (mode) {
    case "result":
      return result;
    case "throw":
      return unwrapOrThrow(result);
    case "fallback":
      if (defaultValue === undefined) {
        throw new Error(
          "defaultValue is required when errorMode is \"fallback\"",
        );
      }
      return unwrapOrDefault(result, defaultValue);
  }
}

// ---------------------------------------------------------------------------
// defineClient
// ---------------------------------------------------------------------------

export function defineClient<
  M extends ErrorMode = "result",
  E extends Record<string, EndpointDefRecordValue> = Record<string, EndpointDefRecordValue>,
>(config: ClientConfig<M, E>): RuxClient<M, E> {
  const clientErrorMode: ErrorMode = config.errorMode ?? "result";
  const clientHeaders: Record<string, string> = {
    ...resolveAuthHeaders(config.auth),
    ...config.headers,
  };

  const client = {} as Record<string, unknown>;

  for (const [name, endpoint] of Object.entries(config.endpoints)) {
    client[name] = (callOptions?: Record<string, unknown>) => {
      const mode =
        (callOptions?.errorMode as ErrorMode | undefined) ?? clientErrorMode;
      const defaultValue = callOptions?.defaultValue;

      const resultPromise = executeRequest(
        config.baseUrl,
        endpoint,
        clientHeaders,
        callOptions as Parameters<typeof executeRequest>[3],
      );

      return resolveResult(resultPromise, mode, defaultValue);
    };
  }

  return client as RuxClient<M, E>;
}
