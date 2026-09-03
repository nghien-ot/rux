import { describe, expect, test } from "vitest";
import { validate } from "../src/index.ts";

type Issue = {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
};
type Result<Output> = { readonly value: Output } | { readonly issues: readonly Issue[] };

function syncSchema<Output>(validateValue: (value: unknown) => Result<Output>) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "rux-test",
      validate: validateValue,
    },
  };
}

function asyncSchema<Output>(validateValue: (value: unknown) => Promise<Result<Output>>) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "rux-test",
      validate: validateValue,
    },
  };
}

describe("Standard Schema v1 validation", () => {
  test("returns synchronous parsed output on success", async () => {
    const schema = syncSchema((value) => ({ value: String(value).trim().toUpperCase() }));
    await expect(validate(schema, "  hello ")).resolves.toEqual({ ok: true, value: "HELLO" });
  });

  test("normalizes synchronous issues into a validation failure", async () => {
    const issues: readonly Issue[] = [
      { message: "Expected string", path: ["name"] },
      { message: "Expected positive number", path: ["age"] },
    ];
    const schema = syncSchema(() => ({ issues }));
    await expect(validate(schema, { name: 1, age: -1 })).resolves.toEqual({
      ok: false,
      error: { type: "validation", message: "Expected string; Expected positive number", issues },
    });
  });

  test("awaits asynchronous validation and returns its parsed output", async () => {
    const schema = asyncSchema(async (value) => ({
      value: { id: Number((value as { id: string }).id) },
    }));
    await expect(validate(schema, { id: "42" })).resolves.toEqual({ ok: true, value: { id: 42 } });
  });

  test("awaits asynchronous issues and preserves paths", async () => {
    const issues: readonly Issue[] = [{ message: "Invalid token", path: ["token"] }];
    const schema = asyncSchema(async () => ({ issues }));
    await expect(validate(schema, { token: null })).resolves.toEqual({
      ok: false,
      error: { type: "validation", message: "Invalid token", issues },
    });
  });

  test("supports actual Zod schemas through their Standard Schema interface", async () => {
    const { z } = await import("zod");
    const schema = z.object({ input: z.string() }).transform(({ input }) => ({ output: input.trim() }));
    await expect(validate(schema, { input: " parsed " })).resolves.toEqual({
      ok: true,
      value: { output: "parsed" },
    });
  });

  test("normalizes actual Zod invalid input into a validation error with issues", async () => {
    const { z } = await import("zod");
    const schema = z.object({ input: z.string() });
    await expect(validate(schema, { input: 1 })).resolves.toEqual({
      ok: false,
      error: {
        type: "validation",
        message: "Invalid input: expected string, received number",
        issues: [{ message: "Invalid input: expected string, received number", path: ["input"] }],
      },
    });
  });

  test("preserves issue paths using Standard Schema path objects", async () => {
    const schema = syncSchema(() => ({ issues: [{ message: "invalid", path: [{ key: "value" }] }] }));
    const result = await validate(schema, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation");
      expect(result.error.issues).toEqual([{ message: "invalid", path: [{ key: "value" }] }]);
    }
  });
});
