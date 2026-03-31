/**
 * Manual QA against the built package (`import "rux"` → dist).
 * Run: `bun run qa:manual` or `bun test .local/text.ts` after `bun run build`.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  defineClient,
  unwrapOrThrow,
  unwrapOrDefault,
  validate,
  validateResponse,
  handleValidation,
} from "rux";
import type {
  AuthConfig,
  RuxResult,
  RuxError,
  ValidPath,
  SchemaToType,
  ExtractPathParams,
  CallOptions,
  QueryParamsToType,
  Infer,
  ModeReturn,
  Schema,
} from "rux";

// ---------------------------------------------------------------------------
// Compile-time assertions (types from `rux`)
// ---------------------------------------------------------------------------

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

describe("QA types (compile-time)", () => {
  test("QA-T-01: Infer<string> = string", () => {
    type _T = Expect<Equal<Infer<"string">, string>>;
  });

  test("QA-T-02: ExtractPathParams bracket path", () => {
    type _T = Expect<Equal<ExtractPathParams<"/users/:id[string]">, "id">>;
  });

  test("QA-T-03: ExtractPathParams plain segment has no keys", () => {
    type _T = Expect<Equal<ExtractPathParams<"/users/:id">, never>>;
  });

  test("QA-T-04: QueryParamsToType required and optional", () => {
    type Q = {
      readonly a: { readonly type: "string"; readonly required: true };
      readonly b: { readonly type: "number"; readonly required: false };
    };
    type Got = QueryParamsToType<Q>;
    type _T1 = Expect<Equal<Got["a"], string>>;
    type HasOptionalB = undefined extends Got["b"] ? true : false;
    type _T2 = Expect<Equal<HasOptionalB, true>>;
  });

  test("QA-T-05: CallOptions GET with bracket params requires params", () => {
    type Opts = CallOptions<string, "GET", "/u/:id[string]">;
    type HasParams = "params" extends keyof Opts ? true : false;
    type _T = Expect<Equal<HasParams, true>>;
  });

  test("QA-T-06: ModeReturn result vs throw", () => {
    type _T1 = Expect<Equal<ModeReturn<string, "result">, RuxResult<string>>>;
    type _T2 = Expect<Equal<ModeReturn<string, "throw">, string>>;
  });

  test("QA-T-07: nested response SchemaToType", () => {
    type S = {
      readonly type: "object";
      readonly properties: {
        readonly id: "string";
        readonly address: {
          readonly type: "array";
          readonly items: {
            readonly type: "object";
            readonly properties: {
              readonly street: "string";
              readonly city: "string";
            };
          };
        };
      };
    };
    type R = SchemaToType<S>;
    type _T = Expect<Equal<R["address"][number]["city"], string>>;
  });
});

// ---------------------------------------------------------------------------
// Fetch mock
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
      handler = () =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "content-type": "application/json" },
        });
    },
    respondError(status: number, body: string) {
      handler = () => new Response(body, { status, statusText: body });
    },
    respondNetworkError(error: unknown) {
      handler = () => {
        throw error;
      };
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
// QA-HP: happy paths — helpers & client
// ---------------------------------------------------------------------------

describe("QA-HP unwrapOrThrow / unwrapOrDefault", () => {
  test("QA-HP-UOT-01: ok unwrapOrThrow", () => {
    const result: RuxResult<number> = { ok: true, value: 42 };
    expect(unwrapOrThrow(result)).toBe(42);
  });

  test("QA-HP-UOT-02: unwrapOrThrow throws RuxError object", () => {
    const error: RuxError = { type: "http", message: "x", status: 404 };
    try {
      unwrapOrThrow({ ok: false, error });
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBe(error);
      expect(e).not.toBeInstanceOf(Error);
    }
  });

  test("QA-HP-UOD-01: unwrapOrDefault", () => {
    expect(unwrapOrDefault({ ok: true, value: "a" }, "b")).toBe("a");
    expect(
      unwrapOrDefault({ ok: false, error: { type: "network", message: "m" } }, "b"),
    ).toBe("b");
  });
});

describe("QA-HP defineClient initialization & modes", () => {
  test("QA-HP-INIT-01: default result mode", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ping: { method: "GET", path: "/p", response: "string" } },
    });
    expect(await client.ping()).toEqual({ ok: true, value: "ok" });
  });

  test("QA-HP-INIT-02: throw mode unwraps", async () => {
    fetchMock.respondJson("x");
    const client = defineClient({
      baseUrl: "https://api.test",
      errorMode: "throw",
      endpoints: { ping: { method: "GET", path: "/p", response: "string" } },
    });
    expect(await client.ping()).toBe("x");
  });

  test("QA-HP-INIT-03: fallback on error", async () => {
    fetchMock.respondError(500, "e");
    const client = defineClient({
      baseUrl: "https://api.test",
      errorMode: "fallback",
      endpoints: { ping: { method: "GET", path: "/p", response: "string" } },
    });
    expect(await client.ping({ defaultValue: "fb" })).toBe("fb");
  });

  test("QA-HP-MODE: per-call overrides", async () => {
    fetchMock.respondJson("pong");
    const c = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ping: { method: "GET", path: "/p", response: "string" } },
    });
    expect(await c.ping({ errorMode: "throw" })).toBe("pong");
    fetchMock.respondError(400, "bad");
    expect(
      await c.ping({ errorMode: "fallback", defaultValue: "z" }),
    ).toBe("z");
    fetchMock.respondJson("q");
    expect(await c.ping({ errorMode: "result" })).toEqual({ ok: true, value: "q" });
  });

  test("QA-HP-MODE-07: fallback client without defaultValue rejects", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      errorMode: "fallback",
      endpoints: { ping: { method: "GET", path: "/p", response: "string" } },
    });
    await expect((client.ping as (o?: object) => Promise<unknown>)({})).rejects.toThrow(
      'defaultValue is required when errorMode is "fallback"',
    );
  });
});

describe("QA-HP auth & headers", () => {
  const makeClient = (auth: AuthConfig) =>
    defineClient({
      baseUrl: "https://api.test",
      auth,
      endpoints: { ping: { method: "GET", path: "/ping", response: "string" } },
    });

  test("QA-HP-AUTH bearer/basic/custom", async () => {
    fetchMock.respondJson("ok");
    await makeClient({ type: "bearer", token: "t" }).ping();
    expect(headersOf(fetchMock.firstCall())["authorization"]).toBe("Bearer t");
    fetchMock.calls.length = 0;
    await makeClient({ type: "basic", credentials: { username: "u", password: "p" } }).ping();
    expect(headersOf(fetchMock.firstCall())["authorization"]).toBe(`Basic ${btoa("u:p")}`);
    fetchMock.calls.length = 0;
    await makeClient({ type: "custom", header: { name: "x-k", value: "v" } }).ping();
    expect(headersOf(fetchMock.firstCall())["x-k"]).toBe("v");
  });

  test("QA-HP-AUTH missing credentials omit headers", async () => {
    fetchMock.respondJson("ok");
    await makeClient({ type: "bearer" }).ping();
    expect(headersOf(fetchMock.firstCall())["authorization"]).toBeUndefined();
  });

  test("QA-HP-HDR merge order", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      auth: { type: "bearer", token: "t" },
      headers: { authorization: "override", "x-a": "1" },
      endpoints: {
        ping: {
          method: "GET",
          path: "/p",
          response: "string",
          headers: { "x-a": "2", "x-b": "e" },
        },
      },
    });
    await client.ping({ headers: { "x-b": "call" } });
    const h = headersOf(fetchMock.firstCall());
    expect(h["authorization"]).toBe("override");
    expect(h["content-type"]).toBe("application/json");
    expect(h["x-a"]).toBe("2");
    expect(h["x-b"]).toBe("call");
  });
});

describe("QA-HP URL & HTTP methods", () => {
  const makeClient = <const P extends ValidPath>(path: P) =>
    defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path, response: "string" } },
    });

  test("QA-HP-URL bracket substitution and encoding", async () => {
    fetchMock.respondJson("ok");
    await makeClient("/users/:id[string]").ep({ params: { id: "42" } });
    expect(fetchMock.firstCall().url).toBe("https://api.test/users/42");
    fetchMock.calls.length = 0;
    await makeClient("/users/:id[string]").ep({ params: { id: "a b" } });
    expect(fetchMock.firstCall().url).toContain("a%20b");
  });

  test("QA-HP-URL query and trailing slash baseUrl", async () => {
    fetchMock.respondJson("ok");
    await makeClient("/items").ep({ query: { a: "1", b: "2" } });
    const u = new URL(fetchMock.firstCall().url);
    expect(u.searchParams.get("a")).toBe("1");
    expect(u.searchParams.get("b")).toBe("2");
    fetchMock.calls.length = 0;
    const cSlash = defineClient({
      baseUrl: "https://api.test/",
      endpoints: { ep: { method: "GET", path: "/x", response: "string" } },
    });
    await cSlash.ep();
    const urlSlash = fetchMock.firstCall().url;
    fetchMock.calls.length = 0;
    const cNo = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/x", response: "string" } },
    });
    await cNo.ep();
    expect(fetchMock.firstCall().url).toBe(urlSlash);
    expect(urlSlash).toBe("https://api.test/x");
  });

  test("QA-HP-METHODS PUT PATCH DELETE", async () => {
    fetchMock.respondJson({ ok: true });
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: {
        u: {
          method: "PUT",
          path: "/r",
          response: { type: "object", properties: { ok: "boolean" } },
          body: { type: "object", properties: { x: "string" } },
        },
        p: {
          method: "PATCH",
          path: "/r",
          response: { type: "object", properties: { ok: "boolean" } },
          body: { type: "object", properties: { x: "string" } },
        },
        d: { method: "DELETE", path: "/r/:id[string]", response: "string" },
      },
    });
    await client.u({ body: { x: "1" } });
    expect(fetchMock.lastCall().init.method).toBe("PUT");
    await client.p({ body: { x: "2" } });
    expect(fetchMock.lastCall().init.method).toBe("PATCH");
    await client.d({ params: { id: "9" } });
    expect(fetchMock.lastCall().init.method).toBe("DELETE");
  });
});

describe("QA-HP body, response, queryParams", () => {
  test("QA-HP-BODY stringify and validation", async () => {
    fetchMock.respondJson("done");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: {
        c: {
          method: "POST",
          path: "/c",
          response: "string",
          body: { type: "object", properties: { name: "string" } },
        },
      },
    });
    await client.c({ body: { name: "Ada" } });
    expect(fetchMock.firstCall().init.body).toBe('{"name":"Ada"}');
    let called = false;
    fetchMock.respondWith(() => {
      called = true;
      return new Response("{}", { status: 200 });
    });
    const bad = await client.c({ body: { name: 1 } as unknown as { name: string } });
    expect(bad).toEqual({
      ok: false,
      error: { type: "validation", message: "Request body failed schema validation" },
    });
    expect(called).toBe(false);
  });

  test("QA-HP-RESP validation and http error", async () => {
    fetchMock.respondJson({ id: 1 });
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: {
        g: {
          method: "GET",
          path: "/g",
          response: { type: "object", properties: { id: "number" } },
        },
      },
    });
    expect(await client.g()).toEqual({ ok: true, value: { id: 1 } });
    fetchMock.respondJson({ id: "nope" });
    const r = await client.g();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("validation");
    fetchMock.respondError(404, "Nope");
    const r2 = await client.g();
    expect(r2).toEqual({
      ok: false,
      error: { type: "http", status: 404, message: "Nope" },
    });
  });

  test("QA-HP-QP typed query validation and arrays", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: {
        s: {
          method: "GET",
          path: "/s",
          response: "string",
          // @ts-expect-error Published `EndpointDef` inference sets `queryParams` to `undefined` for some method paths; runtime accepts this (see tests/client.test.ts DC-QP-*).
          queryParams: {
            q: { type: "string", required: true },
            id: { type: "array", items: "string", required: true },
          },
        },
      },
    });
    await (client.s as (o: { query: Record<string, unknown> }) => Promise<RuxResult<string>>)({
      query: { q: "hi", id: ["a", "b"], extra: "x" },
    });
    const u = new URL(fetchMock.firstCall().url);
    expect(u.searchParams.get("q")).toBe("hi");
    expect(u.searchParams.getAll("id")).toEqual(["a", "b"]);
    expect(u.searchParams.get("extra")).toBe("x");
    let fetchCalled = false;
    fetchMock.respondWith(() => {
      fetchCalled = true;
      return new Response('"x"', { status: 200 });
    });
    const bad = await (client.s as (o: { query: Record<string, unknown> }) => Promise<RuxResult<string>>)({
      query: { q: "x", id: "not-array" },
    });
    expect(bad).toEqual({
      ok: false,
      error: { type: "validation", message: "Query parameters failed schema validation" },
    });
    expect(fetchCalled).toBe(false);
  });
});

describe("QA-HP edges", () => {
  test("QA-HP-EDGE empty endpoints", () => {
    const c = defineClient({ baseUrl: "https://x", endpoints: {} });
    expect(Object.keys(c).length).toBe(0);
  });

  test("QA-HP-EDGE concurrent calls", async () => {
    let n = 0;
    fetchMock.respondWith(() => {
      n++;
      return new Response(JSON.stringify(`r${n}`), { status: 200 });
    });
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: {
        a: { method: "GET", path: "/a", response: "string" },
        b: { method: "GET", path: "/b", response: "string" },
      },
    });
    const [ra, rb] = await Promise.all([client.a(), client.b()]);
    expect(ra.ok && rb.ok).toBe(true);
    expect(fetchMock.calls.length).toBe(2);
  });

  test("QA-HP-EXP duplicate bracket param", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: {
        ep: {
          method: "GET",
          path: "/:id[string]/a/:id[string]",
          response: "string",
        },
      },
    });
    await client.ep({ params: { id: "7" } });
    expect(fetchMock.firstCall().url).toBe("https://api.test/7/a/7");
  });
});

// ---------------------------------------------------------------------------
// QA-ADV: adversarial / footguns
// ---------------------------------------------------------------------------

describe("QA-ADV path & URL", () => {
  test("QA-ADV-01: plain :id not substituted", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/users/:id", response: "string" } },
    });
    await (client.ep as (o: { params: { id: string } }) => Promise<RuxResult<string>>)({
      params: { id: "1" },
    });
    expect(fetchMock.firstCall().url).toContain("/users/:id");
  });

  test("QA-ADV-02: missing bracket param leaves literal in URL", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/u/:id[string]", response: "string" } },
    });
    await (client.ep as () => Promise<RuxResult<string>>)();
    expect(fetchMock.firstCall().url).toContain(":id[string]");
  });

  test("QA-ADV-03: invalid baseUrl rejects", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "not-a-valid-base-url",
      endpoints: { ep: { method: "GET", path: "/", response: "string" } },
    });
    await expect(client.ep()).rejects.toThrow();
  });

  test("QA-ADV-04: extra params keys ignored", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/:a[string]", response: "string" } },
    });
    await client.ep({ params: { a: "x", ghost: "y" } as { a: string; ghost: string } });
    expect(fetchMock.firstCall().url).toBe("https://api.test/x");
  });
});

describe("QA-ADV query serialization", () => {
  test("QA-ADV-Q01: nested object query value skipped", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/q", response: "string" } },
    });
    await (client.ep as (o: { query: Record<string, unknown> }) => Promise<RuxResult<string>>)({
      query: { a: 1, b: undefined, c: null, d: { nested: true } },
    });
    const u = new URL(fetchMock.firstCall().url);
    expect(u.searchParams.get("a")).toBe("1");
    expect(u.searchParams.has("b")).toBe(false);
    expect(u.searchParams.get("c")).toBe("");
    expect(u.searchParams.has("d")).toBe(false);
  });
});

describe("QA-ADV body & GET body", () => {
  test("QA-ADV-B01: circular body rejects", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "POST", path: "/p", response: "string" } },
    });
    const o: Record<string, unknown> = {};
    o.self = o;
    await expect(
      (client.ep as (x: { body: unknown }) => Promise<unknown>)({ body: o }),
    ).rejects.toThrow();
  });

  test("QA-ADV-B02: GET with body at runtime still sends body", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/g", response: "string" } },
    });
    await (client.ep as (o: { body: { x: number } }) => Promise<RuxResult<string>>)({
      body: { x: 1 },
    });
    expect(fetchMock.firstCall().init.body).toBe('{"x":1}');
    expect(fetchMock.firstCall().init.method).toBe("GET");
  });
});

describe("QA-ADV error modes & network", () => {
  test("QA-ADV-M01: bogus errorMode yields undefined", async () => {
    fetchMock.respondJson("ok");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/p", response: "string" } },
    });
    const v = await (client.ep as (o: { errorMode: string }) => Promise<unknown>)({
      errorMode: "bogus",
    });
    expect(v).toBe(undefined);
  });

  test("QA-ADV-N01: network non-Error", async () => {
    fetchMock.respondNetworkError("x");
    const client = defineClient({
      baseUrl: "https://api.test",
      endpoints: { ep: { method: "GET", path: "/p", response: "string" } },
    });
    const r = await client.ep();
    expect(r).toEqual({
      ok: false,
      error: { type: "network", message: "Network error", cause: "x" },
    });
  });
});

// ---------------------------------------------------------------------------
// QA-E2E: story client (mocked)
// ---------------------------------------------------------------------------

describe("QA-E2E story client", () => {
  test("QA-E2E-01: POST user path + body + nested response", async () => {
    const payload = {
      id: "u1",
      address: [{ street: "Main St", city: "NYC" }],
    };
    fetchMock.respondJson(payload);
    const api = defineClient({
      baseUrl: "https://api.example.com",
      endpoints: {
        getUser: {
          method: "POST",
          path: "/users/:id[string]",
          body: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          response: {
            type: "object",
            properties: {
              id: { type: "string" },
              address: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    street: { type: "string" },
                    city: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    });
    const user = await api.getUser({
      params: { id: "1" },
      body: { name: "John" },
      errorMode: "throw",
    });
    expect(user).toEqual(payload);
    const call = fetchMock.firstCall();
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBe(JSON.stringify({ name: "John" }));
    expect(call.url).toBe("https://api.example.com/users/1");
  });
});

// ---------------------------------------------------------------------------
// QA schema helpers (rux)
// ---------------------------------------------------------------------------

describe("QA schema validate / validateResponse / handleValidation", () => {
  const objSchema = {
    type: "object",
    properties: { name: "string", age: "number" },
  } as const;

  test("QA-SCH-01: validate primitives and unknown", () => {
    expect(validate("string", "a")).toBe(true);
    expect(validate("number", NaN)).toBe(true);
    expect(validate("unknown", undefined)).toBe(true);
    expect(validate("unknown", null)).toBe(false);
  });

  test("QA-SCH-02: validateResponse ok and fail", () => {
    const ok = validateResponse<Record<string, unknown>>(objSchema as Schema, { name: "A", age: 1 });
    expect(ok).toEqual({ ok: true, value: { name: "A", age: 1 } });
    const bad = validateResponse(objSchema as Schema, { name: "A" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.type).toBe("validation");
  });

  test("QA-SCH-03: handleValidation modes", () => {
    const schema = objSchema as Schema;
    const data = { name: "A", age: 2 };
    expect(handleValidation(schema, data, "result")).toEqual({
      ok: true,
      value: data,
    });
    expect(handleValidation<{ name: string; age: number }>(schema, data, "throw")).toEqual(data);
    expect(handleValidation(schema, { name: "A" }, "default", { name: "", age: 0 })).toEqual({
      name: "",
      age: 0,
    });
    expect(() => handleValidation(schema, { name: "A" }, "throw")).toThrow();
  });
});
