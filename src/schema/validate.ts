import type { Schema } from "./types.ts";
import type { RuxResult } from "../types/index.ts";

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

function isNullable(schema: Schema): boolean {
  return typeof schema === "object" && "nullable" in schema && schema.nullable === true;
}

function isOptional(schema: Schema): boolean {
  return typeof schema === "object" && "optional" in schema && schema.optional === true;
}

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------

export function validate(schema: Schema, data: unknown): boolean {
  if (data === null) return isNullable(schema);

  if (schema === "string") return typeof data === "string";
  if (schema === "number") return typeof data === "number";
  if (schema === "boolean") return typeof data === "boolean";
  if (schema === "unknown") return true;

  if (schema.type === "object") {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!(key in obj) || obj[key] === undefined) {
        if (isOptional(propSchema as Schema)) continue;
        return false;
      }
      if (!validate(propSchema as Schema, obj[key])) return false;
    }
    return true;
  }

  if (schema.type === "array") {
    if (!Array.isArray(data)) return false;
    return data.every((item) => validate(schema.items as Schema, item));
  }

  return validate(schema.type as Schema, data);
}

// ---------------------------------------------------------------------------
// Validation → RuxResult
// ---------------------------------------------------------------------------

export function validateResponse<T>(
  schema: Schema,
  data: unknown,
): RuxResult<T> {
  if (validate(schema, data)) {
    return { ok: true, value: data as T };
  }

  return {
    ok: false,
    error: {
      type: "validation",
      message: buildValidationMessage(schema, data, ""),
    },
  };
}

// ---------------------------------------------------------------------------
// Mode-aware validation helper
// ---------------------------------------------------------------------------

export function handleValidation<T>(
  schema: Schema,
  data: unknown,
  mode: "result",
): RuxResult<T>;
export function handleValidation<T>(
  schema: Schema,
  data: unknown,
  mode: "throw",
): T;
export function handleValidation<T>(
  schema: Schema,
  data: unknown,
  mode: "default",
  fallback: T,
): T;
export function handleValidation<T>(
  schema: Schema,
  data: unknown,
  mode: "result" | "throw" | "default",
  fallback?: T,
): RuxResult<T> | T {
  const result = validateResponse<T>(schema, data);

  switch (mode) {
    case "result":
      return result;
    case "throw":
      if (!result.ok) throw result.error;
      return result.value;
    case "default":
      if (!result.ok) return fallback as T;
      return result.value;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildValidationMessage(
  schema: Schema,
  data: unknown,
  path: string,
): string {
  const at = path || "(root)";

  if (typeof schema === "string") {
    return `${at}: expected ${schema}, got ${typeof data}`;
  }

  if (data === null) {
    if (isNullable(schema)) return "";
    return `${at}: expected non-null value, got null`;
  }

  if (schema.type === "object") {
    if (typeof data !== "object" || data === null) {
      return `${at}: expected object, got ${data === null ? "null" : typeof data}`;
    }
    const obj = data as Record<string, unknown>;
    const errors: string[] = [];
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (!(key in obj) || obj[key] === undefined) {
        if (isOptional(propSchema as Schema)) continue;
        errors.push(`${fieldPath}: missing`);
      } else if (!validate(propSchema as Schema, obj[key])) {
        errors.push(
          buildValidationMessage(propSchema as Schema, obj[key], fieldPath),
        );
      }
    }
    return errors.join("; ");
  }

  if (schema.type === "array") {
    if (!Array.isArray(data)) {
      return `${at}: expected array, got ${typeof data}`;
    }
    const errors: string[] = [];
    for (let i = 0; i < data.length; i++) {
      if (!validate(schema.items as Schema, data[i])) {
        errors.push(
          buildValidationMessage(
            schema.items as Schema,
            data[i],
            `${path}[${i}]`,
          ),
        );
      }
    }
    return errors.join("; ");
  }

  return buildValidationMessage(schema.type as Schema, data, path);
}
