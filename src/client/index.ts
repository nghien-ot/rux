import { validate } from "../schema/validate.ts";
import type {
  CallOptions,
  ClientConfig,
  EndpointDefinition,
  RequestOptions,
  RuxClient,
  RuxError,
  RuxResult,
} from "../types/index.ts";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const PATH_PARAM = /:([^/\[\]]+)\[(string|number|boolean)\]/g;
type ValidationError = Extract<RuxError, { type: "validation" }>;
type ValidationPhase = NonNullable<ValidationError["phase"]>;
type ValidationContext = { phase: ValidationPhase; status?: number };

function requestFailure(message: string, cause?: unknown): RuxResult<never> {
  return { ok: false, error: cause === undefined ? { type: "request", message } : { type: "request", message, cause } };
}

function validationFailure(error: ValidationError): RuxResult<never> {
  return { ok: false, error };
}

function mergeHeaders(...sources: Array<RequestInit["headers"] | undefined>): Headers {
  const headers = new Headers();
  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, name) => headers.set(name, value));
  }
  return headers;
}

function mergeRequestOptions(...sources: Array<RequestOptions | undefined>): RequestOptions {
  const merged: RequestOptions = {};
  for (const source of sources) {
    if (!source) continue;
    const { headers: _headers, method: _method, body: _body, ...scalar } = source as RequestInit;
    Object.assign(merged, scalar);
  }
  return merged;
}

function resolvePath(path: string, params: unknown): string | RuxResult<never> {
  const values = params !== null && typeof params === "object" ? params as Record<string, unknown> : {};
  let missing: string | undefined;
  let invalid: string | undefined;
  const result = path.replace(PATH_PARAM, (match, name: string, kind: string) => {
    const value = values[name];
    if (value === undefined) {
      missing ??= name;
      return match;
    }
    const valid = kind === "string"
      ? typeof value === "string"
      : kind === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : typeof value === "boolean";
    if (!valid) {
      invalid ??= name;
      return match;
    }
    return encodeURIComponent(String(value));
  });
  if (missing) return requestFailure(`Missing path parameter: ${missing}`);
  if (invalid) return requestFailure(`Invalid path parameter: ${invalid}`);
  return result;
}

function appendQuery(url: URL, query: unknown): void {
  if (query === null || typeof query !== "object" || Array.isArray(query)) return;
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (value === null) url.searchParams.set(key, "");
    else if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
    else if (typeof value !== "object") url.searchParams.set(key, String(value));
  }
}

function abortMessage(reason: unknown): string {
  return reason instanceof Error && reason.message ? reason.message : "Request aborted";
}

function createValidationError(
  message: string,
  options: {
    issues?: ValidationError["issues"];
    cause?: unknown;
    phase?: ValidationPhase;
    status?: number;
  } = {},
): ValidationError {
  const error = {
    type: "validation",
    message,
    issues: options.issues ?? [],
    ...(options.cause === undefined ? {} : { cause: options.cause }),
    ...(options.phase === undefined ? {} : { phase: options.phase }),
    ...(options.status === undefined ? {} : { status: options.status }),
  } as ValidationError;
  return error;
}

function attachValidationContext(
  result: RuxResult<unknown>,
  context: ValidationContext,
): RuxResult<unknown> {
  if (!result.ok && result.error.type === "validation") {
    result.error.phase = context.phase;
    if (context.status !== undefined) result.error.status = context.status;
  }
  return result;
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (cause) => {
        cleanup();
        reject(cause);
      },
    );
  });
}

function abortFailure(signal: AbortSignal, timedOut: boolean): RuxResult<never> {
  const cause = signal.reason;
  return requestFailure(timedOut ? "Request timed out" : abortMessage(cause), cause);
}

async function validateAt(
  schema: Parameters<typeof validate>[0],
  value: unknown,
  context: ValidationContext,
): Promise<RuxResult<unknown>> {
  try {
    const result = await validate(schema, value);
    return attachValidationContext(result, context);
  } catch (cause) {
    return validationFailure(createValidationError(
      cause instanceof Error && cause.message ? cause.message : "Schema validation failed",
      { cause, phase: context.phase, status: context.status },
    ));
  }
}

async function parseJsonResponse(
  response: Response,
  context: ValidationContext,
): Promise<{ ok: true; value: unknown } | RuxResult<never>> {
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    return validationFailure(createValidationError("Response body is not valid JSON", { cause, phase: context.phase, status: context.status }));
  }
  if (text === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (cause) {
    return validationFailure(createValidationError("Response body is not valid JSON", { cause, phase: context.phase, status: context.status }));
  }
}

async function executeRequest<E extends EndpointDefinition>(
  config: ClientConfig<Record<string, EndpointDefinition>>,
  endpoint: E,
  options: CallOptions<E> | undefined,
): Promise<RuxResult<unknown>> {
  if (!METHODS.has(endpoint.method)) return requestFailure(`Invalid HTTP method: ${String(endpoint.method)}`);

  const input = options as (CallOptions<E> & {
    body?: unknown;
    params?: unknown;
    query?: unknown;
  }) | undefined;
  const request = mergeRequestOptions(config.request, endpoint.request, options?.request);
  const headers = mergeHeaders(config.request?.headers, endpoint.request?.headers, options?.request?.headers);
  const timeoutMs = options?.timeoutMs ?? endpoint.timeoutMs ?? config.timeoutMs;
  const callerSignal = request.signal;
  if (callerSignal?.aborted) {
    return requestFailure(abortMessage(callerSignal.reason), callerSignal.reason);
  }
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);

  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
    }, timeoutMs);
  }

  try {
    let parsedBody: unknown;
    if (endpoint.body) {
      const bodyResult = await raceWithAbort(validateAt(endpoint.body, input?.body, { phase: "body" }), controller.signal);
      if (!bodyResult.ok) return bodyResult;
      parsedBody = bodyResult.value;
    }

    let parsedQuery: unknown = input?.query;
    if (endpoint.query) {
      const queryResult = await raceWithAbort(validateAt(endpoint.query, input?.query, { phase: "query" }), controller.signal);
      if (!queryResult.ok) return queryResult;
      parsedQuery = queryResult.value;
    }

    const resolvedPath = resolvePath(endpoint.path, input?.params);
    if (typeof resolvedPath !== "string") return resolvedPath;

    let url: URL;
    try {
      url = new URL(resolvedPath, config.baseUrl);
      appendQuery(url, parsedQuery);
    } catch {
      return requestFailure("Invalid URL");
    }

    let serializedBody: string | undefined;
    if (endpoint.body) {
      try {
        serializedBody = JSON.stringify(parsedBody);
      } catch (cause) {
        return requestFailure("Failed to serialize request body", cause);
      }
    }

    if (endpoint.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const init: RequestInit = {
      ...request,
      headers,
      method: endpoint.method,
      ...(endpoint.body ? { body: serializedBody } : {}),
      signal: controller.signal,
    };

    let response: Response;
    try {
      response = await raceWithAbort((config.fetch ?? globalThis.fetch)(url.toString(), init), controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) {
        return abortFailure(controller.signal, timedOut);
      }
      return { ok: false, error: { type: "network", message: cause instanceof Error ? cause.message : "Network error", cause } };
    }

    if (controller.signal.aborted) {
      return abortFailure(controller.signal, timedOut);
    }

    try {
      return await raceWithAbort((async () => {
        if (!response.ok) {
          if (!endpoint.error) {
            let data: unknown;
            let hasData = false;
            try {
              const text = await response.text();
              try {
                data = JSON.parse(text);
              } catch {
                data = text;
              }
              hasData = true;
            } catch { /* preserve the HTTP failure when its body cannot be read */ }
            return {
              ok: false,
              error: {
                type: "http",
                status: response.status,
                message: response.statusText || `HTTP ${response.status}`,
                ...(hasData ? { data } : {}),
              },
            };
          }
          const parsed = await parseJsonResponse(response, { phase: "error", status: response.status });
          if (!parsed.ok) return parsed;
          if (parsed.value === undefined) {
            return validationFailure(createValidationError("Response body is not valid JSON", {
              phase: "error",
              status: response.status,
            }));
          }
          const errorResult = await validateAt(endpoint.error, parsed.value, { phase: "error", status: response.status });
          if (!errorResult.ok) return errorResult;
          return {
            ok: false,
            error: {
              type: "http",
              status: response.status,
              message: response.statusText || `HTTP ${response.status}`,
              data: errorResult.value,
            },
          };
        }

        const parsed = await parseJsonResponse(response, { phase: "response" });
        if (!parsed.ok) return parsed;
        if (parsed.value === undefined) {
          if (!endpoint.response) return { ok: true, value: undefined };
          return validationFailure(createValidationError("Response body is empty", { phase: "response" }));
        }
        if (!endpoint.response) {
          return validationFailure(createValidationError("Response schema is required for a non-empty body", { phase: "response" }));
        }
        return validateAt(endpoint.response, parsed.value, { phase: "response" });
      })(), controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) {
        return abortFailure(controller.signal, timedOut);
      }
      throw cause;
    }
  } catch (cause) {
    if (controller.signal.aborted) return abortFailure(controller.signal, timedOut);
    throw cause;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

async function execute<E extends EndpointDefinition>(
  config: ClientConfig<Record<string, EndpointDefinition>>,
  endpoint: E,
  options: CallOptions<E> | undefined,
): Promise<RuxResult<unknown>> {
  try {
    return await executeRequest(config, endpoint, options);
  } catch (cause) {
    return requestFailure("Request failed", cause);
  }
}

export function createClient<E extends Record<string, EndpointDefinition>>(
  config: ClientConfig<E>,
): RuxClient<E> {
  const client = {} as RuxClient<E>;
  for (const [name, endpoint] of Object.entries(config.endpoints)) {
    client[name as keyof E] = ((options?: CallOptions<EndpointDefinition>) =>
      execute(config, endpoint, options)) as RuxClient<E>[keyof E];
  }
  return client;
}
