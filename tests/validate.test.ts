import { describe, test, expect } from "vitest";
import { validate, validateResponse, handleValidation } from "../src/index.ts";
import type { Schema, RuxResult } from "../src/index.ts";

// ---------------------------------------------------------------------------
// 1. validate(schema, data)
// ---------------------------------------------------------------------------

describe("validate", () => {
  // -----------------------------------------------------------------------
  // 1.1 Primitive string schemas
  // -----------------------------------------------------------------------

  describe("primitive string schemas", () => {
    test("V-PRIM-01: string schema accepts a string", () => {
      expect(validate("string", "hello")).toBe(true);
    });

    test("V-PRIM-02: string schema rejects a number", () => {
      expect(validate("string", 42)).toBe(false);
    });

    test("V-PRIM-03: string schema rejects null", () => {
      expect(validate("string", null)).toBe(false);
    });

    test("V-PRIM-04: string schema rejects undefined", () => {
      expect(validate("string", undefined)).toBe(false);
    });

    test("V-PRIM-05: number schema accepts 0", () => {
      expect(validate("number", 0)).toBe(true);
    });

    test("V-PRIM-06: number schema accepts NaN", () => {
      expect(validate("number", NaN)).toBe(true);
    });

    test("V-PRIM-07: number schema rejects numeric string", () => {
      expect(validate("number", "42")).toBe(false);
    });

    test("V-PRIM-08: boolean schema accepts true", () => {
      expect(validate("boolean", true)).toBe(true);
    });

    test("V-PRIM-09: boolean schema accepts false", () => {
      expect(validate("boolean", false)).toBe(true);
    });

    test("V-PRIM-10: boolean schema rejects truthy number", () => {
      expect(validate("boolean", 1)).toBe(false);
    });

    test("V-PRIM-11: unknown schema accepts a string", () => {
      expect(validate("unknown", "anything")).toBe(true);
    });

    test("V-PRIM-12: unknown schema accepts an object", () => {
      expect(validate("unknown", { a: 1 })).toBe(true);
    });

    test("V-PRIM-13: unknown schema rejects null (null check runs first)", () => {
      expect(validate("unknown", null)).toBe(false);
    });

    test("V-PRIM-14: unknown schema accepts undefined", () => {
      expect(validate("unknown", undefined)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 1.2 PrimitiveObjectSchema
  // -----------------------------------------------------------------------

  describe("PrimitiveObjectSchema", () => {
    test("V-POBJ-01: { type: 'string' } accepts a string", () => {
      expect(validate({ type: "string" }, "ok")).toBe(true);
    });

    test("V-POBJ-02: { type: 'number', nullable: true } accepts null", () => {
      expect(validate({ type: "number", nullable: true }, null)).toBe(true);
    });

    test("V-POBJ-03: { type: 'number', nullable: true } accepts a number", () => {
      expect(validate({ type: "number", nullable: true }, 5)).toBe(true);
    });

    test("V-POBJ-04: { type: 'string', optional: true } rejects undefined at top level", () => {
      expect(validate({ type: "string", optional: true }, undefined)).toBe(false);
    });

    test("V-POBJ-05: { type: 'boolean', nullable: true } rejects non-boolean", () => {
      expect(validate({ type: "boolean", nullable: true }, "yes")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 1.3 ObjectSchema
  // -----------------------------------------------------------------------

  describe("ObjectSchema", () => {
    const personSchema: Schema = {
      type: "object",
      properties: { name: "string", age: "number" },
    } as const;

    test("V-OBJ-01: valid object with all required fields", () => {
      expect(validate(personSchema, { name: "Ada", age: 30 })).toBe(true);
    });

    test("V-OBJ-02: missing required field", () => {
      expect(validate(personSchema, { name: "Ada" })).toBe(false);
    });

    test("V-OBJ-03: extra keys are allowed", () => {
      expect(validate(personSchema, { name: "Ada", age: 30, extra: true })).toBe(true);
    });

    test("V-OBJ-04: field with wrong type", () => {
      expect(validate(personSchema, { name: 123, age: 30 })).toBe(false);
    });

    const withOptionalSchema: Schema = {
      type: "object",
      properties: {
        name: "string",
        bio: { type: "string", optional: true },
      },
    } as const;

    test("V-OBJ-05: optional field absent", () => {
      expect(validate(withOptionalSchema, { name: "Ada" })).toBe(true);
    });

    test("V-OBJ-06: optional field present but wrong type", () => {
      expect(validate(withOptionalSchema, { name: "Ada", bio: 42 })).toBe(false);
    });

    test("V-OBJ-07: optional field set to undefined treated as absent", () => {
      expect(validate(withOptionalSchema, { name: "Ada", bio: undefined })).toBe(true);
    });

    const nullableFieldSchema: Schema = {
      type: "object",
      properties: { value: { type: "number", nullable: true } },
    } as const;

    test("V-OBJ-08: nullable field with null value", () => {
      expect(validate(nullableFieldSchema, { value: null })).toBe(true);
    });

    test("V-OBJ-09: nullable field with valid value", () => {
      expect(validate(nullableFieldSchema, { value: 7 })).toBe(true);
    });

    test("V-OBJ-10: non-object input (string)", () => {
      expect(validate(personSchema, "not an object")).toBe(false);
    });

    test("V-OBJ-11: non-object input (null) on non-nullable schema", () => {
      expect(validate(personSchema, null)).toBe(false);
    });

    test("V-OBJ-12: nullable object schema with null", () => {
      const s: Schema = {
        type: "object",
        properties: { x: "number" },
        nullable: true,
      } as const;
      expect(validate(s, null)).toBe(true);
    });

    test("V-OBJ-13: nested object - valid", () => {
      const s: Schema = {
        type: "object",
        properties: {
          nested: { type: "object", properties: { id: "number" } },
        },
      } as const;
      expect(validate(s, { nested: { id: 1 } })).toBe(true);
    });

    test("V-OBJ-13: nested object - invalid", () => {
      const s: Schema = {
        type: "object",
        properties: {
          nested: { type: "object", properties: { id: "number" } },
        },
      } as const;
      expect(validate(s, { nested: { id: "no" } })).toBe(false);
    });

    test("V-OBJ-14: empty object schema accepts empty object", () => {
      const s: Schema = { type: "object", properties: {} } as const;
      expect(validate(s, {})).toBe(true);
    });

    test("V-OBJ-15: empty object schema accepts object with extra keys", () => {
      const s: Schema = { type: "object", properties: {} } as const;
      expect(validate(s, { a: 1 })).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 1.4 ArraySchema
  // -----------------------------------------------------------------------

  describe("ArraySchema", () => {
    const stringArraySchema: Schema = { type: "array", items: "string" } as const;

    test("V-ARR-01: valid array of strings", () => {
      expect(validate(stringArraySchema, ["a", "b"])).toBe(true);
    });

    test("V-ARR-02: empty array", () => {
      expect(validate(stringArraySchema, [])).toBe(true);
    });

    test("V-ARR-03: array with wrong element type", () => {
      expect(validate(stringArraySchema, ["a", 1])).toBe(false);
    });

    test("V-ARR-04: non-array input", () => {
      expect(validate(stringArraySchema, "not-an-array")).toBe(false);
    });

    test("V-ARR-05: array of objects - valid", () => {
      const s: Schema = {
        type: "array",
        items: { type: "object", properties: { id: "number" } },
      } as const;
      expect(validate(s, [{ id: 1 }, { id: 2 }])).toBe(true);
    });

    test("V-ARR-06: array of objects with invalid element", () => {
      const s: Schema = {
        type: "array",
        items: { type: "object", properties: { id: "number" } },
      } as const;
      expect(validate(s, [{ id: 1 }, { id: "x" }])).toBe(false);
    });

    test("V-ARR-07: nullable array with null", () => {
      const s: Schema = { type: "array", items: "number", nullable: true } as const;
      expect(validate(s, null)).toBe(true);
    });

    test("V-ARR-08: nested arrays", () => {
      const s: Schema = {
        type: "array",
        items: { type: "array", items: "number" },
      } as const;
      expect(validate(s, [[1, 2], [3]])).toBe(true);
    });

    test("V-ARR-09: null inside non-nullable array items", () => {
      const s: Schema = { type: "array", items: "number" } as const;
      expect(validate(s, [1, null, 3])).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. validateResponse(schema, data)
// ---------------------------------------------------------------------------

describe("validateResponse", () => {
  test("VR-01: valid data returns { ok: true, value }", () => {
    const result = validateResponse("string", "hello");
    expect(result).toEqual({ ok: true, value: "hello" });
  });

  test("VR-02: invalid data returns validation error with message", () => {
    const result = validateResponse("number", "nope");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("validation");
      expect(result.error.message).toContain("(root)");
      expect(result.error.message).toContain("expected number");
      expect(result.error.message).toContain("got string");
    }
  });

  test("VR-03: nested object failure includes field path", () => {
    const schema: Schema = {
      type: "object",
      properties: {
        user: { type: "object", properties: { name: "string" } },
      },
    } as const;
    const result = validateResponse(schema, { user: { name: 42 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("user.name");
    }
  });

  test("VR-04: array failure includes index in message", () => {
    const schema: Schema = { type: "array", items: "number" } as const;
    const result = validateResponse(schema, [1, "bad"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("[1]");
    }
  });

  test("VR-05: missing required field message says 'missing'", () => {
    const schema: Schema = {
      type: "object",
      properties: { id: "number" },
    } as const;
    const result = validateResponse(schema, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("id: missing");
    }
  });

  test("VR-06: multiple errors joined by semicolons", () => {
    const schema: Schema = {
      type: "object",
      properties: { a: "string", b: "number" },
    } as const;
    const result = validateResponse(schema, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("; ");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. handleValidation(schema, data, mode, fallback?)
// ---------------------------------------------------------------------------

describe("handleValidation", () => {
  test("HV-01: mode 'result', valid -> { ok: true }", () => {
    const result = handleValidation<string>("string", "hello", "result");
    expect(result).toEqual({ ok: true, value: "hello" });
  });

  test("HV-02: mode 'result', invalid -> { ok: false }", () => {
    const result = handleValidation<number>("number", "wrong", "result");
    expect((result as RuxResult<number>).ok).toBe(false);
  });

  test("HV-03: mode 'throw', valid -> returns unwrapped value", () => {
    const value = handleValidation<string>("string", "hello", "throw");
    expect(value).toBe("hello");
  });

  test("HV-04: mode 'throw', invalid -> throws RuxError (not Error instance)", () => {
    expect(() => handleValidation<number>("number", "wrong", "throw")).toThrow();
    try {
      handleValidation<number>("number", "wrong", "throw");
    } catch (e: unknown) {
      expect(e).not.toBeInstanceOf(Error);
      const err = e as { type: string; message: string };
      expect(err.type).toBe("validation");
      expect(typeof err.message).toBe("string");
    }
  });

  test("HV-05: mode 'default', valid -> returns value", () => {
    const value = handleValidation<string>("string", "hello", "default", "fallback");
    expect(value).toBe("hello");
  });

  test("HV-06: mode 'default', invalid -> returns fallback", () => {
    const value = handleValidation<string>("string", 42, "default", "fallback");
    expect(value).toBe("fallback");
  });
});

// ---------------------------------------------------------------------------
// 8. buildValidationMessage (tested indirectly via validateResponse)
// ---------------------------------------------------------------------------

describe("buildValidationMessage (indirect)", () => {
  test("BVM-01: primitive mismatch -> '(root): expected string, got number'", () => {
    const r = validateResponse("string", 42);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe("(root): expected string, got number");
    }
  });

  test("BVM-02: nested path appears as 'parent.child'", () => {
    const s: Schema = {
      type: "object",
      properties: {
        parent: { type: "object", properties: { child: "number" } },
      },
    } as const;
    const r = validateResponse(s, { parent: { child: "wrong" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("parent.child");
    }
  });

  test("BVM-03: array index path appears as '[0]'", () => {
    const s: Schema = { type: "array", items: "number" } as const;
    const r = validateResponse(s, ["bad"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("[0]");
    }
  });

  test("BVM-04: null on non-nullable -> mentions 'non-null'", () => {
    const s: Schema = { type: "object", properties: { x: "number" } } as const;
    const r = validateResponse(s, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("expected non-null value, got null");
    }
  });

  test("BVM-05: object receives non-object -> 'expected object, got string'", () => {
    const s: Schema = { type: "object", properties: {} } as const;
    const r = validateResponse(s, "hello");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("expected object, got string");
    }
  });

  test("BVM-06: array receives non-array -> 'expected array, got object'", () => {
    const s: Schema = { type: "array", items: "number" } as const;
    const r = validateResponse(s, { not: "array" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("expected array, got object");
    }
  });

  test("BVM-07: multiple failures joined by '; '", () => {
    const s: Schema = {
      type: "object",
      properties: { a: "string", b: "number", c: "boolean" },
    } as const;
    const r = validateResponse(s, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const parts = r.error.message.split("; ");
      expect(parts.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Exploratory / Edge Cases (validate-related)
// ---------------------------------------------------------------------------

describe("exploratory (validate)", () => {
  test("EXP-01: 'unknown' schema with null returns false", () => {
    expect(validate("unknown", null)).toBe(false);
  });

  test("EXP-02: { type: 'unknown' } without nullable rejects null", () => {
    expect(validate({ type: "unknown" }, null)).toBe(false);
  });

  test("EXP-03: { type: 'unknown', nullable: true } accepts null", () => {
    expect(validate({ type: "unknown", nullable: true }, null)).toBe(true);
  });

  test("EXP-04: deeply nested validation message paths (a.b.c.d)", () => {
    const s: Schema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: {
                  type: "object",
                  properties: { d: "number" },
                },
              },
            },
          },
        },
      },
    } as const;
    const r = validateResponse(s, { a: { b: { c: { d: "wrong" } } } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("a.b.c.d");
    }
  });

  test("EXP-05: array inside object inside array validation paths", () => {
    const s: Schema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          tags: { type: "array", items: "string" },
        },
      },
    } as const;
    const r = validateResponse(s, [{ tags: ["ok", 42] }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("[0]");
      expect(r.error.message).toContain("tags");
    }
  });

  test("EXP-08: body: null on POST with nullable body schema", () => {
    const s: Schema = {
      type: "object",
      properties: { name: "string" },
      nullable: true,
    } as const;
    expect(validate(s, null)).toBe(true);
  });

  test("EXP-09: handleValidation 'throw' throws plain object, not Error", () => {
    try {
      handleValidation<number>("number", "wrong", "throw");
    } catch (e) {
      expect(e).not.toBeInstanceOf(Error);
      expect(typeof (e as any).type).toBe("string");
      expect(typeof (e as any).message).toBe("string");
    }
  });

  test("EXP-14: object property exists but is undefined -> treated as missing", () => {
    const s: Schema = {
      type: "object",
      properties: { name: "string" },
    } as const;
    expect(validate(s, { name: undefined })).toBe(false);
  });

  test("EXP-15: PrimitiveObjectSchema with both optional and nullable", () => {
    const s: Schema = { type: "string", optional: true, nullable: true } as const;
    expect(validate(s, null)).toBe(true);
    expect(validate(s, "hello")).toBe(true);
    expect(validate(s, undefined)).toBe(false);
    expect(validate(s, 42)).toBe(false);
  });
});
