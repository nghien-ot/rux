import type {
  InferOutput,
  StandardSchema,
  StandardSchemaIssue,
} from "./types.ts";
import type { RuxResult } from "../types/index.ts";

function validationFailure(issues: readonly StandardSchemaIssue[]): RuxResult<never> {
  return {
    ok: false,
    error: {
      type: "validation",
      message: issues.map((issue) => issue.message).join("; "),
      issues,
    },
  };
}

function normalizeIssues(
  issues: readonly StandardSchemaIssue[],
): readonly StandardSchemaIssue[] {
  return issues.map((issue) => (
    issue.path === undefined
      ? { message: issue.message }
      : { message: issue.message, path: issue.path }
  ));
}

/** Validates a value through the Standard Schema v1 protocol. */
export async function validate<S extends StandardSchema>(
  schema: S,
  value: unknown,
): Promise<RuxResult<InferOutput<S>>> {
  const result = await schema["~standard"].validate(value);

  if ("issues" in result) {
    return validationFailure(normalizeIssues(result.issues));
  }

  return { ok: true, value: result.value as InferOutput<S> };
}

export function validateResponse<S extends StandardSchema>(
  schema: S,
  value: unknown,
): Promise<RuxResult<InferOutput<S>>>;
export function validateResponse<Output>(
  schema: StandardSchema<unknown, Output>,
  value: unknown,
): Promise<RuxResult<Output>>;
export function validateResponse(
  schema: StandardSchema,
  value: unknown,
): Promise<RuxResult<unknown>> {
  return validate(schema, value);
}

export async function handleValidation<Output>(
  schema: StandardSchema<unknown, Output>,
  value: unknown,
  mode: "result",
): Promise<RuxResult<Output>>;
export async function handleValidation<Output>(
  schema: StandardSchema<unknown, Output>,
  value: unknown,
  mode: "throw",
): Promise<Output>;
export async function handleValidation<Output>(
  schema: StandardSchema<unknown, Output>,
  value: unknown,
  mode: "default",
  fallback: Output,
): Promise<Output>;
export async function handleValidation<Output>(
  schema: StandardSchema<unknown, Output>,
  value: unknown,
  mode: "result" | "throw" | "default",
  fallback?: Output,
): Promise<RuxResult<Output> | Output> {
  const result = await validate(schema, value);

  if (mode === "result") return result;
  if (result.ok) return result.value;
  if (mode === "throw") throw result.error;
  return fallback as Output;
}
