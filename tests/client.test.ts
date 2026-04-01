import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { defineClient, unwrapOrThrow, unwrapOrDefault } from "../src/index.ts";
import type { AuthConfig, RuxResult, RuxError, ValidPath } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof createFetchMock>;

function createFetchMock() {
  const calls: { url: string; init: RequestInit }[] = [];
  let handler: (url: string, init: RequestInit) => Response | Promise<Response> = () =>
    new Response("null", { status: 200 });

  const mock = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const resolved = init ?? {};
    calls.push({ url, init: resolved });
    return handler(url, resolved);
  };

  return {
    calls,
    mock: mock as typeof fetch,
    lastCall() {
      const c = calls[calls.length - 1];
      if (!c) throw new Error("No fetch calls recorded");
      return c;
    },
    firstCall() {
      const c = calls[0];
      if (!c) throw new Error("No fetch calls recorded");
      return c;
    },
    respondWith(h: (url: string, init: RequestInit) => Response | Promise<Response>) {
      handler = h;
    },
    respondJson(data: unknown, status = 200) {
      handler = () => new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
    respondError(status: number, body: string) {
      handler = () => new Response(body, { status, statusText: body });
    },
    respondNetworkError(error: unknown) {
      handler = () => { throw error; };
    },
  };
}

function headersOf(call: { init: RequestInit }): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

beforeEach(() => {
  fetchMock = createFetchMock();
  globalThis.fetch = fetchMock.mock;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// 4. unwrapOrThrow
// ---------------------------------------------------------------------------

describe("unwrapOrThrow", () => {
  test("UOT-01: ok result returns value", () => {
    const result: RuxResult<number> = { ok: true, value: 42 };
    expect(unwrapOrThrow(result)).toBe(42);
  });

  test("UOT-02: error result throws the error object", () => {
    const error: RuxError = { type: "http", message: "Not Found", status: 404 };
    const result: RuxResult<number> = { ok: false, error };
    try {
      unwrapOrThrow(result);
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBe(error);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. unwrapOrDefault
// ---------------------------------------------------------------------------

describe("unwrapOrDefault", () => {
  test("UOD-01: ok result returns value, ignores fallback", () => {
    const result: RuxResult<string> = { ok: true, value: "real" };
    expect(unwrapOrDefault(result, "default")).toBe("real");
  });

  test("UOD-02: error result returns fallback", () => {
    const result: RuxResult<string> = {
      ok: false,
      error: { type: "network", message: "offline" },
    };
    expect(unwrapOrDefault(result, "default")).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// 6. defineClient
// ---------------------------------------------------------------------------

describe("defineClient", () => {
  // -----------------------------------------------------------------------
  // 6.1 Client initialization
  // -----------------------------------------------------------------------

  describe("initialization", () => {
    test("DC-INIT-01: minimal config creates client with endpoint keys", () => {
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getUser: { method: "GET", path: "/user", response: "string" },
        },
      });
      expect(typeof client.getUser).toBe("function");
    });

    test("DC-INIT-02: default errorMode is 'result'", async () => {
      fetchMock.respondJson("hello");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getUser: { method: "GET", path: "/user", response: "string" },
        },
      });
      const result = await client.getUser();
      expect(result).toEqual({ ok: true, value: "hello" });
    });

    test("DC-INIT-03: errorMode 'throw' returns unwrapped value on success", async () => {
      fetchMock.respondJson("hello");
      const client = defineClient({
        baseUrl: "https://api.test",
        errorMode: "throw",
        endpoints: {
          getUser: { method: "GET", path: "/user", response: "string" },
        },
      });
      const value = await client.getUser();
      expect(value).toBe("hello");
    });

    test("DC-INIT-04: errorMode 'fallback' requires per-call defaultValue on error", async () => {
      fetchMock.respondError(500, "Server Error");
      const client = defineClient({
        baseUrl: "https://api.test",
        errorMode: "fallback",
        endpoints: {
          getUser: { method: "GET", path: "/user", response: "string" },
        },
      });
      const value = await client.getUser({ defaultValue: "fallback-result" });
      expect(value).toBe("fallback-result");
    });
  });

  // -----------------------------------------------------------------------
  // 6.2 Auth header resolution
  // -----------------------------------------------------------------------

  describe("auth headers", () => {
    const makeClient = (auth: AuthConfig) =>
      defineClient({
        baseUrl: "https://api.test",
        auth,
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });

    test("DC-AUTH-01: bearer auth with token", async () => {
      fetchMock.respondJson("ok");
      const client = makeClient({ type: "bearer", token: "tok123" });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["authorization"]).toBe("Bearer tok123");
    });

    test("DC-AUTH-02: bearer auth without token -> no authorization header", async () => {
      fetchMock.respondJson("ok");
      const client = makeClient({ type: "bearer" });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["authorization"]).toBeUndefined();
    });

    test("DC-AUTH-03: basic auth with credentials", async () => {
      fetchMock.respondJson("ok");
      const client = makeClient({
        type: "basic",
        credentials: { username: "u", password: "p" },
      });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["authorization"]).toBe(`Basic ${btoa("u:p")}`);
    });

    test("DC-AUTH-04: basic auth without credentials -> no header", async () => {
      fetchMock.respondJson("ok");
      const client = makeClient({ type: "basic" });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["authorization"]).toBeUndefined();
    });

    test("DC-AUTH-05: custom auth with header", async () => {
      fetchMock.respondJson("ok");
      const client = makeClient({
        type: "custom",
        header: { name: "x-api-key", value: "secret" },
      });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["x-api-key"]).toBe("secret");
    });

    test("DC-AUTH-06: custom auth without header -> no extra header", async () => {
      fetchMock.respondJson("ok");
      const client = makeClient({ type: "custom" });
      await client.ping();
      expect(Object.keys(headersOf(fetchMock.firstCall()))).not.toContain("x-api-key");
    });

    test("DC-AUTH-07: no auth config -> only default headers", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });
      await client.ping();
      const h = headersOf(fetchMock.firstCall());
      expect(h["content-type"]).toBe("application/json");
      expect(h["authorization"]).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 6.3 Header merging order
  // -----------------------------------------------------------------------

  describe("header merging", () => {
    test("DC-HDR-01: endpoint headers override client headers", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        headers: { "x-custom": "client" },
        endpoints: {
          ping: {
            method: "GET",
            path: "/ping",
            response: "string",
            headers: { "x-custom": "endpoint" },
          },
        },
      });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["x-custom"]).toBe("endpoint");
    });

    test("DC-HDR-02: call-level headers override both", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        headers: { "x-custom": "client" },
        endpoints: {
          ping: {
            method: "GET",
            path: "/ping",
            response: "string",
            headers: { "x-custom": "endpoint" },
          },
        },
      });
      await client.ping({ headers: { "x-custom": "call" } });
      expect(headersOf(fetchMock.firstCall())["x-custom"]).toBe("call");
    });

    test("DC-HDR-03: content-type defaults to application/json", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["content-type"]).toBe("application/json");
    });

    test("DC-HDR-04: client headers override auth headers", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        auth: { type: "bearer", token: "t" },
        headers: { authorization: "override" },
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["authorization"]).toBe("override");
    });
  });

  // -----------------------------------------------------------------------
  // 6.4 URL building
  // -----------------------------------------------------------------------

  describe("URL building", () => {
    const makeClient = <const P extends ValidPath>(path: P) =>
      defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: { method: "GET", path, response: "string" },
        },
      });

    test("DC-URL-01: simple path", async () => {
      fetchMock.respondJson("ok");
      await makeClient("/users").ep();
      expect(fetchMock.firstCall().url).toBe("https://api.test/users");
    });

    test("DC-URL-02: path params substitution", async () => {
      fetchMock.respondJson("ok");
      await makeClient("/users/:id[string]").ep({ params: { id: "42" } });
      expect(fetchMock.firstCall().url).toBe("https://api.test/users/42");
    });

    test("DC-URL-03: path params are URI-encoded", async () => {
      fetchMock.respondJson("ok");
      await makeClient("/users/:id[string]").ep({ params: { id: "hello world" } });
      expect(fetchMock.firstCall().url).toContain("hello%20world");
    });

    test("DC-URL-04: query params appended", async () => {
      fetchMock.respondJson("ok");
      await makeClient("/users").ep({ query: { page: "1", limit: "10" } });
      const url = new URL(fetchMock.firstCall().url);
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("limit")).toBe("10");
    });

    test("DC-URL-05: path params + query combined", async () => {
      fetchMock.respondJson("ok");
      await makeClient("/users/:id[string]/posts").ep({
        params: { id: "5" },
        query: { sort: "date" },
      });
      const url = new URL(fetchMock.firstCall().url);
      expect(url.pathname).toBe("/users/5/posts");
      expect(url.searchParams.get("sort")).toBe("date");
    });

    test("DC-URL-06: multiple path params", async () => {
      fetchMock.respondJson("ok");
      await makeClient("/orgs/:orgId[string]/users/:userId[string]").ep({
        params: { orgId: "abc", userId: "def" },
      });
      expect(fetchMock.firstCall().url).toBe("https://api.test/orgs/abc/users/def");
    });

    test("DC-URL-07: empty path", async () => {
      fetchMock.respondJson("ok");
      await makeClient("").ep();
      expect(fetchMock.firstCall().url).toBe("https://api.test/");
    });
  });

  // -----------------------------------------------------------------------
  // 6.5 Request body handling
  // -----------------------------------------------------------------------

  describe("request body", () => {
    test("DC-BODY-01: POST with body is JSON-stringified", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          createUser: {
            method: "POST",
            path: "/users",
            response: "string",
            body: { type: "object", properties: { name: "string" } },
          },
        },
      });
      await client.createUser({ body: { name: "Ada" } });
      expect(fetchMock.firstCall().init.body).toBe('{"name":"Ada"}');
    });

    test("DC-BODY-02: POST with body failing schema -> validation error, fetch not called", async () => {
      let fetchCalled = false;
      fetchMock.respondWith(() => {
        fetchCalled = true;
        return new Response('"ok"', { status: 200 });
      });
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          createUser: {
            method: "POST",
            path: "/users",
            response: "string",
            body: { type: "object", properties: { name: "string" } },
          },
        },
      });
      const result = await client.createUser({
        body: { name: 123 } as unknown as { name: string },
      });
      expect(result).toEqual({
        ok: false,
        error: {
          type: "validation",
          message: "Request body failed schema validation",
        },
      });
      expect(fetchCalled).toBe(false);
    });

    test("DC-BODY-03: POST without body schema sends body as-is", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          createUser: {
            method: "POST",
            path: "/users",
            response: "string",
          },
        },
      });
      await client.createUser({ body: { any: "thing" } });
      expect(fetchMock.firstCall().init.body).toBe('{"any":"thing"}');
    });

    test("DC-BODY-05: body undefined with body schema defined skips validation", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          createUser: {
            method: "POST",
            path: "/users",
            response: "string",
            body: { type: "object", properties: { name: "string" } },
          },
        },
      });
      const result = await client.createUser({});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("ok");
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6.6 Response handling
  // -----------------------------------------------------------------------

  describe("response handling", () => {
    test("DC-RESP-01: 200 with valid JSON matching schema -> ok result", async () => {
      fetchMock.respondJson({ id: 1 });
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getItem: {
            method: "GET",
            path: "/item",
            response: { type: "object", properties: { id: "number" } },
          },
        },
      });
      const result = await client.getItem();
      expect(result).toEqual({ ok: true, value: { id: 1 } });
    });

    test("DC-RESP-02: 200 with JSON that fails schema -> validation error", async () => {
      fetchMock.respondJson({ id: "not-a-number" });
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getItem: {
            method: "GET",
            path: "/item",
            response: { type: "object", properties: { id: "number" } },
          },
        },
      });
      const result = await client.getItem();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("DC-RESP-03: 200 with non-JSON response -> validation error", async () => {
      fetchMock.respondWith(() => new Response("not json", { status: 200 }));
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getItem: { method: "GET", path: "/item", response: "string" },
        },
      });
      const result = await client.getItem();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("validation");
        expect(result.error.message).toBe("Response body is not valid JSON");
        expect(result.error.cause instanceof SyntaxError).toBe(true);
      }
    });

    test("DC-RESP-04: non-OK status (404) -> http error with body text", async () => {
      fetchMock.respondError(404, "Not Found");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getItem: { method: "GET", path: "/item", response: "string" },
        },
      });
      const result = await client.getItem();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("http");
        expect(result.error.status).toBe(404);
        expect(result.error.message).toBe("Not Found");
      }
    });

    test("DC-RESP-05: non-OK status where response.text() throws -> uses statusText", async () => {
      fetchMock.respondWith(() => {
        const resp = new Response(null, { status: 500, statusText: "Internal Server Error" });
        Object.defineProperty(resp, "text", {
          value: () => { throw new Error("text() failed"); },
        });
        return resp;
      });
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getItem: { method: "GET", path: "/item", response: "string" },
        },
      });
      const result = await client.getItem();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("http");
        expect(result.error.status).toBe(500);
        expect(result.error.message).toBe("Internal Server Error");
      }
    });

    test("DC-RESP-06: fetch throws Error -> network error", async () => {
      fetchMock.respondNetworkError(new Error("DNS fail"));
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getItem: { method: "GET", path: "/item", response: "string" },
        },
      });
      const result = await client.getItem();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("network");
        expect(result.error.message).toBe("DNS fail");
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    test("DC-RESP-07: fetch throws non-Error -> network error with generic message", async () => {
      fetchMock.respondNetworkError("string error");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getItem: { method: "GET", path: "/item", response: "string" },
        },
      });
      const result = await client.getItem();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("network");
        expect(result.error.message).toBe("Network error");
        expect(result.error.cause).toBe("string error");
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6.7 Error mode resolution (per-call override)
  // -----------------------------------------------------------------------

  describe("error mode resolution", () => {
    const makeResultClient = () =>
      defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });

    const makeThrowClient = () =>
      defineClient({
        baseUrl: "https://api.test",
        errorMode: "throw",
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });

    test("DC-MODE-01: client 'result', no override -> returns RuxResult", async () => {
      fetchMock.respondJson("pong");
      const result = await makeResultClient().ping();
      expect(result).toEqual({ ok: true, value: "pong" });
    });

    test("DC-MODE-02: client 'result', per-call 'throw' -> returns value on success", async () => {
      fetchMock.respondJson("pong");
      const value = await makeResultClient().ping({ errorMode: "throw" });
      expect(value).toBe("pong");
    });

    test("DC-MODE-02b: client 'result', per-call 'throw' -> throws on error", async () => {
      fetchMock.respondError(500, "fail");
      try {
        await makeResultClient().ping({ errorMode: "throw" });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.type).toBe("http");
      }
    });

    test("DC-MODE-03: client 'result', per-call 'fallback' -> returns default on error", async () => {
      fetchMock.respondError(500, "fail");
      const value = await makeResultClient().ping({
        errorMode: "fallback",
        defaultValue: "safe",
      });
      expect(value).toBe("safe");
    });

    test("DC-MODE-04: client 'throw', per-call 'result' -> returns RuxResult", async () => {
      fetchMock.respondJson("pong");
      const result = await makeThrowClient().ping({ errorMode: "result" });
      expect(result).toEqual({ ok: true, value: "pong" });
    });

    test("DC-MODE-05: client 'throw', no override -> throws on error", async () => {
      fetchMock.respondError(500, "fail");
      try {
        await makeThrowClient().ping();
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.type).toBe("http");
      }
    });

    test("DC-MODE-06: client 'fallback', per-call defaultValue -> returns default on error", async () => {
      fetchMock.respondError(500, "fail");
      const client = defineClient({
        baseUrl: "https://api.test",
        errorMode: "fallback",
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });
      const value = await client.ping({ defaultValue: "safe" });
      expect(value).toBe("safe");
    });

    test("DC-MODE-07: client 'fallback' without defaultValue -> rejected promise", async () => {
      fetchMock.respondJson("pong");
      const client = defineClient({
        baseUrl: "https://api.test",
        errorMode: "fallback",
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });
      await expect(
        (client.ping as (opts?: object) => Promise<unknown>)({}),
      ).rejects.toThrow('defaultValue is required when errorMode is "fallback"');
    });
  });

  // -----------------------------------------------------------------------
  // 6.8 Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    test("DC-EDGE-01: multiple endpoints on the same client", () => {
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          getUser: { method: "GET", path: "/user", response: "string" },
          createUser: { method: "POST", path: "/user", response: "string" },
          deleteUser: { method: "DELETE", path: "/user/:id[string]", response: "string" },
        },
      });
      expect(typeof client.getUser).toBe("function");
      expect(typeof client.createUser).toBe("function");
      expect(typeof client.deleteUser).toBe("function");
    });

    test("DC-EDGE-02: concurrent calls resolve independently", async () => {
      let callCount = 0;
      fetchMock.respondWith(() => {
        callCount++;
        return new Response(JSON.stringify(`response-${callCount}`), { status: 200 });
      });
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          a: { method: "GET", path: "/a", response: "string" },
          b: { method: "GET", path: "/b", response: "string" },
        },
      });
      const [ra, rb] = await Promise.all([client.a(), client.b()]);
      expect(ra.ok).toBe(true);
      expect(rb.ok).toBe(true);
      expect(fetchMock.calls.length).toBe(2);
    });

    test("DC-EDGE-03: empty endpoints object -> client has no methods", () => {
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {},
      });
      expect(Object.keys(client).length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Exploratory / Edge Cases (client-related)
  // -----------------------------------------------------------------------

  describe("exploratory (client)", () => {
    test("EXP-06: baseUrl with trailing slash vs without", async () => {
      fetchMock.respondJson("ok");
      const clientSlash = defineClient({
        baseUrl: "https://api.test/",
        endpoints: {
          ep: { method: "GET", path: "/users", response: "string" },
        },
      });
      await clientSlash.ep();
      const url1 = fetchMock.firstCall().url;

      fetchMock.calls.length = 0;

      const clientNoSlash = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: { method: "GET", path: "/users", response: "string" },
        },
      });
      await clientNoSlash.ep();
      const url2 = fetchMock.firstCall().url;

      expect(url1).toBe(url2);
    });

    test("EXP-07: duplicate path param -> all occurrences replaced", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: {
            method: "GET",
            path: "/:id[string]/sub/:id[string]",
            response: "string",
          },
        },
      });
      await client.ep({ params: { id: "42" } });
      const url = fetchMock.firstCall().url;
      expect(url).toContain("/42/sub/42");
    });

    test("EXP-07b: triple same path param replaced everywhere", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: {
            method: "GET",
            path: "/:id[string]/a/:id[string]/b/:id[string]",
            response: "string",
          },
        },
      });
      await client.ep({ params: { id: "7" } });
      expect(fetchMock.firstCall().url).toBe("https://api.test/7/a/7/b/7");
    });

    test("EXP-10: unwrapOrThrow throws RuxError directly, not Error instance", () => {
      const error: RuxError = { type: "http", message: "fail", status: 500 };
      try {
        unwrapOrThrow({ ok: false, error });
        expect(true).toBe(false);
      } catch (e) {
        expect(e).not.toBeInstanceOf(Error);
        expect(e).toBe(error);
      }
    });

    test("EXP-11: auth credentials with special characters (colon in password)", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        auth: {
          type: "basic",
          credentials: { username: "user", password: "p:a$$w0rd" },
        },
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });
      await client.ping();
      expect(headersOf(fetchMock.firstCall())["authorization"]).toBe(`Basic ${btoa("user:p:a$$w0rd")}`);
    });

    test("EXP-12: query param values with special characters", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: { method: "GET", path: "/search", response: "string" },
        },
      });
      await client.ep({ query: { q: "hello world&foo=bar" } });
      const url = new URL(fetchMock.firstCall().url);
      expect(url.searchParams.get("q")).toBe("hello world&foo=bar");
    });

    test("EXP-16: empty string as path param value", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: { method: "GET", path: "/users/:id[string]", response: "string" },
        },
      });
      await client.ep({ params: { id: "" } });
      expect(fetchMock.firstCall().url).toBe("https://api.test/users/");
    });

    test("EXP-17: no auth, no headers -> only content-type present", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ping: { method: "GET", path: "/ping", response: "string" },
        },
      });
      await client.ping();
      const h = headersOf(fetchMock.firstCall());
      expect(Object.keys(h)).toEqual(["content-type"]);
      expect(h["content-type"]).toBe("application/json");
    });

    test("DC-QP-01: queryParams required + extra keys in URL", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          search: {
            method: "GET",
            path: "/search",
            response: "string",
            queryParams: {
              q: { type: "string", required: true },
              limit: { type: "number", required: false },
            },
          },
        },
      });
      await client.search({
        query: { q: "hi", limit: 3, extra: "x" },
      });
      const url = new URL(fetchMock.firstCall().url);
      expect(url.searchParams.get("q")).toBe("hi");
      expect(url.searchParams.get("limit")).toBe("3");
      expect(url.searchParams.get("extra")).toBe("x");
    });

    test("DC-QP-02: queryParams array uses repeated keys", async () => {
      fetchMock.respondJson("ok");
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: {
            method: "GET",
            path: "/items",
            response: "string",
            queryParams: {
              id: { type: "array", items: "string", required: true },
            },
          },
        },
      });
      await client.ep({ query: { id: ["a", "b"] } });
      const url = new URL(fetchMock.firstCall().url);
      expect(url.searchParams.getAll("id")).toEqual(["a", "b"]);
    });

    test("DC-QP-03: invalid query fails validation before fetch", async () => {
      let fetchCalled = false;
      fetchMock.respondWith(() => {
        fetchCalled = true;
        return new Response('"ok"', { status: 200 });
      });
      const client = defineClient({
        baseUrl: "https://api.test",
        endpoints: {
          ep: {
            method: "GET",
            path: "/x",
            response: "string",
            queryParams: { n: { type: "number", required: true } },
          },
        },
      });
      const result = await client.ep({ query: { n: "not-a-number" } as unknown as { n: number } });
      expect(result).toEqual({
        ok: false,
        error: {
          type: "validation",
          message: "Query parameters failed schema validation",
        },
      });
      expect(fetchCalled).toBe(false);
    });
  });
});
