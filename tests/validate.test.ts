import { expect, test } from "vitest";
import { validate } from "../src/index.ts";

test("validation accepts a Standard Schema success result without changing output", async () => {
  const schema = {
    "~standard": {
      version: 1 as const,
      vendor: "validate-test",
      validate: (value: unknown) => ({ value }),
    },
  };
  await expect(validate(schema, { extra: true })).resolves.toEqual({ ok: true, value: { extra: true } });
});
test("validation reports an issue-only Standard Schema failure exactly", async () => {
  const schema = {
    "~standard": {
      version: 1 as const,
      vendor: "validate-test",
      validate: () => ({ issues: [{ message: "Required", path: ["id"] }] }),
    },
  };
  await expect(validate(schema, {})).resolves.toEqual({
    ok: false,
    error: { type: "validation", message: "Required", issues: [{ message: "Required", path: ["id"] }] },
  });
});
