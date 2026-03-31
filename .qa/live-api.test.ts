/**
 * Live network smoke (optional). Set RUN_LIVE_API=1 before running.
 * `bun test` includes this file but skips tests when the env var is unset.
 */
import { describe, test, expect } from "bun:test";
import { defineClient } from "rux";

const runLive = process.env.RUN_LIVE_API === "1";

describe.skipIf(!runLive)("QA live — public HTTP APIs", () => {
  test("QA-LIVE-01: JSONPlaceholder GET /users/1", async () => {
    const client = defineClient({
      baseUrl: "https://jsonplaceholder.typicode.com",
      endpoints: {
        getUser: {
          method: "GET",
          path: "/users/:id[number]",
          response: {
            type: "object",
            properties: {
              id: "number",
              name: "string",
              username: "string",
              email: "string",
            },
          },
        },
      },
    });
    const result = await client.getUser({ params: { id: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(1);
      expect(typeof result.value.email).toBe("string");
    }
  });

  test("QA-LIVE-02: JSONPlaceholder POST /posts", async () => {
    const client = defineClient({
      baseUrl: "https://jsonplaceholder.typicode.com",
      endpoints: {
        createPost: {
          method: "POST",
          path: "/posts",
          body: {
            type: "object",
            properties: {
              title: "string",
              body: "string",
              userId: "number",
            },
          },
          response: {
            type: "object",
            properties: {
              id: "number",
              title: "string",
              body: "string",
              userId: "number",
            },
          },
        },
      },
    });
    const result = await client.createPost({
      body: { title: "rux-live", body: "test", userId: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("rux-live");
      expect(typeof result.value.id).toBe("number");
    }
  });

  test("QA-LIVE-03: HTTPBin GET /get echoes query", async () => {
    const client = defineClient({
      baseUrl: "https://httpbin.org",
      endpoints: {
        echo: {
          method: "GET",
          path: "/get",
          response: "unknown",
        },
      },
    });
    const result = await client.echo({ query: { foo: "bar", rux: "1" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const v = result.value as { args?: Record<string, string> };
      expect(v.args?.foo).toBe("bar");
      expect(v.args?.rux).toBe("1");
    }
  });

  test("QA-LIVE-04: HTTPBin /status/404 → http error", async () => {
    const client = defineClient({
      baseUrl: "https://httpbin.org",
      endpoints: {
        missing: { method: "GET", path: "/status/404", response: "string" },
      },
    });
    const result = await client.missing();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("http");
      expect(result.error.status).toBe(404);
    }
  });
});
