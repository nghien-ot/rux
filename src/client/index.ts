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

function requestFailure(message: string, cause?: unknown): RuxResult<never> {
  return { ok: false, error: cause === undefined ? { type: "request", message } : { type: "request", message, cause } };
}

function validationFailure(error: RuxError): RuxResult<never> {
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

function attachErrorContext(result: RuxResult<unknown>, status: number): RuxResult<unknown> {
  if (!result.ok && result.error.type === "validation") {
    Object.defineProperties(result.error, {
      status: { value: status, enumerable: false },
      phase: { value: "error", enumerable: false },
    });
  }
  return result;
}

async function parseJsonResponse(response: Response): Promise<{ ok: true; value: unknown } | RuxResult<never>> {
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    return validationFailure({ type: "validation", message: "Response body is not valid JSON", cause });
  }
  if (text === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (cause) {
    return validationFailure({ type: "validation", message: "Response body is not valid JSON", cause });
  }
}

async function execute<E extends EndpointDefinition>(
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
  let parsedBody: unknown;
  if (endpoint.body) {
    const bodyResult = await validate(endpoint.body, input?.body);
    if (!bodyResult.ok) return bodyResult;
    parsedBody = bodyResult.value;
  }

  let parsedQuery: unknown = input?.query;
  if (endpoint.query) {
    const queryResult = await validate(endpoint.query, input?.query);
    if (!queryResult.ok) return queryResult;
    parsedQuery = queryResult.value;
  }

  const resolvedPath = resolvePath(endpoint.path, input?.params);
  if (typeof resolvedPath !== "string") return resolvedPath;

  let url: URL;
  try {
    url = new URL(resolvedPath, config.baseUrl);
    appendQuery(url, parsedQuery);
  } catch (cause) {
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

  const request = mergeRequestOptions(config.request, endpoint.request, options?.request);
  const headers = mergeHeaders(config.request?.headers, endpoint.request?.headers, options?.request?.headers);
  if (endpoint.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const timeoutMs = options?.timeoutMs ?? endpoint.timeoutMs ?? config.timeoutMs;
  const callerSignal = request.signal;
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
    }, timeoutMs);
  }

  const init: RequestInit = {
    ...request,
    headers,
    method: endpoint.method,
    ...(endpoint.body ? { body: serializedBody } : {}),
    signal: controller.signal,
  };

  let response: Response;
  try {
    response = await (config.fetch ?? globalThis.fetch)(url.toString(), init);
  } catch (cause) {
    if (controller.signal.aborted) {
      const abortCause = controller.signal.reason;
      return requestFailure(timedOut ? "Request timed out" : abortMessage(abortCause), abortCause);
    }
    return { ok: false, error: { type: "network", message: cause instanceof Error ? cause.message : "Network error", cause } };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }

  if (controller.signal.aborted) {
    const abortCause = controller.signal.reason;
    return requestFailure(timedOut ? "Request timed out" : abortMessage(abortCause), abortCause);
  }

  if (!response.ok) {
    if (!endpoint.error) {
      return { ok: false, error: { type: "http", status: response.status, message: response.statusText || `HTTP ${response.status}` } };
    }
    const parsed = await parseJsonResponse(response);
    if (!parsed.ok) return attachErrorContext(parsed, response.status);
    const errorResult = await validate(endpoint.error, parsed.value);
    if (!errorResult.ok) return attachErrorContext(errorResult, response.status);
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

  const parsed = await parseJsonResponse(response);
  if (!parsed.ok) return parsed;
  if (parsed.value === undefined) {
    if (!endpoint.response) return { ok: true, value: undefined };
    return validationFailure({ type: "validation", message: "Response body is empty" });
  }
  if (!endpoint.response) {
    return validationFailure({ type: "validation", message: "Response schema is required for a non-empty body" });
  }
  return validate(endpoint.response, parsed.value);
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
