import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const packageName = "@nghien-ot/rux";

describe("published package surface", () => {
  test("resolves package exports to the ESM and CommonJS entrypoints", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      readonly main: string;
      readonly module: string;
      readonly types: string;
      readonly exports: Record<string, unknown>;
    };
    expect(packageJson.exports).toStrictEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
        require: "./dist/index.cjs",
      },
    });
    expect(packageJson.main).toBe("./dist/index.cjs");
    expect(packageJson.module).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");

    const esm = await import(packageName);
    const cjs = require(packageName) as Record<string, unknown>;
    expect(typeof esm.createClient).toBe("function");
    expect(typeof esm.validate).toBe("function");
    expect("defineClient" in esm).toBe(false);
    expect("handleValidation" in esm).toBe(false);
    expect("validateResponse" in esm).toBe(false);
    expect(typeof cjs.createClient).toBe("function");
    expect(typeof cjs.validate).toBe("function");
    expect("defineClient" in cjs).toBe(false);
    expect("handleValidation" in cjs).toBe(false);
    expect("validateResponse" in cjs).toBe(false);
  });

  test("does not include Zod runtime code in either published bundle", async () => {
    const esmBundle = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
    const cjsBundle = await readFile(new URL("../dist/index.cjs", import.meta.url), "utf8");
    expect(esmBundle.toLowerCase()).not.toContain("zod");
    expect(cjsBundle.toLowerCase()).not.toContain("zod");
  });
});
