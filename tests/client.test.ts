import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient } from "../src/index.ts";

type Issue = { readonly message: string; readonly path?: readonly PropertyKey[] };
type SchemaResult<Output> = { readonly value: Output } | { readonly issues: readonly Issue[] };
type FetchInput = string | URL | Request;

function schema<Output>(validateValue: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>) {
  return {
    "~standard": { version: 1 as const, vendor: "client-test", validate: validateValue },
  };
}

const boundaryInputs: readonly [string, unknown][] = [
  ["null", null],
  ["empty object", {}],
  ["empty array", []],
  ["empty string", ""],
  ["unexpected fields", { value: "ok", extra: true }],
];

function boundarySchema(scope: "body" | "query") {
  return schema<unknown>((value) => {
    const isExpectedObject = typeof value === "object" && value !== null && !Array.isArray(value)
      && Object.keys(value).length === 1 && "value" in value;
    return isExpectedObject
      ? { value }
      : { issues: [{ message: `${scope} boundary invalid`, path: [] }] };
  });
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;
let calls: Array<{ input: FetchInput; init: RequestInit | undefined }>;

beforeEach(() => {
  calls = [];
  fetchMock = vi.fn(async (input: FetchInput, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse({ id: 1 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function lastInit(): RequestInit {
  const init = calls.at(-1)?.init;
  if (!init) throw new Error("fetch was not called with RequestInit");
  return init;
}

function lastUrl(): string {
  const input = calls.at(-1)?.input;
  if (input instanceof URL) return input.toString();
  if (typeof input === "string") return input;
  return input?.url ?? "";
}

describe("createClient", () => {
  test("returns a result with parsed response output", async () => {
    const response = schema<{ id: number }>((value) => ({ value: { id: Number((value as { id: string }).id) } }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users", response } } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "7" }));
    await expect(client.get()).resolves.toEqual({ ok: true, value: { id: 7 } });
  });

  test("applies invocation, endpoint, then client scalar request precedence", async () => {
    const client = createClient({
      baseUrl: "https://api.test/v1",
      request: { credentials: "include", cache: "default", headers: { "x-level": "client", "x-client": "yes" } },
      endpoints: {
        get: {
          method: "GET",
          path: "/users",
          request: { credentials: "omit", cache: "no-store", headers: { "x-level": "endpoint", "x-endpoint": "yes" } },
        },
      },
    });
    await client.get({ request: { credentials: "same-origin", redirect: "error", headers: { "x-level": "invocation", "x-invocation": "yes" } } });
    const init = lastInit();
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("x-level")).toBe("invocation");
    expect(new Headers(init.headers).get("x-client")).toBe("yes");
    expect(new Headers(init.headers).get("x-endpoint")).toBe("yes");
    expect(new Headers(init.headers).get("x-invocation")).toBe("yes");
  });

  test("merges headers case-insensitively across all request layers", async () => {
    const client = createClient({
      baseUrl: "https://api.test",
      request: { headers: { Authorization: "client", "X-Trace": "client" } },
      endpoints: { get: { method: "GET", path: "/users", request: { headers: { authorization: "endpoint", "x-extra": "endpoint" } } } },
    });
    await client.get({ request: { headers: { AUTHORIZATION: "invocation", "x-trace": "invocation" } } });
    const headers = new Headers(lastInit().headers);
    expect(headers.get("authorization")).toBe("invocation");
    expect(headers.get("x-trace")).toBe("invocation");
    expect(headers.get("x-extra")).toBe("endpoint");
    expect([...headers.keys()].filter((key) => key === "authorization")).toEqual(["authorization"]);
  });

  test("uses endpoint method regardless of request option fields", async () => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { remove: { method: "DELETE", path: "/users/1" } } });
    await client.remove();
    expect(lastInit().method).toBe("DELETE");
  });

  test("substitutes and URL-encodes typed bracket params", async () => {
    const client = createClient({
      baseUrl: "https://api.test",
      endpoints: { route: { method: "GET", path: "/users/:id[string]/posts/:postId[number]/enabled/:enabled[boolean]" } },
    });
    await client.route({ params: { id: "a/b", postId: 42, enabled: false } });
    expect(lastUrl()).toBe("https://api.test/users/a%2Fb/posts/42/enabled/false");
  });

  test("serializes query scalars, repeated arrays, null, and skips undefined", async () => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { search: { method: "GET", path: "/search" } } });
    await client.search({ query: { q: "rux", page: 2, active: false, tag: ["one", "two"], empty: null, omitted: undefined } });
    expect(new URL(lastUrl()).search).toBe("?q=rux&page=2&active=false&tag=one&tag=two&empty=");
  });

  test("validates body and sends parsed body output before fetch", async () => {
    const body = schema<{ name: string }>((value) => ({ value: { name: (value as { name: string }).name.trim() } }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { create: { method: "POST", path: "/users", body } } });
    await client.create({ body: { name: " Ada " } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastInit().body).toBe(JSON.stringify({ name: "Ada" }));
  });

  test("validates query and sends parsed query output before fetch", async () => {
    const query = schema<{ page: number }>((value) => ({ value: { page: Number((value as { page: string }).page) } }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { search: { method: "GET", path: "/search", query } } });
    await client.search({ query: { page: "3" } });
    expect(lastUrl()).toBe("https://api.test/search?page=3");
  });

  test("returns body validation failure without calling fetch", async () => {
    const body = schema(() => ({ issues: [{ message: "body invalid", path: ["name"] }] }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { create: { method: "POST", path: "/users", body } } });
    await expect(client.create({ body: { name: 1 } })).resolves.toEqual({ ok: false, error: { type: "validation", message: "body invalid", issues: [{ message: "body invalid", path: ["name"] }], phase: "body" } });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("returns query validation failure without calling fetch", async () => {
    const query = schema(() => ({ issues: [{ message: "query invalid", path: ["page"] }] }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { search: { method: "GET", path: "/search", query } } });
    await expect(client.search({ query: { page: "not-a-number" } })).resolves.toEqual({ ok: false, error: { type: "validation", message: "query invalid", issues: [{ message: "query invalid", path: ["page"] }], phase: "query" } });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("returns timeout while async body validation remains pending", async () => {
    vi.useFakeTimers();
    const body = schema<{ name: string }>(() => new Promise<SchemaResult<{ name: string }>>(() => {}));
    const client = createClient({ baseUrl: "https://api.test", timeoutMs: 50, endpoints: { create: { method: "POST", path: "/users", body } } });
    const pending = client.create({ body: { name: "Ada" } });
    const result = Promise.race([
      pending,
      new Promise<{ guard: true }>((resolve) => setTimeout(() => resolve({ guard: true }), 51)),
    ]);

    await vi.advanceTimersByTimeAsync(51);

    const timeoutResult = await result;
    expect(timeoutResult).toEqual({
      ok: false,
      error: { type: "request", message: "Request timed out", cause: expect.any(DOMException) },
    });
    if ("guard" in timeoutResult) return;
    if (timeoutResult.ok) return;
    if (timeoutResult.error.type !== "request") return;
    expect(timeoutResult.error.cause).toBeInstanceOf(DOMException);
    expect((timeoutResult.error.cause as DOMException).name).toBe("TimeoutError");
    expect((timeoutResult.error.cause as DOMException).message).toBe("Request timed out");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("returns timeout while async query validation remains pending", async () => {
    vi.useFakeTimers();
    const query = schema<{ page: string }>(() => new Promise<SchemaResult<{ page: string }>>(() => {}));
    const client = createClient({ baseUrl: "https://api.test", timeoutMs: 50, endpoints: { search: { method: "GET", path: "/search", query } } });
    const pending = client.search({ query: { page: "1" } });
    const result = Promise.race([
      pending,
      new Promise<{ guard: true }>((resolve) => setTimeout(() => resolve({ guard: true }), 51)),
    ]);

    await vi.advanceTimersByTimeAsync(51);

    const timeoutResult = await result;
    expect(timeoutResult).toEqual({
      ok: false,
      error: { type: "request", message: "Request timed out", cause: expect.any(DOMException) },
    });
    if ("guard" in timeoutResult) return;
    if (timeoutResult.ok) return;
    if (timeoutResult.error.type !== "request") return;
    expect(timeoutResult.error.cause).toBeInstanceOf(DOMException);
    expect((timeoutResult.error.cause as DOMException).name).toBe("TimeoutError");
    expect((timeoutResult.error.cause as DOMException).message).toBe("Request timed out");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test.each(boundaryInputs)("rejects %s body input through the required body schema", async (_label, input) => {
    const body = boundarySchema("body");
    const client = createClient({ baseUrl: "https://api.test", endpoints: { create: { method: "POST", path: "/users", body } } });
    await expect(client.create({ body: input })).resolves.toEqual({
      ok: false,
      error: { type: "validation", message: "body boundary invalid", issues: [{ message: "body boundary invalid", path: [] }], phase: "body" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test.each(boundaryInputs)("rejects %s query input through the required query schema", async (_label, input) => {
    const query = boundarySchema("query");
    const client = createClient({ baseUrl: "https://api.test", endpoints: { search: { method: "GET", path: "/search", query } } });
    await expect(client.search({ query: input })).resolves.toEqual({
      ok: false,
      error: { type: "validation", message: "query boundary invalid", issues: [{ message: "query boundary invalid", path: [] }], phase: "query" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("parses a typed HTTP error body through the endpoint error schema", async () => {
    const error = schema<{ code: string }>((value) => ({ value: { code: String((value as { code: string }).code).toUpperCase() } }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users/1", error } } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "not_found" }, 404));
    await expect(client.get()).resolves.toEqual({ ok: false, error: { type: "http", status: 404, message: "HTTP 404", data: { code: "NOT_FOUND" } } });
  });

  test("returns error validation failure with error phase and HTTP status metadata when schema rejects", async () => {
    const error = schema(() => ({ issues: [{ message: "error body invalid", path: ["code"] }] }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users/1", error } } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 42 }), { status: 422, statusText: "Unprocessable Entity" }));
    const result = await client.get();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("validation");
    if (result.error.type !== "validation") return;
    expect(result.error.message).toBe("error body invalid");
    expect(result.error.issues).toEqual([{ message: "error body invalid", path: ["code"] }]);
    expect(result.error.phase).toBe("error");
    expect(result.error.status).toBe(422);
    expect({ ...result.error }).toEqual({
      type: "validation",
      message: "error body invalid",
      issues: [{ message: "error body invalid", path: ["code"] }],
      phase: "error",
      status: 422,
    });
  });

  test("returns parsed JSON data for HTTP failure when no error schema exists", async () => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users/1" } } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "RATE_LIMITED", retryAfter: 30 }), {
      status: 429,
      statusText: "Too Many Requests",
      headers: { "content-type": "application/json" },
    }));
    await expect(client.get()).resolves.toEqual({
      ok: false,
      error: { type: "http", status: 429, message: "Too Many Requests", data: { code: "RATE_LIMITED", retryAfter: 30 } },
    });
  });

  test("returns raw response text as HTTP error data when no error schema exists", async () => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users/1" } } });
    fetchMock.mockResolvedValueOnce(new Response("gone", { status: 410, statusText: "Gone" }));
    await expect(client.get()).resolves.toEqual({ ok: false, error: { type: "http", status: 410, message: "Gone", data: "gone" } });
  });

  test("returns error validation failure with error phase and HTTP status when configured error JSON is invalid", async () => {
    const error = schema<{ code: string }>((value) => ({ value: value as { code: string } }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users/1", error } } });
    fetchMock.mockResolvedValueOnce(new Response("{not-json", { status: 400, statusText: "Bad Request" }));
    const result = await client.get();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("validation");
    if (result.error.type !== "validation") return;
    expect(result.error.message).toBe("Response body is not valid JSON");
    expect(result.error.phase).toBe("error");
    expect(result.error.status).toBe(400);
  });

  test("rejects an empty configured HTTP error body even when the schema accepts undefined", async () => {
    const error = schema<undefined>((value) => ({ value: value as undefined }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users/1", error } } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 422, statusText: "Unprocessable Content" }));
    await expect(client.get()).resolves.toEqual({
      ok: false,
      error: { type: "validation", message: "Response body is not valid JSON", issues: [], phase: "error", status: 422 },
    });
  });

  test.each([
    [500, "Internal Server Error"],
    [503, "Service Unavailable"],
  ])("returns %s 5xx response as an HTTP failure", async (status, statusText) => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users/1" } } });
    fetchMock.mockResolvedValueOnce(new Response("server failure", { status, statusText }));
    await expect(client.get()).resolves.toEqual({ ok: false, error: { type: "http", status, message: statusText, data: "server failure" } });
  });

  test("returns an invalid runtime HTTP method as a request error without calling fetch", async () => {
    const client = createClient({
      baseUrl: "https://api.test",
      endpoints: { invalid: { method: "INVALID" as never, path: "/users" } },
    });
    await expect(client.invalid()).resolves.toEqual({ ok: false, error: { type: "request", message: "Invalid HTTP method: INVALID" } });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("accepts an empty successful response as undefined when no response schema exists", async () => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { ping: { method: "POST", path: "/ping" } } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(client.ping()).resolves.toEqual({ ok: true, value: undefined });
  });

  test("treats an endpoint without a response schema as an optional response", async () => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { ping: { method: "GET", path: "/ping" } } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(client.ping()).resolves.toEqual({ ok: true, value: undefined });
  });

  test("returns a validation failure when a required response schema receives an empty body", async () => {
    const response = schema<{ id: number }>(() => ({ value: { id: 1 } }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { ping: { method: "GET", path: "/ping", response } } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await client.ping();
    expect(result).toEqual({
      ok: false,
      error: { type: "validation", message: "Response body is empty", issues: [], phase: "response" },
    });
  });

  test("accepts a 204 response as undefined", async () => {
    const client = createClient({ baseUrl: "https://api.test", endpoints: { remove: { method: "DELETE", path: "/users/1" } } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(client.remove()).resolves.toEqual({ ok: true, value: undefined });
  });

  test("returns response JSON parse failures as validation errors", async () => {
    const response = schema(() => ({ value: "unused" }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users", response } } });
    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    const result = await client.get();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation");
      expect(result.error.message).toBe("Response body is not valid JSON");
    }
  });

  test("returns response schema failures as validation errors", async () => {
    const response = schema(() => ({ issues: [{ message: "response invalid", path: ["id"] }] }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users", response } } });
    await expect(client.get()).resolves.toEqual({ ok: false, error: { type: "validation", message: "response invalid", issues: [{ message: "response invalid", path: ["id"] }], phase: "response" } });
  });

  test("returns invalid URL as a request error without calling fetch", async () => {
    const client = createClient({ baseUrl: "not a URL", endpoints: { get: { method: "GET", path: "/users" } } });
    await expect(client.get()).resolves.toEqual({ ok: false, error: { type: "request", message: "Invalid URL" } });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("returns body serialization failures as request errors", async () => {
    const body = schema<Record<string, unknown>>((value) => ({ value: value as Record<string, unknown> }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { create: { method: "POST", path: "/users", body } } });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = await client.create({ body: circular });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("request");
      expect(result.error.message).toBe("Failed to serialize request body");
      if ("cause" in result.error) expect(result.error.cause).toBeInstanceOf(Error);
    }
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("returns fetch rejection as a network error with its cause", async () => {
    const networkFailure = new Error("offline");
    fetchMock.mockRejectedValueOnce(networkFailure);
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/users" } } });
    await expect(client.get()).resolves.toEqual({ ok: false, error: { type: "network", message: "offline", cause: networkFailure } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns timeout as a request error and aborts fetch", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_input: FetchInput, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal ?? undefined;
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const client = createClient({ baseUrl: "https://api.test", timeoutMs: 50, endpoints: { get: { method: "GET", path: "/slow" } } });
    const pending = client.get();
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result).toEqual({ ok: false, error: { type: "request", message: "Request timed out", cause: requestSignal?.reason } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(requestSignal?.reason).toBeInstanceOf(DOMException);
    expect((requestSignal?.reason as DOMException).name).toBe("TimeoutError");
    expect((requestSignal?.reason as DOMException).message).toBe("Request timed out");
  });

  test("returns timeout when an injected fetch ignores its abort signal and never settles", async () => {
    vi.useFakeTimers();
    const configuredFetch = vi.fn(() => new Promise<Response>(() => {}));
    const client = createClient({
      baseUrl: "https://api.test",
      fetch: configuredFetch,
      timeoutMs: 50,
      endpoints: { get: { method: "GET", path: "/slow" } },
    });
    const pending = client.get();
    const result = Promise.race([
      pending,
      new Promise<{ guard: true }>((resolve) => setTimeout(() => resolve({ guard: true }), 51)),
    ]);
    await vi.advanceTimersByTimeAsync(51);
    await expect(result).resolves.toEqual({
      ok: false,
      error: { type: "request", message: "Request timed out", cause: expect.any(DOMException) },
    });
    expect(configuredFetch).toHaveBeenCalledTimes(1);
  });

  test("returns timeout when a configured HTTP error body remains pending", async () => {
    vi.useFakeTimers();
    const error = schema<{ code: string }>((value) => ({ value: value as { code: string } }));
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 504,
      statusText: "Gateway Timeout",
      text: () => new Promise<string>(() => {}),
    } as Response);
    const client = createClient({ baseUrl: "https://api.test", timeoutMs: 50, endpoints: { get: { method: "GET", path: "/slow", error } } });
    const pending = client.get();
    await vi.advanceTimersByTimeAsync(0);
    const result = Promise.race([
      pending,
      new Promise<{ guard: true }>((resolve) => setTimeout(() => resolve({ guard: true }), 51)),
    ]);
    await vi.advanceTimersByTimeAsync(51);
    await expect(result).resolves.toEqual({
      ok: false,
      error: { type: "request", message: "Request timed out", cause: expect.any(DOMException) },
    });
  });

  test("returns caller abort as a request error and preserves abort cause", async () => {
    const controller = new AbortController();
    const abortReason = new Error("cancelled by caller");
    fetchMock.mockImplementationOnce((_input: FetchInput, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/slow" } } });
    const pending = client.get({ request: { signal: controller.signal } });
    controller.abort(abortReason);
    await expect(pending).resolves.toEqual({ ok: false, error: { type: "request", message: "cancelled by caller", cause: abortReason } });
  });

  test("does not invoke fetch when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    const abortReason = new Error("cancelled before request");
    controller.abort(abortReason);
    const configuredFetch = vi.fn(async () => jsonResponse({ ignored: true }));
    const client = createClient({
      baseUrl: "https://api.test",
      fetch: configuredFetch,
      endpoints: { get: { method: "GET", path: "/users" } },
    });
    await expect(client.get({ request: { signal: controller.signal } })).resolves.toEqual({
      ok: false,
      error: { type: "request", message: "cancelled before request", cause: abortReason },
    });
    expect(configuredFetch).toHaveBeenCalledTimes(0);
  });

  test("does not invoke pending body validation or fetch when the caller signal is already aborted", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const abortReason = new Error("cancelled before body validation");
    controller.abort(abortReason);
    const body = vi.fn(() => new Promise<SchemaResult<{ name: string }>>(() => {}));
    const client = createClient({
      baseUrl: "https://api.test",
      endpoints: { create: { method: "POST", path: "/users", body: schema(body) } },
    });

    const pending = client.create({ body: { name: "Ada" }, request: { signal: controller.signal } });
    const result = Promise.race([
      pending,
      new Promise<{ guard: true }>((resolve) => setTimeout(() => resolve({ guard: true }), 1)),
    ]);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({
      ok: false,
      error: { type: "request", message: "cancelled before body validation", cause: abortReason },
    });
    expect(body).toHaveBeenCalledTimes(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("does not invoke pending query validation or fetch when the caller signal is already aborted", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const abortReason = new Error("cancelled before query validation");
    controller.abort(abortReason);
    const query = vi.fn(() => new Promise<SchemaResult<{ page: string }>>(() => {}));
    const client = createClient({
      baseUrl: "https://api.test",
      endpoints: { search: { method: "GET", path: "/search", query: schema(query) } },
    });

    const pending = client.search({ query: { page: "1" }, request: { signal: controller.signal } });
    const result = Promise.race([
      pending,
      new Promise<{ guard: true }>((resolve) => setTimeout(() => resolve({ guard: true }), 1)),
    ]);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({
      ok: false,
      error: { type: "request", message: "cancelled before query validation", cause: abortReason },
    });
    expect(query).toHaveBeenCalledTimes(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("returns caller abort when an HTTP error body remains pending", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const abortReason = new Error("cancelled during body read");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 499,
      statusText: "Client Closed Request",
      text: () => new Promise<string>(() => {}),
    } as Response);
    const client = createClient({ baseUrl: "https://api.test", endpoints: { get: { method: "GET", path: "/slow" } } });
    const pending = client.get({ request: { signal: controller.signal } });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(abortReason);
    const result = Promise.race([
      pending,
      new Promise<{ guard: true }>((resolve) => setTimeout(() => resolve({ guard: true }), 1)),
    ]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ ok: false, error: { type: "request", message: "cancelled during body read", cause: abortReason } });
  });

  test("uses configured fetch implementation instead of global fetch", async () => {
    const configuredFetch = vi.fn(async () => jsonResponse({ configured: true }));
    const client = createClient({ baseUrl: "https://api.test", fetch: configuredFetch, endpoints: { get: { method: "GET", path: "/users" } } });
    await client.get();
    expect(configuredFetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
