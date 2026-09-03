import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);

describe("published package surface", () => {
  test("loads the ESM entrypoint with the v1 factory", async () => {
    const esm = await import(new URL("../dist/index.js", import.meta.url).href);
    expect(typeof esm.createClient).toBe("function");
    expect("defineClient" in esm).toBe(false);
  });

  test("loads the CommonJS entrypoint with the same public v1 factory", async () => {
    const cjs = require("../dist/index.cjs") as Record<string, unknown>;
    expect(typeof cjs.createClient).toBe("function");
    expect("defineClient" in cjs).toBe(false);
  });

  test("does not include Zod runtime code in the ESM bundle", async () => {
    const bundle = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
    expect(bundle).not.toMatch(/(?:from|require\s*\()\s*["']zod["']/);
    expect(bundle).not.toMatch(/node_modules[\\/]zod/);
  });
});
